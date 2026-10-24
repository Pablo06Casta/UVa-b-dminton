import { buildAccuracy } from './accuracy';
import type { Db } from './db';
import { defaultPriors, type Priors } from './estimate';

/**
 * Patrones de seguimiento: de cada jornada terminada se guarda un resumen anónimo (duraciones por prueba, W.O., ritmo, retraso,
 * pistas y acierto de la estimación). Con ellos el modelo aprende de cada torneo: reajusta sus valores de partida (`learnedPriors`)
 * y la calibración (`calibration.ts`) mide el sesgo y la anchura del margen. Solo hay horas y recuentos, nunca nombres.
 */
export interface EventStat {
  /** Partidos jugados (no W.O.) con duración publicada. */
  n: number;
  sum: number;
  /** Suma de ln(duración) y de su cuadrado, para la dispersión. */
  sumLog: number;
  sumLog2: number;
}

export interface EndSample {
  /** Minutos antes del final a los que se tomó. */
  h: number;
  /** Error de la hora de fin (+ = tarde). */
  err: number;
  lowW?: number;
  highW?: number;
}

export interface DayPattern {
  tournamentId: string;
  tournament: string;
  date: string;
  matches: number;
  played: number;
  walkovers: number;
  avgDurationMin?: number;
  /** Ritmo de la jornada frente a los valores de partida (1 = como la media). */
  pace?: number;
  delayMin?: number;
  courts?: number;
  perEvent: Record<string, EventStat>;
  /** Hora de fin real menos la última hora programada (minutos). */
  endVsPlanMin?: number;
  end: EndSample[];
  startBias30?: { n: number; bias: number; mae: number };
  planBiasMin?: number;
}

const MIN = 60_000;
const group = (e?: string | null) => (e ?? '').slice(0, 2).toUpperCase() || 'XX';
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Resume una jornada terminada a partir de sus partidos y de la medición de acierto. */
function summarize(db: Db, d: ReturnType<typeof buildAccuracy>[number]): DayPattern {
  const rows = db.prepare('select planned_utc, court, event, status, duration_min, started_seen_at, prev_poll_at from slots where tournament_guid = ? and date = ?').all(d.tournamentId, d.date) as unknown as {
    planned_utc: string | null; court: string | null; event: string | null; status: string; duration_min: number | null; started_seen_at: string | null; prev_poll_at: string | null;
  }[];
  const perEvent: Record<string, EventStat> = {};
  let played = 0;
  let sum = 0;
  let exp = 0;
  let walkovers = 0;
  for (const r of rows) {
    if (r.status === 'walkover') { walkovers++; continue; }
    if (!r.duration_min || r.duration_min <= 0 || r.status === 'unknown') continue;
    const g = group(r.event);
    const e = (perEvent[g] ??= { n: 0, sum: 0, sumLog: 0, sumLog2: 0 });
    const l = Math.log(r.duration_min);
    e.n++; e.sum += r.duration_min; e.sumLog += l; e.sumLog2 += l * l;
    played++; sum += r.duration_min; exp += defaultPriors.mean[g] ?? defaultPriors.globalMean;
  }
  const delays: number[] = [];
  for (const r of rows) {
    if (!r.planned_utc || !r.started_seen_at) continue;
    const seen = Date.parse(r.started_seen_at);
    const prev = r.prev_poll_at ? Date.parse(r.prev_poll_at) : seen;
    delays.push(((seen + prev) / 2 - Date.parse(r.planned_utc)) / MIN);
  }
  delays.sort((a, b) => a - b);
  const delay = delays.length ? delays[Math.floor(delays.length / 2)] : undefined;
  const planned = rows.map((r) => (r.planned_utc ? Date.parse(r.planned_utc) : NaN)).filter((x) => !Number.isNaN(x));
  const endVsPlan = d.actualEnd && planned.length ? (Date.parse(d.actualEnd) - Math.max(...planned)) / MIN : undefined;
  const s30 = d.starts.all['30'];
  return {
    tournamentId: d.tournamentId,
    tournament: d.tournament,
    date: d.date,
    matches: rows.length,
    played,
    walkovers,
    avgDurationMin: played ? r1(sum / played) : undefined,
    pace: played && exp > 0 ? Math.round((sum / exp) * 1000) / 1000 : undefined,
    delayMin: delay === undefined ? undefined : Math.round(delay),
    courts: new Set(rows.map((r) => r.court).filter(Boolean)).size || undefined,
    perEvent,
    endVsPlanMin: endVsPlan === undefined ? undefined : Math.round(endVsPlan),
    end: d.end.filter((h) => [120, 60, 30].includes(h.minBefore)).map((h) => ({ h: h.minBefore, err: h.errorMin, lowW: h.lowW, highW: h.highW })),
    startBias30: s30 && s30.n >= 5 ? { n: s30.n, bias: s30.bias, mae: s30.mae } : undefined,
    planBiasMin: d.starts.planAll?.bias,
  };
}

