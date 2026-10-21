import { createHash } from 'node:crypto';
import { todayIn } from './dates';
import { settings } from './config';
import { type Db, kvGet } from './db';
import { tournamentPhase } from './policy';
import { findByNameLoose, listPlayers, type Player } from './roster';
import { isUvaClub } from './uva';
import type { Estimate } from './estimate';
import type { StoredMatch } from './uva';

export interface PublicMatch {
  id: string;
  event?: string;
  players: string[];
  opponent?: string;
  state: 'scheduled' | 'live' | 'finished';
  date?: string;
  time?: string;
  court?: string;
  score?: string;
  outcome?: 'win' | 'loss';
  /** Hora programada (ISO) y hora estimada de inicio según el ritmo real del torneo (ISO). */
  plannedStart?: string;
  estimatedStart?: string;
}

export interface PublicEntrant {
  label: string;
  /** Jugador público del club (se muestra con su nombre). */
  uva: boolean;
  club?: string;
  bye?: boolean;
  placeholder?: string;
}

export interface PublicDraw {
  id: number;
  name: string;
  type: 'knockout' | 'roundrobin';
  /** Prueba a la que pertenece («IM», «DX»…) y, si es un grupo, «Grupo A» y cuántos de él pasan al cuadro final. */
  base: string;
  group?: string;
  qualify?: number;
  standings?: { rank: number; entrant: PublicEntrant; played: number; won: number; lost: number; matches: string; games: string; points: string; pts: number }[];
  rounds?: { title: string; matches: { a: PublicEntrant; b: PublicEntrant; winner?: 1 | 2; sets: [number, number][]; when?: string; court?: string; note?: string }[] }[];
}

export interface PublicProgress {
  /** Día al que se refiere la estimación (YYYY-MM-DD). */
  date: string;
  asOf: string;
  total: number;
  finished: number;
  live: number;
  remaining: number;
  avgDurationMin?: number;
  plannedSlotMin?: number;
  delayMin?: number;
  courts: number;
  basis: 'observed' | 'default' | 'manual';
  done: boolean;
  estimatedEnd?: string;
  estimatedEndLow?: string;
  estimatedEndHigh?: string;
}

export interface PublicTournament {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  venue?: string;
  level?: string;
  /** Ficha oficial en badminton.es (no existe en torneos introducidos a mano). */
  officialUrl?: string;
  /** `true` si lo introduce el club a mano. */
  manual: boolean;
  uvaPlayers: string[];
  matches: PublicMatch[];
  progress?: PublicProgress;
  draws: PublicDraw[];
  /** Última lectura correcta de este torneo. Los datos nunca son «en directo» si esta fecha es antigua. */
  checkedAt?: string;
  stale: boolean;
}

export interface PublicState {
  generatedAt: string;
  /** `false` si la lectura automática está desactivada: no habrá datos de partidos más allá de lo anotado. */
  officialReadEnabled: boolean;
  /** Cuándo falló la última lectura de la fuente (sin detalles técnicos). */
  lastErrorAt?: string;
  /** Cambia solo cuando cambia algo publicable (para el aviso SSE). */
  version: string;
  /** Jugadores públicos (para elegir a quién seguir y recibir avisos). */
  players: { id: number; name: string; category?: string }[];
  pushEnabled: boolean;
  tournaments: PublicTournament[];
}

/** Con cifras manuales, la hora estimada es la programada más el retraso medio que anota el club. */
const delayedStart = (m: StoredMatch, h: StartHints): string | undefined =>
  h.basis === 'manual' && h.delayMin && m.plannedUtc ? new Date(Date.parse(m.plannedUtc) + h.delayMin * 60_000).toISOString() : undefined;

const stateOf = (s: StoredMatch['status']): PublicMatch['state'] => (s === 'on_court' ? 'live' : s === 'scheduled' || s === 'unknown' ? 'scheduled' : 'finished');

