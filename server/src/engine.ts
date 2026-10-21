import { daysBetween, eachDay, todayIn } from './dates';
import { SourceUnavailableError } from './http';
import { settings } from './config';
import { type Db, kvGet, kvSet, nowIso } from './db';
import { intervalsFor, NEVER, priorityFor, tournamentPhase, type Phase } from './policy';
import { createPlayer, findByNameLoose, listPlayers, updatePlayer, type Player } from './roster';
import { nameTokens } from './text';
import { titleCase } from './rankingParse';
import { isUvaClub } from './uva';
import type { OfficialSource } from './source';
import { transformCalendar } from './calendar';
import { estimate, type Slot } from './estimate';
import type { MatchRow } from './model';
import { buildStoredMatch, type ClubEntrants, diffMatch, findClubEntrants, matchFingerprint, type EntrantLike, type StoredMatch } from './uva';

const DEFAULT_TZ = 'Europe/Madrid';

export type JobKind = 'roster' | 'discover' | 'info' | 'draws' | 'day' | 'calendar';

/** Qué puede hacer el motor: el calendario usa solo rutas permitidas; lo «en directo» exige activarlo expresamente. */
export interface Features {
  live: boolean;
  calendar: boolean;
}
export interface Job {
  key: string;
  kind: JobKind;
  guid?: string;
  date?: string;
  phase: Phase;
  /** Cuándo toca (ms). */
  due: number;
  /** 0 = más urgente. */
  rank: number;
}

interface TournamentRow {
  guid: string; name: string; start_date: string | null; end_date: string | null; tz: string; days_json: string;
  info_ok_at: string | null; draws_ok_at: string | null; hidden: number;
}

/** Jugador de la lista cuyo nombre (p. ej. «Pablo Martín») está contenido en el del ranking («Pablo Martín Castañeda»). */
const matchRoster = (roster: Player[], rankingName: string): Player | undefined => {
  const full = new Set(nameTokens(rankingName));
  return roster.find((p) => {
    const t = nameTokens(p.name);
    return t.length >= 2 && t.every((x) => full.has(x));
  });
};

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : 0);

/**
 * Motor de sincronización. Cada «tick» (5 s) decide, según la fase de cada torneo, qué toca leer y ejecuta
 * como máximo UNA lectura lógica. Lee una vez por torneo (no una por jugador) y solo guarda partidos con
 * jugadores del club. Si la fuente falla se conservan los últimos datos; nunca se inventa nada.
 */
export class SyncEngine {
  private retry = new Map<string, { until: number; n: number }>();
  private pausedUntil = 0;
  /** Última actividad, para el panel de administración. */
  lastJob?: { key: string; at: string; ok: boolean; error?: string };

  constructor(
    private db: Db,
    private src: OfficialSource,
    private clock: () => Date = () => new Date(),
    private features: Features = { live: true, calendar: false },
  ) {}

  /* ---------------------------------------------------------------- */
  /* Planificación                                                     */
  /* ---------------------------------------------------------------- */

