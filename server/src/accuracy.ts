import type { Db } from './db';

/** Cuánto se parece la estimación a lo que pasó de verdad. Todo son horas y recuentos: no contiene nombres de personas. */
export interface Stats {
  n: number;
  /** Error medio con signo en minutos (+ = la estimación llegó tarde, − = temprano). */
  bias: number;
  /** Error absoluto medio y mediano, y el que no supera el 80 % de los casos (minutos). */
  mae: number;
  median: number;
  p80: number;
  /** Fracción de casos con error dentro de ±10, ±15 y ±30 minutos. */
  within10: number;
  within15: number;
  within30: number;
}

export interface EndHorizon {
  /** Minutos antes de terminar el último partido a los que se tomó la estimación. */
  minBefore: number;
  estimatedEnd: string;
  errorMin: number;
  /** ¿Cayó la hora real dentro del margen probable que se mostraba? */
  inRange?: boolean;
}

export interface AccuracyDay {
  tournamentId: string;
  tournament: string;
  date: string;
  /** `true` si ya terminaron todos los partidos del día. */
  finished: boolean;
  matches: { total: number; withActualStart: number; club: number };
  actualEnd?: string;
  /** Estimación de la hora de fin tomada antes de empezar la jornada. */
  beforeStart?: EndHorizon & { minBefore: number };
  end: EndHorizon[];
  /** Error de la hora estimada de inicio de cada partido, a 60, 30 y 15 minutos de empezar; comparada con la hora programada. */
  starts: { all: Record<string, Stats>; club: Record<string, Stats>; planAll?: Stats; planClub?: Stats };
  clubMatches: { event?: string; planned?: string; actualStart: string; planErrorMin?: number; errorMin: Record<string, number | null> }[];
}

const MIN = 60_000;
const START_HORIZONS = [60, 30, 15];
const END_HORIZONS = [240, 120, 60, 30];

export function stats(errors: number[]): Stats | undefined {
  if (errors.length === 0) return undefined;
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const q = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  const n = errors.length;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const within = (m: number) => Math.round((abs.filter((x) => x <= m).length / n) * 100) / 100;
  return {
    n,
    bias: r1(errors.reduce((a, b) => a + b, 0) / n),
    mae: r1(abs.reduce((a, b) => a + b, 0) / n),
    median: r1(q(0.5)),
    p80: r1(q(0.8)),
    within10: within(10),
    within15: within(15),
    within30: within(30),
  };
}

interface SlotRow {
  key: string;
  planned_utc: string | null;
  started_seen_at: string | null;
  prev_poll_at: string | null;
  finished_seen_at: string | null;
  status: string;
  event: string | null;
}

/** Inicio real: entre la lectura anterior y la lectura en que se vio en pista; se toma el punto medio. */
const actualStart = (s: SlotRow): number | undefined => {
  if (!s.started_seen_at) return undefined;
  const seen = Date.parse(s.started_seen_at);
  const prev = s.prev_poll_at ? Date.parse(s.prev_poll_at) : undefined;
  return prev !== undefined && prev < seen ? Math.round((prev + seen) / 2) : seen;
};

const iso = (ms: number) => new Date(ms).toISOString();
const mins = (ms: number) => Math.round((ms / MIN) * 10) / 10;

