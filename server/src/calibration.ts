import { buildAccuracy } from './accuracy';
import type { Db } from './db';
import type { Estimate } from './estimate';

/**
 * Autocorrección de la estimación con lo que ha ido pasando de verdad.
 *
 * El modelo base (`estimate.ts`) se mide en cada jornada terminada (registro de acierto, `accuracy.ts`). Si de forma sistemática
 * llega pronto o tarde, se corre su hora en sentido contrario, con prudencia: el desvío mediano de las jornadas ya medidas,
 * reducido por `n / (n + 4)` (con pocas jornadas casi no corrige) y con un tope. Se mide siempre el modelo base SIN corregir
 * (lo que se registra es la estimación en bruto), de modo que corregir no falsea el aprendizaje.
 */
export interface Shift {
  /** Minutos que se suman a la hora estimada de fin (− = adelantarla). */
  endMin: number;
  /** Minutos que se suman a la hora estimada de inicio de cada partido pendiente. */
  startMin: number;
  /** Jornadas terminadas en que se basa. */
  days: number;
}

const NONE: Shift = { endMin: 0, startMin: 0, days: 0 };
const MIN_DAYS = 3;
const SHRINK = 4;
const END_CAP = 20;
const START_CAP = 8;
const WINDOW_DAYS = 180;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function learnedShift(db: Db, now: Date): Shift {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const days = buildAccuracy(db, since).filter((d) => d.finished);
  // Fin: error medio de cada jornada a 120, 60 y 30 min del final (lo que se ve durante el torneo).
  const endErrs = days.flatMap((d) => {
    const e = d.end.filter((h) => [120, 60, 30].includes(h.minBefore)).map((h) => h.errorMin);
    return e.length ? [e.reduce((a, b) => a + b, 0) / e.length] : [];
  });
  // Inicio: sesgo de la estimación de todos los partidos a 30 min de empezar, una cifra por jornada.
  const startErrs = days.flatMap((d) => {
    const s = d.starts.all['30'];
    return s && s.n >= 5 ? [s.bias] : [];
  });
  if (endErrs.length < MIN_DAYS && startErrs.length < MIN_DAYS) return NONE;
  const w = (n: number) => (n < MIN_DAYS ? 0 : n / (n + SHRINK));
  return {
    endMin: r1(clamp(-median(endErrs.length ? endErrs : [0]) * w(endErrs.length), END_CAP)),
    startMin: r1(clamp(-median(startErrs.length ? startErrs : [0]) * w(startErrs.length), START_CAP)),
    days: Math.max(endErrs.length, startErrs.length),
  };
}

const shiftIso = (iso: string | undefined, min: number) => (iso ? new Date(Date.parse(iso) + min * 60_000).toISOString() : undefined);

/** Aplica el desvío aprendido: no toca partidos ya terminados ni empezados (`starts` solo tiene pendientes). */
export function applyShift(est: Estimate, shift: Shift): Estimate {
  if (shift.endMin === 0 && shift.startMin === 0) return est;
  return {
    ...est,
    estimatedEnd: shiftIso(est.estimatedEnd, shift.endMin),
    estimatedEndLow: shiftIso(est.estimatedEndLow, shift.endMin),
    estimatedEndHigh: shiftIso(est.estimatedEndHigh, shift.endMin),
    starts: Object.fromEntries(Object.entries(est.starts).map(([k, v]) => [k, shiftIso(v, shift.startMin)!])),
  };
}

/** El cálculo recorre el registro de varios días: se reutiliza unos minutos. */
const cache = new WeakMap<Db, { at: number; shift: Shift }>();
export function currentShift(db: Db, now: Date): Shift {
  const hit = cache.get(db);
  if (hit && now.getTime() - hit.at < 10 * 60_000) return hit.shift;
  const shift = learnedShift(db, now);
  cache.set(db, { at: now.getTime(), shift });
  return shift;
}