  plan(now = this.clock()): Job[] {
    const jobs: Job[] = [];
    const nowMs = now.getTime();
    const today = todayIn(DEFAULT_TZ, now);

    if (this.features.calendar) {
      const lastCal = ms(kvGet<{ at: string }>(this.db, 'calendar_ok')?.at);
      jobs.push({ key: 'calendar', kind: 'calendar', phase: 'far', due: lastCal + settings.calendarHours * 3600_000, rank: 5 });
    }
    if (!this.features.live) return this.due(jobs, nowMs);

    if (this.src.rankingPlayers && settings.rankingUrls.length > 0) {
      const last = ms(kvGet<{ at: string }>(this.db, 'roster_ok')?.at);
      jobs.push({ key: 'roster', kind: 'roster', phase: 'far', due: last + settings.autoRosterHours * 3600_000, rank: 3 });
    }
    const rostered = listPlayers(this.db).filter((p) => p.profileGuid);
    if (rostered.length > 0) {
      const last = ms(kvGet<{ at: string }>(this.db, 'discover_ok')?.at);
      jobs.push({ key: 'discover', kind: 'discover', phase: 'far', due: last + settings.intervals.discovery, rank: 4 });
    }

    const rows = this.db.prepare('select * from tournaments where hidden = 0 and manual = 0').all() as unknown as TournamentRow[];
    for (const t of rows) {
      if (t.name && settings.excludedTournaments.test(t.name)) {
        this.db.prepare('update tournaments set hidden = 1 where guid = ?').run(t.guid);
        continue;
      }
      const phase = tournamentPhase({ startDate: t.start_date, endDate: t.end_date }, today);
      const iv = intervalsFor(phase);
      // Lo más cercano primero: tras un reinicio, los torneos de esta semana se leen antes que el resto.
      const soonDays = t.start_date ? daysBetween(today, t.start_date) : 99;
      const infoDue = t.info_ok_at ? ms(t.info_ok_at) + iv.info : 0;
      // Sin información básica (fechas) no se sabe en qué fase está: se lee ya.
      jobs.push({ key: `info:${t.guid}`, kind: 'info', guid: t.guid, phase, due: infoDue, rank: phase === 'live' ? 2 : 3 });
      if (!t.info_ok_at || phase === 'past') continue;
      // La primera lectura de cuadros va antes que el orden de juego: de ahí sale quién es del club.
      const hasDraws = (this.db.prepare('select count(*) n from draws where tournament_guid = ?').get(t.guid) as unknown as { n: number }).n > 0;
      const linked = (this.db.prepare('select count(*) n from tournament_players where tournament_guid = ?').get(t.guid) as unknown as { n: number }).n > 0;
      // Torneos seguidos solo por el calendario (aún sin nadie del club identificado): se revisan cada pocas horas.
      const drawsEvery = !linked && (phase === 'far' || phase === 'soon') ? Math.max(iv.draws, settings.followRefreshMinutes) : iv.draws;
      jobs.push({ key: `draws:${t.guid}`, kind: 'draws', guid: t.guid, phase, due: t.draws_ok_at && hasDraws ? ms(t.draws_ok_at) + drawsEvery : 0, rank: !t.draws_ok_at ? (soonDays <= 7 ? -3 : -1) : phase === 'live' ? 1 : 3 });

      if (phase === 'live' || phase === 'recent' || phase === 'imminent' || phase === 'soon') {
        const days: string[] = JSON.parse(t.days_json);
        const wanted =
          phase === 'live' ? days.filter((d) => d === today)
          : phase === 'soon' ? days.filter((d) => daysBetween(today, d) <= 3) // a más distancia aún no hay orden de juego
          : days;
        for (const date of wanted) {
          const k = `day:${t.guid}:${date}`;
          const lastOk = ms(kvGet<{ at: string }>(this.db, `ok:${k}`)?.at);
          jobs.push({ key: k, kind: 'day', guid: t.guid, date, phase, due: lastOk ? lastOk + iv.day : 0, rank: phase === 'live' ? 0 : phase === 'recent' ? 2 : 1 });
        }
      }
    }

    return this.due(jobs, nowMs);
  }

  private due(jobs: Job[], nowMs: number): Job[] {
    return jobs
      .filter((j) => Number.isFinite(j.due) && j.due <= nowMs && (this.retry.get(j.key)?.until ?? 0) <= nowMs)
      .sort((a, b) => a.rank - b.rank || a.due - b.due);
  }

  private relinked = false;