/** Guarda el patrón de cada jornada terminada que aún no lo tenga. Devuelve cuántos nuevos. */
export function consolidate(db: Db, now: Date): number {
  const since = new Date(now.getTime() - 75 * 86_400_000).toISOString(); // el registro de estimaciones se conserva 60 días
  const have = new Set((db.prepare('select tournament_guid g, date d from day_patterns').all() as unknown as { g: string; d: string }[]).map((r) => `${r.g}|${r.d}`));
  const ins = db.prepare('insert or ignore into day_patterns(tournament_guid, date, created_at, json) values(?,?,?,?)');
  let added = 0;
  for (const d of buildAccuracy(db, since)) {
    if (!d.finished || have.has(`${d.tournamentId}|${d.date}`) || d.end.length === 0) continue;
    ins.run(d.tournamentId, d.date, now.toISOString(), JSON.stringify(summarize(db, d)));
    added++;
  }
  return added;
}

export function loadPatterns(db: Db): DayPattern[] {
  return (db.prepare('select json from day_patterns order by date, tournament_guid').all() as unknown as { json: string }[]).map((r) => JSON.parse(r.json) as DayPattern);
}

// ---- Valores de partida aprendidos ------------------------------------------------------------------------------------
const MIN_DAYS = 3;
const MIN_PLAYED = 20;
const EVENT_W = 150; // «partidos» que pesa lo a priori en la duración de cada prueba
const GLOBAL_W = 600;
const WO_W = 300;
const CV_W = 300;
const TAU_DAYS = 4; // jornadas que pesa lo a priori en la variación del ritmo entre torneos

export interface LearnedPriors {
  priors: Priors;
  /** Jornadas con las que se ha aprendido (0 = valores de partida sin tocar). */
  days: number;
  matches: number;
}

export function learnedPriors(db: Db): LearnedPriors {
  const days = loadPatterns(db).filter((p) => p.played >= MIN_PLAYED);
  if (days.length < MIN_DAYS) return { priors: defaultPriors, days: 0, matches: 0 };
  const ev: Record<string, EventStat> = {};
  let resolved = 0;
  let wo = 0;
  for (const p of days) {
    resolved += p.played + p.walkovers;
    wo += p.walkovers;
    for (const [g, s] of Object.entries(p.perEvent)) {
      const e = (ev[g] ??= { n: 0, sum: 0, sumLog: 0, sumLog2: 0 });
      e.n += s.n; e.sum += s.sum; e.sumLog += s.sumLog; e.sumLog2 += s.sumLog2;
    }
  }
  const mean = { ...defaultPriors.mean };
  for (const g of Object.keys(mean)) {
    const e = ev[g];
    if (e) mean[g] = r1((EVENT_W * defaultPriors.mean[g] + e.sum) / (EVENT_W + e.n));
  }
  const all = Object.values(ev);
  const N = all.reduce((a, e) => a + e.n, 0);
  const globalMean = r1((GLOBAL_W * defaultPriors.globalMean + all.reduce((a, e) => a + e.sum, 0)) / (GLOBAL_W + N));
  // Dispersión dentro de cada prueba (log-normal): varianza combinada de ln(duración).
  const ss = all.reduce((a, e) => a + (e.n > 1 ? e.sumLog2 - (e.sumLog * e.sumLog) / e.n : 0), 0);
  const dof = all.reduce((a, e) => a + Math.max(0, e.n - 1), 0);
  const cvObs = dof > 0 ? Math.sqrt(Math.exp(ss / dof) - 1) : defaultPriors.cv;
  const cv = Math.round(((CV_W * defaultPriors.cv + dof * cvObs) / (CV_W + dof)) * 1000) / 1000;
  const walkover = Math.round(((WO_W * defaultPriors.walkover + wo) / (WO_W + resolved)) * 1000) / 1000;
  // Variación del ritmo entre jornadas, frente a los valores ya aprendidos.
  const paces = days.map((p) => {
    let o = 0, e = 0;
    for (const [g, s] of Object.entries(p.perEvent)) { o += s.sum; e += s.n * (mean[g] ?? globalMean); }
    return e > 0 ? o / e : 1;
  });
  const tau = Math.sqrt((TAU_DAYS * defaultPriors.paceTau ** 2 + paces.reduce((a, r) => a + (r - 1) ** 2, 0)) / (TAU_DAYS + paces.length));
  return {
    priors: { mean, globalMean, cv, walkover, paceTau: Math.round(Math.max(0.03, Math.min(0.15, tau)) * 1000) / 1000 },
    days: days.length,
    matches: N,
  };
}

const cache = new WeakMap<Db, { at: number; v: LearnedPriors }>();
/** Se reutiliza unos minutos; no calcula nada si no hay patrones nuevos. */
export function currentPriors(db: Db, now: Date): LearnedPriors {
  const hit = cache.get(db);
  if (hit && now.getTime() - hit.at < 10 * 60_000) return hit.v;
  const v = learnedPriors(db);
  cache.set(db, { at: now.getTime(), v });
  return v;
}

/**
 * Migración única (24/10/2026): hasta entonces los partidos que la fuente dejaba de publicar quedaban como «por jugar» y falseaban la
 * estimación (y su acierto). Se descartan las estimaciones guardadas y los patrones anteriores para que el modelo no aprenda de ese sesgo.
 * Devuelve `true` si borró algo (solo la primera vez).
 */
export function purgeGhostEra(db: Db, now: Date): boolean {
  if (db.prepare("select 1 from kv where k = 'ghostfix'").get()) return false;
  db.prepare('delete from estimate_log').run();
  db.prepare('delete from estimate_starts').run();
  db.prepare('delete from day_patterns').run();
  db.prepare("insert into kv(k, v, updated_at) values('ghostfix', ?, ?)").run(JSON.stringify({ at: now.toISOString() }), now.toISOString());
  return true;
}
