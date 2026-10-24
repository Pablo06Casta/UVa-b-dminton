/**
 * Métricas de previsión probabilística y comparación pareada (Fase 0 del estudio de mejora de la estimación).
 * El MAE solo evalúa la mediana; aquí se añade la pérdida pinball de cada cuantil publicado, la puntuación de intervalo
 * (Gneiting y Raftery: anchura + penalización por quedar fuera) y un bootstrap pareado por jornada.
 */

/** Pérdida pinball de un cuantil `tau` publicado (`pred`) frente al valor real `y`. Menor es mejor. */
export const pinball = (tau: number, pred: number, y: number) => (y >= pred ? tau * (y - pred) : (1 - tau) * (pred - y));

/** Puntuación de intervalo del [lo, hi] con nivel nominal 1 − alpha: anchura + (2/alpha) × distancia al intervalo si el valor cae fuera. */
export const intervalScore = (lo: number, hi: number, y: number, alpha = 0.2) => hi - lo + (y < lo ? (2 / alpha) * (lo - y) : y > hi ? (2 / alpha) * (y - hi) : 0);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Generador con semilla (el bootstrap debe ser reproducible). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairedResult {
  /** Media de (candidato − base) por unidad (jornada o torneo): negativa = el candidato mejora. */
  meanDiff: number;
  /** Mejora relativa media respecto a la base (−0,05 = 5 % mejor). */
  relDiff: number;
  /** Intervalo bootstrap del 95 % de la diferencia media. */
  lo: number;
  hi: number;
  /** Unidades en que el candidato mejora / empeora (prueba de signos). */
  better: number;
  worse: number;
  n: number;
}

/** Comparación pareada por unidad: `base[i]` y `cand[i]` son la métrica (menor = mejor) de la misma jornada o torneo. */
export function paired(base: number[], cand: number[], resamples = 2000, seed = 7): PairedResult {
  const d = base.map((b, i) => cand[i] - b);
  const rand = rng(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[Math.floor(rand() * d.length)];
    means.push(s / d.length);
  }
  means.sort((a, b) => a - b);
  return {
    meanDiff: mean(d),
    relDiff: mean(d) / mean(base),
    lo: means[Math.floor(0.025 * resamples)],
    hi: means[Math.floor(0.975 * resamples)],
    better: d.filter((x) => x < -1e-9).length,
    worse: d.filter((x) => x > 1e-9).length,
    n: d.length,
  };
}