  /**
   * Vuelve a asociar a los participantes ya guardados con la lista del club (por si la lista cambió o el nombre corto del torneo
   * no coincidía con el completo) y completa el identificador en los partidos guardados. No hace peticiones.
   */
  relinkEntrants() {
    const roster = listPlayers(this.db);
    const link = this.db.prepare('insert or ignore into tournament_players(tournament_guid, player_id) values(?, ?)');
    const rows = this.db.prepare('select tournament_guid g, ts_player_id id, name, club, player_id pid from entrants').all() as unknown as { g: string; id: number; name: string; club: string | null; pid: number | null }[];
    const set = this.db.prepare('update entrants set player_id = ? where tournament_guid = ? and ts_player_id = ?');
    for (const r of rows) {
      if (r.pid || (r.club && !isUvaClub(r.club))) continue;
      const p = findByNameLoose(roster, r.name);
      if (!p) continue;
      set.run(p.id, r.g, r.id);
      link.run(r.g, p.id);
    }
    const byTournament = new Map<string, Map<number, number>>();
    for (const r of this.db.prepare('select tournament_guid g, ts_player_id id, player_id pid from entrants where player_id is not null').all() as unknown as { g: string; id: number; pid: number }[]) {
      (byTournament.get(r.g) ?? byTournament.set(r.g, new Map()).get(r.g)!).set(r.id, r.pid);
    }
    const upd = this.db.prepare('update matches set json = ? where key = ?');
    for (const [g, map] of byTournament) {
      for (const m of this.db.prepare('select key, json from matches where tournament_guid = ?').all(g) as unknown as { key: string; json: string }[]) {
        const stored = JSON.parse(m.json) as StoredMatch;
        let changed = false;
        for (const side of stored.sides) for (const pl of side.players) {
          const pid = pl.tsPlayerId !== undefined ? map.get(pl.tsPlayerId) : undefined;
          if (pl.uva && pl.rosterId === undefined && pid !== undefined) { pl.rosterId = pid; changed = true; }
        }
        if (changed) upd.run(JSON.stringify(stored), m.key);
      }
    }
  }

  /** Estado interno para diagnóstico (sin datos personales). */
  diagnose(now = this.clock()) {
    const http = (this.src as unknown as { http?: { stats?: () => unknown } }).http?.stats?.();
    return {
      next: this.plan(now).slice(0, 3).map((j) => ({ job: j.kind, rank: j.rank })),
      pausedUntil: this.pausedUntil > now.getTime() ? new Date(this.pausedUntil).toISOString() : null,
      retrying: [...this.retry.entries()].map(([k, v]) => ({ job: k.split(':')[0], n: v.n, until: new Date(v.until).toISOString() })),
      http,
      tournaments: (this.db.prepare('select substr(name,1,40) n, start_date d, info_ok_at i, draws_ok_at dr, last_error e, (select count(*) from draws x where x.tournament_guid = t.guid) c, (select coalesce(sum(length(json)),0) from draws x where x.tournament_guid = t.guid) jl, (select count(*) from entrants x where x.tournament_guid = t.guid) en, (select count(*) from matches x where x.tournament_guid = t.guid) pm from tournaments t where hidden = 0 order by start_date').all() as unknown as Record<string, unknown>[]),
    };
  }

  /** Ejecuta, como máximo, una lectura. Devuelve la clave del trabajo ejecutado. */
  async tick(now = this.clock()): Promise<string | undefined> {
    if (now.getTime() < this.pausedUntil) return undefined;
    if (!this.relinked) {
      this.relinked = true;
      try {
        this.relinkEntrants();
        // Las estimaciones guardadas pueden venir de una versión anterior: se recalculan con lo ya guardado (sin peticiones).
        for (const r of this.db.prepare('select distinct tournament_guid g, date d from slots').all() as unknown as { g: string; d: string }[]) this.recomputeEstimate(r.g, r.d, now);
      } catch (e) {
        console.error('relinkEntrants', e);
      }
    }
    const job = this.plan(now)[0];
    if (!job) return undefined;
    try {
      await this.run(job, now);
      this.retry.delete(job.key);
      this.lastJob = { key: job.key, at: nowIso(), ok: true };
    } catch (e) {
      const err = e as Error;
      if (e instanceof SourceUnavailableError) {
        this.pausedUntil = e.retryAt ?? now.getTime() + 5 * 60_000;
      } else {
        const n = (this.retry.get(job.key)?.n ?? 0) + 1;
        this.retry.set(job.key, { n, until: now.getTime() + Math.min(60 * 60_000, 60_000 * 2 ** n) });
      }
      if (job.guid) {
        this.db.prepare('update tournaments set last_error = ?, last_error_at = ? where guid = ?').run(err.message, nowIso(), job.guid);
      }
      kvSet(this.db, 'last_error', { at: nowIso(), job: job.key, message: err.message });
      this.lastJob = { key: job.key, at: nowIso(), ok: false, error: err.message };
    }
    return job.key;
  }

