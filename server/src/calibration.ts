import type { Db } from './db';
import type { Estimate } from './estimate';
import { consolidate, loadPatterns } from './patterns';

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
  /** Factor que ensancha (>1) o estrecha (<1) el margen probable para que acierte ~80 % de las veces. Ausente = 1. */
  spread?: number;
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

const TARGET_COVERAGE = 0.8;
const SPREAD_MIN = 0.75;
const SPREAD_MAX = 1.5;

export function learnedShift(db: Db, now: Date): Shift {
  consolidate(db, now); // guarda el patrón de las jornadas que acaban de terminar
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const days = loadPatterns(db).filter((p) => p.date >= since);
  // Fin: error medio de cada jornada a 120, 60 y 30 min del final (lo que se ve durante el torneo).
  const endErrs = days.flatMap((d) => (d.end.length ? [d.end.reduce((a, h) => a + h.err, 0) / d.end.length] : []));
  // Inicio: sesgo de la estimación de todos los partidos a 30 min de empezar, una cifra por jornada.
  const startErrs = days.flatMap((d) => (d.startBias30 ? [d.startBias30.bias] : []));
  if (endErrs.length < MIN_DAYS && startErrs.length < MIN_DAYS) return NONE;
  const w = (n: number) => (n < MIN_DAYS ? 0 : n / (n + SHRINK));
  const endMin = r1(clamp(-median(endErrs.length ? endErrs : [0]) * w(endErrs.length), END_CAP));

  // Anchura del margen: el factor más pequeño con el que, ya corregido el sesgo, el margen acierta al menos el 80 % de las veces.
  const samples = days.flatMap((d) => d.end.filter((h) => h.lowW !== undefined && h.highW !== undefined));
  let spread: number | undefined;
  if (endErrs.length >= MIN_DAYS && samples.length >= MIN_DAYS * 2) {
    const covers = (f: number) => samples.filter((h) => -f * h.highW! <= h.err + endMin && h.err + endMin <= f * h.lowW!).length / samples.length;
    let best = SPREAD_MAX;
    for (let f = SPREAD_MIN; f <= SPREAD_MAX + 1e-9; f += 0.05) if (covers(f) >= TARGET_COVERAGE) { best = f; break; }
    const f = 1 + (best - 1) * w(endErrs.length);
    spread = Math.round(Math.max(SPREAD_MIN, Math.min(SPREAD_MAX, f)) * 100) / 100;
  }
  return {
    endMin,
    startMin: r1(clamp(-median(startErrs.length ? startErrs : [0]) * w(startErrs.length), START_CAP)),
    days: Math.max(endErrs.length, startErrs.length),
    ...(spread !== undefined && spread !== 1 ? { spread } : {}),
  };
}

const shiftIso = (iso: string | undefined, min: number) => (iso ? new Date(Date.parse(iso) + min * 60_000).toISOString() : undefined);

/** Aplica el desvío aprendido: no toca partidos ya terminados ni empezados (`starts` solo tiene pendientes). */
export function applyShift(est: Estimate, shift: Shift): Estimate {
  const f = shift.spread ?? 1;
  if (shift.endMin === 0 && shift.startMin === 0 && f === 1) return est;
  // El margen se ensancha o estrecha alrededor de la hora estimada (en bruto) y luego se desplaza igual que ella.
  const wide = (v: string | undefined) => (v && est.estimatedEnd && f !== 1 ? new Date(Date.parse(est.estimatedEnd) + (Date.parse(v) - Date.parse(est.estimatedEnd)) * f).toISOString() : v);
  return {
    ...est,
    estimatedEnd: shiftIso(est.estimatedEnd, shift.endMin),
    estimatedEndLow: shiftIso(wide(est.estimatedEndLow), shift.endMin),
    estimatedEndHigh: shiftIso(wide(est.estimatedEndHigh), shift.endMin),
    starts: Object.fromEntries(Object.entries(est.starts).map(([k, v]) => [k, shiftIso(v, shift.startMin)!])),
    startsEarly: est.startsEarly ? Object.fromEntries(Object.entries(est.startsEarly).map(([k, v]) => [k, shiftIso(v, shift.startMin)!])) : undefined,
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
