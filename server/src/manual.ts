import { randomUUID } from 'node:crypto';
import { localToUtcIso, todayIn } from './dates';
import { type Db, kvGet, kvSet, nowIso } from './db';
import { settings } from './config';
import { estimateManual } from './estimate';
import { getPlayer, ValidationError } from './roster';
import { hashString } from './text';
import type { MatchStatus } from './model';
import type { Side, StoredMatch } from './uva';

/**
 * Introducción manual de torneos, partidos y resultados por el club (panel de administración). Alimenta exactamente las
 * mismas pantallas que la lectura automática: directo, próximos, resultados, hora estimada de fin, avisos y compartir.
 * Los datos manuales no se confunden con los de la fuente oficial: sus torneos llevan el prefijo `M-` y el motor no los lee.
 */

export interface ManualTournamentInput {
  name: string;
  startDate: string;
  endDate?: string | null;
  city?: string | null;
  venue?: string | null;
  playerIds?: number[];
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const touch = (db: Db, guid: string) => db.prepare('update tournaments set info_ok_at = ?, last_error = null where guid = ?').run(nowIso(), guid);

function requireManual(db: Db, guid: string) {
  const t = db.prepare('select manual from tournaments where guid = ?').get(guid) as { manual: number } | undefined;
  if (!t) throw new ValidationError('No existe ese torneo.');
  if (!t.manual) throw new ValidationError('Ese torneo viene de la fuente oficial: solo se pueden editar los torneos manuales (prefijo M-).');
}

export function createManualTournament(db: Db, input: ManualTournamentInput): string {
  const name = String(input.name ?? '').trim();
  if (name.length < 3) throw new ValidationError('Indica el nombre del torneo.');
  if (!isDate(input.startDate)) throw new ValidationError('La fecha de inicio debe ser AAAA-MM-DD.');
  if (input.endDate && (!isDate(input.endDate) || input.endDate < input.startDate)) throw new ValidationError('La fecha de fin no es válida.');
  const guid = `M-${hashString(`${name}|${input.startDate}|${randomUUID()}`).toUpperCase()}`;
  const now = nowIso();
  db.prepare(
    `insert into tournaments(guid, name, start_date, end_date, city, venue, days_json, discovered_at, info_ok_at, manual) values(?,?,?,?,?,?,?,?,?,1)`,
  ).run(guid, name, input.startDate, input.endDate || input.startDate, input.city || null, input.venue || null, '[]', now, now);
  for (const id of input.playerIds ?? []) {
    if (!getPlayer(db, id)) throw new ValidationError(`No existe el jugador ${id}.`);
    db.prepare('insert or ignore into tournament_players(tournament_guid, player_id) values(?, ?)').run(guid, id);
  }
  return guid;
}

export interface ManualMatchInput {
  tournamentId: string;
  /** Jugadores del club que juegan el partido (1 en individual, 2 en dobles). */
  playerIds: number[];
  opponent?: string | null;
  event?: string | null;
  round?: string | null;
  date?: string;
  /** Hora local (HH:MM). */
  time?: string | null;
  court?: string | null;
  state?: 'scheduled' | 'live' | 'finished';
  /** Sets desde el punto de vista de la UVa: «21-15 18-21 21-17». */
  score?: string | null;
  outcome?: 'win' | 'loss' | 'walkover' | null;
}

const parseSets = (score?: string | null): [number, number][] => {
  const out: [number, number][] = [];
  for (const tok of (score ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const m = tok.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) throw new ValidationError(`Set no válido: «${tok}». Usa el formato 21-15 18-21 21-17.`);
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
};

function build(db: Db, input: ManualMatchInput, key: string, prev?: StoredMatch): StoredMatch {
  const players = (input.playerIds ?? []).map((id) => {
    const p = getPlayer(db, id);
    if (!p) throw new ValidationError(`No existe el jugador ${id}.`);
    return p;
  });
  if (players.length < 1 || players.length > 2) throw new ValidationError('Elige uno o dos jugadores del club.');
  const date = input.date ?? prev?.date;
  if (!isDate(date)) throw new ValidationError('La fecha debe ser AAAA-MM-DD.');
  const time = input.time === undefined ? prev?.plannedClock : input.time || undefined;
  if (time && !/^\d{1,2}:\d{2}$/.test(time)) throw new ValidationError('La hora debe ser HH:MM.');
  const state = input.state ?? (prev?.status === 'on_court' ? 'live' : prev && prev.status !== 'scheduled' ? 'finished' : 'scheduled');
  const sets = input.score === undefined ? prev?.sets ?? [] : parseSets(input.score);
  let status: MatchStatus = state === 'live' ? 'on_court' : state === 'finished' ? 'finished' : 'scheduled';
  let winner: 1 | 2 | undefined;
  if (state === 'finished') {
    const outcome = input.outcome ?? (prev?.winner ? (prev.winner === 1 ? 'win' : 'loss') : undefined);
    if (outcome === 'walkover') status = 'walkover';
    winner = outcome === 'win' || outcome === 'walkover' ? 1 : outcome === 'loss' ? 2 : undefined;
    if (!winner && sets.length > 0) {
      const won = sets.filter(([a, b]) => a > b).length;
      winner = won > sets.length - won ? 1 : 2;
    }
    if (!winner && status !== 'walkover') throw new ValidationError('Para finalizar indica el resultado (victoria o derrota) o los sets.');
  }
  const club: Side = { players: players.map((p) => ({ name: p.name, uva: true, rosterId: p.id })) };
  const opponent = input.opponent === undefined ? prev?.sides[1].players.map((x) => x.name).join(' / ') : input.opponent;
  const other: Side = { players: opponent ? [{ name: opponent, uva: false }] : [{ name: 'Rival', uva: false }] };
  return {
    key,
    tournamentGuid: input.tournamentId,
    date,
    plannedClock: time,
    plannedUtc: time ? localToUtcIso(date, time) : undefined,
    drawName: input.event || prev?.drawName || 'Partido',
    eventCode: input.event === undefined ? prev?.eventCode : input.event || undefined,
    round: input.round === undefined ? prev?.round : input.round || undefined,
    court: input.court === undefined ? prev?.court : input.court || undefined,
    status,
    winner,
    sets,
    sides: [club, other],
  };
}

export function addManualMatch(db: Db, input: ManualMatchInput): string {
  requireManual(db, input.tournamentId);
  const key = `manual:${randomUUID()}`;
  const m = build(db, input, key);
  const now = nowIso();
  db.prepare('insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values(?,?,?,?,?,?,?,?,?)').run(
    key, m.tournamentGuid, m.date ?? null, JSON.stringify(m), 'manual', m.status, now, now, now,
  );
  for (const id of input.playerIds) db.prepare('insert or ignore into tournament_players(tournament_guid, player_id) values(?, ?)').run(m.tournamentGuid, id);
  touch(db, m.tournamentGuid);
  return key;
}

export function updateManualMatch(db: Db, key: string, patch: Partial<ManualMatchInput>): void {
  const row = db.prepare('select json, tournament_guid from matches where key = ?').get(key) as { json: string; tournament_guid: string } | undefined;
  if (!row || !key.startsWith('manual:')) throw new ValidationError('No existe ese partido manual.');
  const prev = JSON.parse(row.json) as StoredMatch;
  const playerIds = patch.playerIds ?? prev.sides[0].players.map((p) => p.rosterId!).filter(Boolean);
  const m = build(db, { ...patch, tournamentId: row.tournament_guid, playerIds }, key, prev);
  const now = nowIso();
  db.prepare('update matches set json = ?, state = ?, date = ?, updated_at = ?, last_seen_at = ? where key = ?').run(JSON.stringify(m), m.status, m.date ?? null, now, now, key);
  touch(db, row.tournament_guid);
}

export function deleteManualMatch(db: Db, key: string): boolean {
  if (!key.startsWith('manual:')) return false;
  const row = db.prepare('select tournament_guid from matches where key = ?').get(key) as { tournament_guid: string } | undefined;
  if (!row) return false;
  db.prepare('delete from matches where key = ?').run(key);
  touch(db, row.tournament_guid);
  return true;
}

export interface ManualProgressInput {
  total: number;
  finished: number;
  live?: number;
  courts: number;
  avgDurationMin?: number | null;
  delayMin?: number | null;
}

/** Cifras de la jornada que anota el club; de ellas sale la hora estimada de fin del torneo. */
export function setManualProgress(db: Db, guid: string, input: ManualProgressInput, now = new Date()) {
  requireManual(db, guid);
  const n = (x: unknown) => Number(x);
  const total = n(input.total), finished = n(input.finished), live = n(input.live ?? 0), courts = n(input.courts);
  if (![total, finished, live, courts].every((v) => Number.isInteger(v) && v >= 0)) throw new ValidationError('Las cifras deben ser números enteros.');
  if (total < 1 || courts < 1) throw new ValidationError('Indica el total de partidos y el número de pistas.');
  if (finished + live > total) throw new ValidationError('Los partidos terminados y en juego no pueden superar el total.');
  const est = estimateManual(
    { total, finished, live, courts, avgDurationMin: input.avgDurationMin ? n(input.avgDurationMin) : undefined, delayMin: input.delayMin ? n(input.delayMin) : undefined },
    now,
    { defaultMatchMin: settings.defaultMatchMin, changeoverMin: settings.changeoverMin, simulations: 0 },
  );
  kvSet(db, `estimate:${guid}`, { date: todayIn('Europe/Madrid', now), ...est }, now.toISOString());
  touch(db, guid);
  return est;
}

export function deleteManualTournament(db: Db, guid: string): boolean {
  requireManual(db, guid);
  db.prepare('delete from matches where tournament_guid = ?').run(guid);
  db.prepare('delete from tournament_players where tournament_guid = ?').run(guid);
  db.prepare('delete from kv where k = ?').run(`estimate:${guid}`);
  db.prepare('delete from tournaments where guid = ?').run(guid);
  return true;
}

export interface ManualTournamentView {
  guid: string;
  name: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  venue?: string;
  progress?: { total: number; finished: number; live: number; courts: number; estimatedEnd?: string; avgDurationMin?: number; delayMin?: number };
  matches: {
    key: string; playerIds: number[]; players: string[]; opponent?: string; event?: string; round?: string; date?: string; time?: string;
    court?: string; state: 'scheduled' | 'live' | 'finished'; score?: string; outcome?: 'win' | 'loss' | 'walkover';
  }[];
}

/** Torneos introducidos a mano con sus partidos, para el panel de administración. */
export function listManual(db: Db): ManualTournamentView[] {
  const rows = db.prepare('select * from tournaments where manual = 1 order by start_date desc').all() as unknown as {
    guid: string; name: string; start_date: string | null; end_date: string | null; city: string | null; venue: string | null;
  }[];
  return rows.map((t) => {
    const est = kvGet<{ total: number; finished: number; live: number; courts: number; estimatedEnd?: string; avgDurationMin?: number; delayMin?: number }>(db, `estimate:${t.guid}`);
    const matches = (db.prepare('select json from matches where tournament_guid = ?').all(t.guid) as unknown as { json: string }[])
      .map((r) => JSON.parse(r.json) as StoredMatch)
      .sort((a, b) => `${a.date ?? ''} ${a.plannedClock ?? ''}`.localeCompare(`${b.date ?? ''} ${b.plannedClock ?? ''}`))
      .map((m) => ({
        key: m.key,
        playerIds: m.sides[0].players.map((p) => p.rosterId!).filter(Boolean),
        players: m.sides[0].players.map((p) => p.name),
        opponent: m.sides[1].players[0]?.name === 'Rival' ? undefined : m.sides[1].players.map((p) => p.name).join(' / ') || undefined,
        event: m.eventCode ?? undefined, round: m.round, date: m.date, time: m.plannedClock, court: m.court,
        state: (m.status === 'on_court' ? 'live' : m.status === 'scheduled' || m.status === 'unknown' ? 'scheduled' : 'finished') as 'scheduled' | 'live' | 'finished',
        score: m.sets.map((s) => s.join('-')).join(' ') || undefined,
        outcome: m.status === 'walkover' ? ('walkover' as const) : m.winner ? (m.winner === 1 ? ('win' as const) : ('loss' as const)) : undefined,
      }));
    return {
      guid: t.guid, name: t.name, startDate: t.start_date ?? undefined, endDate: t.end_date ?? undefined, city: t.city ?? undefined, venue: t.venue ?? undefined,
      progress: est && { total: est.total, finished: est.finished, live: est.live, courts: est.courts, estimatedEnd: est.estimatedEnd, avgDurationMin: est.avgDurationMin, delayMin: est.delayMin },
      matches,
    };
  });
}