  private async run(job: Job, now: Date) {
    switch (job.kind) {
      case 'roster':
        return this.buildRoster(now);
      case 'discover':
        return this.discover(now);
      case 'info':
        return this.readInfo(job, now);
      case 'draws':
        return this.readDraws(job, now);
      case 'day':
        return this.readDay(job, now);
      case 'calendar':
        return this.readCalendar(now);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Trabajos                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Construye la lista del club sola: lee las categorías del ranking oficial, se queda con quienes figuran con el club de la UVa
   * y busca el enlace de su perfil. Quien ya está en la lista no se duplica. Los menores nunca se publican sin consentimiento familiar.
   */
  private async buildRoster(now: Date) {
    const found = new Map<string, { name: string; playerPath: string; birthYear?: number }>();
    for (const url of settings.rankingUrls) {
      for (const c of await this.src.rankingPlayers!(url, 2)) if (isUvaClub(c.club)) found.set(c.playerPath, c);
    }
    const today = now.toISOString().slice(0, 10);
    let created = 0;
    for (const c of found.values()) {
      const name = titleCase(c.name);
      const roster = listPlayers(this.db);
      const known = matchRoster(roster, name);
      if (known?.profileGuid) continue;
      const profile = await this.src.rankingProfile!(c.playerPath, 2);
      if (known) {
        if (profile) updatePlayer(this.db, known.id, { profile });
        continue;
      }
      const age = c.birthYear === undefined ? undefined : Number(today.slice(0, 4)) - c.birthYear;
      const isMinor = age !== undefined && age < 18;
      // Sin año de nacimiento no se puede descartar que sea menor: queda oculto hasta que la administración lo revise.
      const publish = settings.autoRosterConsent === 'declared' && age !== undefined && !isMinor;
      createPlayer(this.db, {
        name,
        profile: profile ?? null,
        isMinor,
        public: publish,
        consentBy: publish ? 'Declarado por la administración del club' : null,
        consentAt: publish ? today : null,
        notes: 'Añadido automáticamente desde el ranking oficial',
      });
      created++;
    }
    kvSet(this.db, 'roster_ok', { at: now.toISOString(), found: found.size, created });
    this.relinkEntrants();
  }

  /** Torneos de cada jugador de la lista, desde su perfil oficial. */
  private async discover(now: Date) {
    for (const p of listPlayers(this.db).filter((x) => x.profileGuid)) {
      const { tournamentIds } = await this.src.profile(p.profileGuid!, 2);
      for (const guid of tournamentIds) this.track(guid.toUpperCase(), p.id, now);
    }
    kvSet(this.db, 'discover_ok', { at: now.toISOString() });
  }

  /** Empieza a seguir un torneo (descubierto o añadido por el administrador) y lo vincula con un jugador. */
  track(guid: string, playerId: number | undefined, now = this.clock()) {
    this.db.prepare('insert or ignore into tournaments(guid, name, discovered_at) values(?, ?, ?)').run(guid, guid, now.toISOString());
    if (playerId) this.db.prepare('insert or ignore into tournament_players(tournament_guid, player_id) values(?, ?)').run(guid, playerId);
  }

  private async readInfo(job: Job, now: Date) {
    const info = await this.src.tournament(job.guid!, priorityFor(job.phase, 'info'));
    const days = info.days.length ? info.days : info.startDate ? eachDay(info.startDate, info.endDate ?? info.startDate) : [];
    this.db
      .prepare(
        `update tournaments set name=?, start_date=?, end_date=?, city=?, venue=?, level=?, tz=?, days_json=?, info_ok_at=?, last_error=null where guid=?`,
      )
      .run(info.name, info.startDate ?? null, info.endDate ?? info.startDate ?? null, info.city ?? null, info.venue ?? null, info.level ?? null, info.tz || DEFAULT_TZ, JSON.stringify(days), now.toISOString(), job.guid!);
  }

  /** Cuadros del torneo: solo para saber quién es del club (clasificaciones y cuadros muestran el club). */
  private async readDraws(job: Job, now: Date) {
    const guid = job.guid!;
    const p = priorityFor(job.phase, 'draws');
    const roster = listPlayers(this.db);
    const entrants: EntrantLike[] = [];
    const save = this.db.prepare(
      `insert into draws(tournament_guid, draw_id, name, type, json, updated_at) values(?,?,?,?,?,?)
       on conflict(tournament_guid, draw_id) do update set name=excluded.name, type=excluded.type, json=excluded.json, updated_at=excluded.updated_at`,
    );
    const drawList = await this.src.draws(guid, p);
    // Una lista vacía no es «leído»: o aún no se han publicado, o la fuente devolvió otra página. Se reintenta con espera creciente.
    if (drawList.length === 0) throw new Error('La lista de cuadros llegó vacía (sin publicar o página inesperada).'); // (las fuentes reales ya lanzan un error con detalle)
    for (const d of drawList) {
      if (d.type === 'roundrobin') {
        const rows = await this.src.standings(guid, d.drawId, p);
        for (const r of rows) entrants.push({ names: r.names, ids: r.ids, club: r.club });
        save.run(guid, d.drawId, d.name, d.type, JSON.stringify({ standings: rows }), now.toISOString());
      } else {
        const rounds = await this.src.bracket(guid, d.drawId, p);
        for (const round of rounds) {
          for (const m of round.matches) for (const e of [m.a, m.b]) entrants.push({ names: e.names, ids: e.ids, club: e.club });
        }
        save.run(guid, d.drawId, d.name, d.type, JSON.stringify({ rounds }), now.toISOString());
      }
    }
    this.saveEntrants(guid, entrants, roster, now);
    this.db.prepare('update tournaments set draws_ok_at = ?, last_error = null where guid = ?').run(now.toISOString(), guid);
  }

  saveEntrants(guid: string, entrants: EntrantLike[], roster: Player[], now: Date) {
    const up = this.db.prepare(
      `insert into entrants(tournament_guid, ts_player_id, name, club, player_id, seen_at) values(?,?,?,?,?,?)
       on conflict(tournament_guid, ts_player_id) do update set name=excluded.name, club=excluded.club, player_id=excluded.player_id, seen_at=excluded.seen_at`,
    );
    const link = this.db.prepare('insert or ignore into tournament_players(tournament_guid, player_id) values(?, ?)');
    for (const f of findClubEntrants(entrants, roster)) {
      up.run(guid, f.tsPlayerId, f.name, f.club ?? null, f.rosterId ?? null, now.toISOString());
      if (f.rosterId) link.run(guid, f.rosterId);
    }
    this.relinkEntrants();
  }

  /** Orden de juego de un día: se filtran los partidos de jugadores del club y se confirman los cambios. */
  private async readDay(job: Job, now: Date) {
    const guid = job.guid!;
    const t = this.db.prepare('select tz from tournaments where guid = ?').get(guid) as unknown as { tz: string };
    const rows = await this.src.day(guid, job.date!, t.tz || DEFAULT_TZ, priorityFor(job.phase, 'day'));
    const entrants: ClubEntrants = new Map(
      (this.db.prepare('select ts_player_id, player_id from entrants where tournament_guid = ?').all(guid) as unknown as { ts_player_id: number; player_id: number | null }[]).map((r) => [r.ts_player_id, r.player_id ?? undefined]),
    );
    const prevRead = kvGet<{ at: string }>(this.db, `ok:${job.key}`)?.at;
    for (const row of rows) {
      this.upsertSlot(guid, job.date!, row, now, prevRead);
      const m = buildStoredMatch(row, { tournamentGuid: guid, entrants });
      if (m) this.ingest(m, now);
    }
    kvSet(this.db, `ok:${job.key}`, { at: now.toISOString() });
    this.recomputeEstimate(guid, job.date!, now);
  }

  /** Datos anónimos de horario de TODOS los partidos del día (no solo los del club): base de la estimación. */
  private upsertSlot(guid: string, date: string, r: MatchRow, now: Date, prevRead?: string) {
    const iso = now.toISOString();
    const done = r.status === 'finished' || r.status === 'walkover' || r.status === 'retired';
    const row = this.db.prepare('select started_seen_at, finished_seen_at, duration_min from slots where key = ?').get(r.key) as unknown as
      | { started_seen_at: string | null; finished_seen_at: string | null; duration_min: number | null }
      | undefined;
    const started = row?.started_seen_at ?? (r.status === 'on_court' ? iso : null);
    const prev = row?.started_seen_at ? undefined : r.status === 'on_court' ? prevRead ?? iso : undefined;
    const finishedAt = row?.finished_seen_at ?? (done ? iso : null);
    this.db
      .prepare(
        `insert into slots(key, tournament_guid, date, planned_utc, order_idx, court, event, status, duration_min, started_seen_at, prev_poll_at, finished_seen_at, updated_at)
         values(?,?,?,?,?,?,?,?,?,?,?,?,?)
         on conflict(key) do update set planned_utc=excluded.planned_utc, order_idx=excluded.order_idx, court=excluded.court, status=excluded.status,
           duration_min=coalesce(excluded.duration_min, slots.duration_min),
           started_seen_at=coalesce(slots.started_seen_at, excluded.started_seen_at), prev_poll_at=coalesce(slots.prev_poll_at, excluded.prev_poll_at),
           finished_seen_at=coalesce(slots.finished_seen_at, excluded.finished_seen_at), updated_at=excluded.updated_at`,
      )
      .run(r.key, guid, date, r.plannedUtc ?? null, r.orderIndex ?? 0, r.court ?? null, r.eventCode ?? null, r.status, r.durationMin ?? row?.duration_min ?? null, started, prev ?? null, finishedAt, iso);
  }

  /** Recalcula la estimación del día y la guarda: hora de fin probable, ritmo, retraso y hora estimada de cada partido. */
  recomputeEstimate(guid: string, date: string, now: Date) {
    const rows = this.db.prepare('select * from slots where tournament_guid = ? and date = ?').all(guid, date) as unknown as Record<string, unknown>[];
    const slots: Slot[] = rows.map((r) => ({
      key: r.key as string, plannedUtc: (r.planned_utc as string) ?? undefined, orderIdx: r.order_idx as number, court: (r.court as string) ?? undefined,
      event: (r.event as string) ?? undefined, status: r.status as Slot['status'], durationMin: (r.duration_min as number) ?? undefined,
      startedSeenAt: (r.started_seen_at as string) ?? undefined, prevPollAt: (r.prev_poll_at as string) ?? undefined, finishedSeenAt: (r.finished_seen_at as string) ?? undefined,
    }));
    const est = estimate(slots, now, { defaultMatchMin: settings.defaultMatchMin, changeoverMin: settings.changeoverMin, simulations: 300 });
    kvSet(this.db, `estimate:${guid}`, { date, ...est }, now.toISOString());
    return est;
  }

  /** Calendario oficial de torneos absolutos (solo rutas permitidas). */
  private async readCalendar(now: Date) {
    const { fesba, finder } = await this.src.calendar(2);
    if (fesba.length === 0 && finder.length === 0) throw new Error('El calendario oficial devolvió 0 filas: se conserva el anterior.');
    kvSet(this.db, 'calendar', transformCalendar(fesba, finder, now.toISOString()), now.toISOString());
    kvSet(this.db, 'calendar_ok', { at: now.toISOString() });
    this.followCalendar(now);
  }

  /**
   * Sigue los torneos absolutos del calendario oficial que están cerca: se leen sus cuadros una vez (y de vez en cuando)
   * para saber quién del club juega, aunque aún no figuren en el perfil de nadie.
   */
  followCalendar(now: Date) {
    if (settings.followCalendarDays <= 0) return;
    const cal = kvGet<{ tournaments: { tsId?: string; name?: string; startDate?: string }[] }>(this.db, 'calendar');
    const today = todayIn(DEFAULT_TZ, now);
    for (const t of cal?.tournaments ?? []) {
      if (!t.tsId || !t.startDate || (t.name && settings.excludedTournaments.test(t.name))) continue;
      const d = daysBetween(today, t.startDate);
      if (d >= -3 && d <= settings.followCalendarDays) this.track(t.tsId, undefined, now);
    }
  }

  /**
   * Guarda un partido. Un partido nuevo se guarda tal cual; un cambio de hora, pista o resultado solo se
   * da por bueno tras `confirmReads` lecturas idénticas seguidas (la web oficial oscila entre servidores).
   */
  ingest(m: StoredMatch, now: Date): 'new' | 'same' | 'pending' | 'changed' {
    const iso = now.toISOString();
    const hash = matchFingerprint(m);
    const row = this.db.prepare('select json, hash, pending_hash, pending_count from matches where key = ?').get(m.key) as unknown as
      | { json: string; hash: string; pending_hash: string | null; pending_count: number }
      | undefined;

    if (!row) {
      this.db
        .prepare('insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values(?,?,?,?,?,?,?,?,?)')
        .run(m.key, m.tournamentGuid, m.date ?? null, JSON.stringify(m), hash, m.status, iso, iso, iso);
      this.log(m, 'new', undefined, undefined, m.status, iso);
      return 'new';
    }
    if (row.hash === hash) {
      this.db.prepare('update matches set last_seen_at = ?, pending_hash = null, pending_count = 0 where key = ?').run(iso, m.key);
      return 'same';
    }
    const count = row.pending_hash === hash ? row.pending_count + 1 : 1;
    if (count < settings.confirmReads) {
      this.db.prepare('update matches set pending_hash = ?, pending_count = ?, last_seen_at = ? where key = ?').run(hash, count, iso, m.key);
      return 'pending';
    }
    const before = JSON.parse(row.json) as StoredMatch;
    for (const d of diffMatch(before, m)) this.log(m, 'changed', d.field, d.old, d.new, iso);
    this.db
      .prepare('update matches set json = ?, hash = ?, state = ?, date = ?, pending_hash = null, pending_count = 0, updated_at = ?, last_seen_at = ? where key = ?')
      .run(JSON.stringify(m), hash, m.status, m.date ?? null, iso, iso, m.key);
    return 'changed';
  }

  private log(m: StoredMatch, kind: string, field: string | undefined, oldV: string | undefined, newV: string, at: string) {
    this.db
      .prepare('insert into changes(at, tournament_guid, match_key, kind, field, old_value, new_value) values(?,?,?,?,?,?,?)')
      .run(at, m.tournamentGuid, m.key, kind, field ?? null, oldV ?? null, newV);
  }

  /** Borra entradas antiguas del registro de cambios y de la bitácora de peticiones. */
  prune(now = this.clock()) {
    const cutoff = new Date(now.getTime() - settings.changeLogDays * 86_400_000).toISOString();
    this.db.prepare('delete from changes where at < ?').run(cutoff);
    this.db.prepare('delete from fetch_log where at < ?').run(new Date(now.getTime() - 7 * 86_400_000).toISOString());
  }
}

export { NEVER };
