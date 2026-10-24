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
  /**
   * Corrección del margen probable (minutos que se restan al límite inferior y se suman al superior; negativa = estrecharlo), por horizonte:
   * a ≈120, ≈60 y ≈30 min del final. Regresión cuantílica conformalizada (CQR) con nivel adaptativo (ACI). Ausente = sin corregir.
   */
  conformal?: { 120: number; 60: number; 30: number };
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
const ACI_GAMMA = 0.02; // paso de adaptación del nivel: pequeño porque hay pocas jornadas
const CONFORMAL_MIN = -20;
const CONFORMAL_MAX = 60;
const HORIZONS = [120, 60, 30] as const;

/** Cuantil de nivel `level` (0-1) con la regla conformal: el menor valor con al menos ⌈level·n⌉ puntuaciones por debajo o iguales. */
const conformalQuantile = (scores: number[], level: number) => {
  const s = [...scores].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(Math.min(1, level) * s.length) - 1))];
};

/**
 * CQR + ACI para la anchura del margen de la hora de fin. Para cada horizonte (≈120, 60 y 30 min del final), con el error de cada jornada
 * ya medida (estimada − real) y la anchura que se mostraba, se puntúa la jornada con E = lo que se salió del margen (negativo si cayó dentro,
 * ya corregido el desvío de fin). La corrección Q es el cuantil conformal de nivel 1 − α_t de esas puntuaciones, con α_t adaptativo (ACI):
 * se recorre el histórico en orden y α sube cuando el margen acertó de más y baja cuando falló, para que la cobertura a largo plazo sea ≈80 %
 * aunque el torneo «cambie» de una jornada a otra. Con menos de 3 jornadas no corrige.
 */
export function learnConformal(days: ReturnType<typeof loadPatterns>, endMin: number): Shift['conformal'] {
  const out: Record<number, number> = {};
  for (const h of HORIZONS) {
    // Puntuación en minutos respecto a la hora estimada: la real queda en r = −err; el margen mostrado es [endMin − lowW, endMin + highW].
    const scores = [...days]
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((d) => d.end.filter((x) => x.h === h && x.lowW !== undefined && x.highW !== undefined))
      .map((x) => {
        const r = -x.err;
        return Math.max(endMin - x.lowW! - r, r - (endMin + x.highW!));
      });
    if (scores.length < MIN_DAYS) return undefined;
    let alpha = 1 - TARGET_COVERAGE;
    for (let t = MIN_DAYS; t < scores.length; t++) {
      const q = conformalQuantile(scores.slice(0, t), (1 - alpha) * (1 + 1 / t));
      alpha = Math.max(0.02, Math.min(0.5, alpha + ACI_GAMMA * (1 - TARGET_COVERAGE - (scores[t] > q ? 1 : 0))));
    }
    out[h] = r1(Math.max(CONFORMAL_MIN, Math.min(CONFORMAL_MAX, conformalQuantile(scores, (1 - alpha) * (1 + 1 / scores.length)))));
  }
  return { 120: out[120], 60: out[60], 30: out[30] };
}

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

  const conformal = endErrs.length >= MIN_DAYS ? learnConformal(days, endMin) : undefined;
  return {
    endMin,
    startMin: r1(clamp(-median(startErrs.length ? startErrs : [0]) * w(startErrs.length), START_CAP)),
    days: Math.max(endErrs.length, startErrs.length),
    ...(conformal && HORIZONS.some((h) => conformal[h] !== 0) ? { conformal } : {}),
  };
}

const shiftIso = (iso: string | undefined, min: number) => (iso ? new Date(Date.parse(iso) + min * 60_000).toISOString() : undefined);

/** Corrección del margen para el tiempo que falta hasta el final estimado: se toma el horizonte aprendido más cercano (≥ 90 min → 120; ≥ 45 → 60; si no, 30). */
const conformalFor = (c: NonNullable<Shift['conformal']>, remainingMin: number) => (remainingMin >= 90 ? c[120] : remainingMin >= 45 ? c[60] : c[30]);

/** Aplica el desvío aprendido: no toca partidos ya terminados ni empezados (`starts` solo tiene pendientes). */
export function applyShift(est: Estimate, shift: Shift): Estimate {
  if (shift.endMin === 0 && shift.startMin === 0 && !shift.conformal) return est;
  const q = shift.conformal && est.estimatedEnd ? conformalFor(shift.conformal, (Date.parse(est.estimatedEnd) - Date.parse(est.asOf)) / 60_000) : 0;
  const end = shiftIso(est.estimatedEnd, shift.endMin);
  // El margen se desplaza como la hora y se ensancha (o estrecha) por la corrección conformal, sin que la hora quede fuera de él.
  const low = est.estimatedEndLow ? shiftIso(est.estimatedEndLow, shift.endMin - q) : undefined;
  const high = est.estimatedEndHigh ? shiftIso(est.estimatedEndHigh, shift.endMin + q) : undefined;
  return {
    ...est,
    estimatedEnd: end,
    estimatedEndLow: low && end && low > end ? end : low,
    estimatedEndHigh: high && end && high < end ? end : high,
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