/** Traduce un partido guardado a lo que se puede publicar. Devuelve `undefined` si hay alguien sin consentimiento. */
/** Lo que la estimación aporta a un partido: hora estimada por partido y, en datos manuales, un retraso común. */
export type StartHints = Pick<Estimate, 'starts'> & Partial<Pick<Estimate, 'delayMin' | 'basis'>>;

export function toPublicMatch(m: StoredMatch, publicIds: Set<number>, hints: StartHints = { starts: {} }, names?: Map<number, string>): PublicMatch | undefined {
  const uvaOn = m.sides.map((s) => s.players.filter((p) => p.uva));
  const all = uvaOn.flat();
  // Si alguien del club en el partido no es público, no se publica el partido entero.
  if (all.length === 0 || all.some((p) => p.rosterId === undefined || !publicIds.has(p.rosterId))) return undefined;

  const bothSides = uvaOn[0].length > 0 && uvaOn[1].length > 0;
  const uvaSide = uvaOn[0].length > 0 ? 0 : 1;
  const other = m.sides[1 - uvaSide].players.map((p) => p.name).join(' / ');
  const flip = (s: [number, number]): [number, number] => (uvaSide === 0 ? s : [s[1], s[0]]);
  const sets = m.sets.map(flip);

  let score: string | undefined;
  if (m.status === 'walkover') score = 'W.O.';
  else if (sets.length > 0) score = sets.map((s) => s.join('-')).join(' ') + (m.status === 'retired' ? ' (retirada)' : '');
  else if (m.status === 'retired') score = 'Retirada';

  return {
    id: m.key,
    event: [m.eventCode ?? m.drawName, m.round].filter(Boolean).join(' · ') || undefined,
    players: all.map((p) => (p.rosterId !== undefined ? names?.get(p.rosterId) : undefined) ?? p.name),
    opponent: !bothSides && settings.opponents === 'names' && other ? other : undefined,
    state: stateOf(m.status),
    date: m.date,
    time: m.plannedClock,
    court: m.court,
    score: stateOf(m.status) === 'finished' ? score : undefined,
    outcome: stateOf(m.status) === 'finished' && !bothSides && m.winner ? (m.winner === uvaSide + 1 ? 'win' : 'loss') : undefined,
    plannedStart: m.plannedUtc,
    estimatedStart: stateOf(m.status) === 'scheduled' ? hints.starts[m.key] ?? delayedStart(m, hints) : undefined,
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + '.')
    .join(' ');

/**
 * Cómo se muestra a cada persona de un cuadro. Los jugadores públicos del club, con su nombre. El resto no consintió su
 * publicación aquí: iniciales (o nada), y las personas del club que no son públicas, siempre como «Jugador/a UVa».
 */
export function entrantLabel(names: string[], club: string | undefined, publicPlayers: Player[]): { label: string; uva: boolean } {
  const parts = names.map((n) => {
    // Nombre corto del torneo frente al completo de la lista; y si el club publicado es otro, es un homónimo, no del club.
    // (En parejas el club publicado puede ser el del compañero: la comprobación del club solo se aplica a individuales.)
    const pub = names.length > 1 || !club || isUvaClub(club) ? findByNameLoose(publicPlayers, n) : undefined;
    if (pub) return { text: pub.name, uva: true };
    if (isUvaClub(club)) return { text: 'Jugador/a UVa', uva: false };
    if (settings.drawNames === 'full') return { text: n, uva: false };
    return { text: initials(n), uva: false };
  });
  return { label: parts.map((p) => p.text).join(' / '), uva: parts.some((p) => p.uva) };
}

export function buildPublicDraws(db: Db, guid: string, publicPlayers: Player[]): PublicDraw[] {
  if (settings.drawNames === 'off') return [];
  const out: PublicDraw[] = [];
  const pendingFinals: PublicDraw[] = [];
  const rows = db.prepare('select draw_id, name, type, json from draws where tournament_guid = ? order by draw_id').all(guid) as unknown as { draw_id: number; name: string; type: 'knockout' | 'roundrobin'; json: string }[];
  // Cuántos de cada grupo pasan al cuadro final de su prueba (lo recuerda el cuadro final al leerlo).
  const qualifiers = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (r.type !== 'knockout') continue;
    const q = (JSON.parse(r.json) as { qualifiers?: Record<string, number> }).qualifiers;
    if (q) qualifiers.set(r.name, q);
  }
  for (const r of rows) {
    const data = JSON.parse(r.json) as {
      standings?: { rank: number; names: string[]; club?: string; played: number; won: number; lost: number; matches: string; games: string; points: string; pts: number }[];
      rounds?: { title: string; matches: { a: EntrantRaw; b: EntrantRaw; winner?: 1 | 2; sets: [number, number][]; when?: string; court?: string; note?: string }[] }[];
    };
    const ent = (e: EntrantRaw): PublicEntrant => ({ ...entrantLabel(e.names, e.club, publicPlayers), club: e.club, bye: e.bye, placeholder: e.placeholder });
    const g = r.name.match(/^(.*?)\s+-\s+(?:Grupo|Group)\s+(\S+)$/i);
    const base = g ? g[1] : r.name;
    const draw: PublicDraw = { id: r.draw_id, name: r.name, type: r.type, base };
    if (g) {
      draw.group = `Grupo ${g[2]}`;
      const n = qualifiers.get(base)?.[draw.group];
      if (n) draw.qualify = n;
    }
    let hasUva = false;
    if (data.standings) {
      draw.standings = data.standings.map((s) => {
        const entrant = { ...entrantLabel(s.names, s.club, publicPlayers), club: s.club };
        hasUva ||= entrant.uva;
        return { rank: s.rank, entrant, played: s.played, won: s.won, lost: s.lost, matches: s.matches, games: s.games, points: s.points, pts: s.pts };
      });
    }
    if (data.rounds) {
      draw.rounds = data.rounds.map((round) => ({
        title: round.title,
        matches: round.matches.map((m) => {
          const a = ent(m.a);
          const b = ent(m.b);
          hasUva ||= a.uva || b.uva;
          return { a, b, winner: m.winner, sets: m.sets, when: m.when, court: m.court, note: m.note };
        }),
      }));
    }
    // Solo se muestran los cuadros donde juega alguien público del club…
    if (hasUva) out.push(draw);
    else if (r.type === 'knockout') pendingFinals.push(draw);
  }
  // …y el cuadro final de las pruebas en las que el club tiene grupo, aunque aún solo tenga plazas «Grupo A #1»: así se ve por dónde avanzan.
  const bases = new Set(out.filter((d) => d.group).map((d) => d.base));
  for (const d of pendingFinals) if (bases.has(d.base)) out.push(d);
  return out.sort((a, b) => a.id - b.id);
}