/** Compara, torneo a torneo y día a día, las estimaciones guardadas con lo ocurrido. */
export function buildAccuracy(db: Db, sinceIso: string): AccuracyDay[] {
  const days = db.prepare('select distinct tournament_guid g, date d from estimate_log where at >= ? order by d, g').all(sinceIso) as unknown as { g: string; d: string }[];
  const out: AccuracyDay[] = [];
  for (const { g, d } of days) {
    const t = db.prepare('select name from tournaments where guid = ?').get(g) as unknown as { name: string } | undefined;
    const slots = db.prepare('select key, planned_utc, started_seen_at, prev_poll_at, finished_seen_at, status, event from slots where tournament_guid = ? and date = ?').all(g, d) as unknown as SlotRow[];
    if (slots.length === 0) continue;
    const clubKeys = new Set((db.prepare('select key from matches where tournament_guid = ?').all(g) as unknown as { key: string }[]).map((r) => r.key));
    const done = (s: SlotRow) => ['finished', 'walkover', 'retired'].includes(s.status);
    const finished = slots.every(done);
    const ends = slots.map((s) => (s.finished_seen_at ? Date.parse(s.finished_seen_at) : undefined)).filter((x): x is number => x !== undefined);
    const endMs = finished && ends.length ? Math.max(...ends) : undefined;

    const log = db.prepare('select at, est_end, est_end_low, est_end_high from estimate_log where tournament_guid = ? and date = ? and est_end is not null order by at').all(g, d) as unknown as { at: string; est_end: string; est_end_low: string | null; est_end_high: string | null }[];
    const latestBefore = (ms: number) => [...log].reverse().find((r) => Date.parse(r.at) <= ms);
    const horizon = (before: number, row: (typeof log)[number], actual: number): EndHorizon => ({
      minBefore: before,
      estimatedEnd: row.est_end,
      errorMin: mins(Date.parse(row.est_end) - actual),
      inRange: row.est_end_low && row.est_end_high ? Date.parse(row.est_end_low) <= actual && actual <= Date.parse(row.est_end_high) : undefined,
    });
    const end: EndHorizon[] = [];
    let beforeStart: AccuracyDay['beforeStart'];
    if (endMs !== undefined) {
      for (const h of END_HORIZONS) {
        const row = latestBefore(endMs - h * MIN);
        if (row) end.push(horizon(h, row, endMs));
      }
      const starts = slots.map(actualStart).filter((x): x is number => x !== undefined);
      if (starts.length) {
        const first = Math.min(...starts);
        const row = latestBefore(first);
        if (row) beforeStart = horizon(Math.round((endMs - Date.parse(row.at)) / MIN), row, endMs);
      }
    }

    // Hora estimada de inicio de cada partido a 60/30/15 min de empezar (foto más reciente anterior a ese momento, si no es demasiado antigua).
    const snapshots = db.prepare('select distinct at from estimate_starts where tournament_guid = ? and date = ? order by at').all(g, d) as unknown as { at: string }[];
    const snapTimes = snapshots.map((s) => Date.parse(s.at));
    const estAt = db.prepare('select est_start from estimate_starts where tournament_guid = ? and date = ? and at = ? and slot_key = ?');
    const errAll: Record<string, number[]> = {};
    const errClub: Record<string, number[]> = {};
    const planAll: number[] = [];
    const planClub: number[] = [];
    const clubRows: AccuracyDay['clubMatches'] = [];
    let withStart = 0;
    for (const s of slots) {
      const a = actualStart(s);
      if (a === undefined) continue;
      withStart++;
      const isClub = clubKeys.has(s.key);
      const planErr = s.planned_utc ? mins(Date.parse(s.planned_utc) - a) : undefined;
      if (planErr !== undefined) (isClub ? planClub : planAll).push(planErr);
      if (planErr !== undefined && isClub) planAll.push(planErr);
      const row: AccuracyDay['clubMatches'][number] = { event: s.event ?? undefined, planned: s.planned_utc ?? undefined, actualStart: iso(a), planErrorMin: planErr, errorMin: {} };
      for (const h of START_HORIZONS) {
        const limit = a - h * MIN;
        let snap: number | undefined;
        for (const t of snapTimes) if (t <= limit) snap = t;
        let err: number | null = null;
        if (snap !== undefined && limit - snap <= 15 * MIN) {
          const r = estAt.get(g, d, iso(snap), s.key) as unknown as { est_start: string } | undefined;
          if (r) err = mins(Date.parse(r.est_start) - a);
        }
        row.errorMin[String(h)] = err;
        if (err !== null) {
          (errAll[h] ??= []).push(err);
          if (isClub) (errClub[h] ??= []).push(err);
        }
      }
      if (isClub) clubRows.push(row);
    }
    const toStats = (m: Record<string, number[]>) => Object.fromEntries(Object.entries(m).map(([h, e]) => [h, stats(e)!]));
    out.push({
      tournamentId: g,
      tournament: t?.name ?? g,
      date: d,
      finished,
      matches: { total: slots.length, withActualStart: withStart, club: clubKeys.size },
      actualEnd: endMs !== undefined ? iso(endMs) : undefined,
      beforeStart,
      end,
      starts: { all: toStats(errAll), club: toStats(errClub), planAll: stats(planAll), planClub: stats(planClub) },
      clubMatches: clubRows.sort((x, y) => x.actualStart.localeCompare(y.actualStart)),
    });
  }
  return out;
}