interface EntrantRaw {
  names: string[];
  club?: string;
  bye?: boolean;
  placeholder?: string;
}

function toProgress(e: Estimate & { date: string }): PublicProgress {
  const { starts: _starts, ...rest } = e; // las horas por partido solo se usan para los partidos públicos
  void _starts;
  return rest;
}

interface TRow {
  guid: string; name: string; start_date: string | null; end_date: string | null; city: string | null;
  venue: string | null; level: string | null; info_ok_at: string | null; draws_ok_at: string | null; manual: number;
}

export function buildPublicState(db: Db, now = new Date()): PublicState {
  const players = listPlayers(db);
  const publicPlayers = new Map(players.filter((p) => p.public).map((p) => [p.id, p]));
  const publicIds = new Set(publicPlayers.keys());
  const today = todayIn('Europe/Madrid', now);

  const tournaments: PublicTournament[] = [];
  for (const t of db.prepare('select * from tournaments where hidden = 0').all() as unknown as TRow[]) {
    const linked = (db.prepare('select player_id from tournament_players where tournament_guid = ?').all(t.guid) as unknown as { player_id: number }[])
      .map((r) => publicPlayers.get(r.player_id))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const est = kvGet<Estimate & { date: string }>(db, `estimate:${t.guid}`);
    const matches = (db.prepare('select json from matches where tournament_guid = ?').all(t.guid) as unknown as { json: string }[])
      .map((r) => toPublicMatch(JSON.parse(r.json) as StoredMatch, publicIds, est ?? { starts: {} }, new Map([...publicPlayers].map(([id, p]) => [id, p.name]))))
      .filter((m): m is PublicMatch => !!m)
      .sort((a, b) => `${a.date ?? ''} ${a.time ?? ''}`.localeCompare(`${b.date ?? ''} ${b.time ?? ''}`));

    if (linked.length === 0 && matches.length === 0) continue;

    const dayOks = (db.prepare("select v from kv where k like ?").all(`ok:day:${t.guid}:%`) as unknown as { v: string }[]).map((r) => (JSON.parse(r.v) as { at: string }).at);
    const checkedAt = [t.info_ok_at, t.draws_ok_at, ...dayOks].filter((x): x is string => !!x).sort().at(-1);
    const phase = tournamentPhase({ startDate: t.start_date, endDate: t.end_date }, today);
    const watching = phase === 'live' || phase === 'imminent' || phase === 'recent';
    const stale = !t.manual && settings.officialReadEnabled && watching && (!checkedAt || now.getTime() - Date.parse(checkedAt) > settings.staleAfterMs);

    tournaments.push({
      id: t.guid,
      name: t.name,
      startDate: t.start_date ?? undefined,
      endDate: t.end_date && t.end_date !== t.start_date ? t.end_date : undefined,
      city: t.city ?? undefined,
      venue: t.venue ?? undefined,
      level: t.level ?? undefined,
      officialUrl: t.manual ? undefined : `https://www.badminton.es/sport/tournament.aspx?id=${t.guid}`,
      manual: !!t.manual,
      uvaPlayers: [...new Set([...linked.map((p) => p.name), ...matches.flatMap((m) => m.players)])].sort((a, b) => a.localeCompare(b, 'es')),
      matches,
      progress: est ? toProgress(est) : undefined,
      draws: buildPublicDraws(db, t.guid, [...publicPlayers.values()]),
      checkedAt,
      stale,
    });
  }
  tournaments.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.name.localeCompare(b.name, 'es'));

  const publicList = [...publicPlayers.values()].map((p) => ({ id: p.id, name: p.name, category: p.category ?? undefined }));
  // La versión cambia si cambia cualquier cosa publicable (jugadores o torneos); no depende de la hora de generación.
  const version = createHash('sha1').update(JSON.stringify([publicList, tournaments])).digest('hex').slice(0, 12);
  return {
    generatedAt: now.toISOString(),
    officialReadEnabled: settings.officialReadEnabled,
    lastErrorAt: kvGet<{ at: string }>(db, 'last_error')?.at,
    version,
    players: publicList,
    pushEnabled: !!(settings.vapid.publicKey && settings.vapid.privateKey && settings.vapid.subject),
    tournaments,
  };
}

/* ---------------------------------------------------------------- */
/* Caché del estado público                                          */
/* ---------------------------------------------------------------- */

interface CachedState { at: number; state: PublicState; body: string; etag: string }
const cache = new WeakMap<Db, CachedState>();

/** Descarta el estado calculado (hay datos nuevos o ha cambiado la lista). */
export function invalidatePublicState(db: Db) {
  cache.delete(db);
}

/**
 * Estado público ya calculado y serializado, con su etiqueta (ETag). Construirlo recorre todos los torneos, partidos y cuadros,
 * así que se calcula una vez y se reutiliza para todas las peticiones y para el aviso a los navegadores.
 */
export function cachedPublicState(db: Db, nowMs = Date.now()): CachedState {
  const hit = cache.get(db);
  if (hit && nowMs - hit.at < settings.publicCacheMs) return hit;
  const state = buildPublicState(db, new Date(nowMs));
  const entry = { at: nowMs, state, body: JSON.stringify(state), etag: `"${state.version}"` };
  cache.set(db, entry);
  return entry;
}
