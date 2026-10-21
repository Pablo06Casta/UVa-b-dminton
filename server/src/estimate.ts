/**
 * Estimación estadística del avance del torneo. Usa solo datos anónimos del orden de juego (hora programada, pista,
 * estado y duración publicada): cuánto han tardado los partidos ya terminados, cuánto se retrasa el cuadro respecto a lo
 * programado, cuántos partidos quedan y cuántas pistas hay. Con eso simula el resto del día y calcula la hora probable de
 * fin. Es una estimación: se presenta siempre como tal, con su margen.
 */

export interface Slot {
  key: string;
  /** Hora programada (ISO UTC). */
  plannedUtc?: string;
  orderIdx: number;
  court?: string;
  /** Tipo de prueba (IM, IF, DM, DF, DX…). */
  event?: string;
  status: 'scheduled' | 'on_court' | 'finished' | 'walkover' | 'retired' | 'unknown';
  durationMin?: number;
  /** Cuándo se vio por primera vez en pista (ISO). */
  startedSeenAt?: string;
  /** Lectura anterior a verlo en pista: el inicio real está entre ambas. */
  prevPollAt?: string;
  finishedSeenAt?: string;
}

/**
 * Valores de partida (a priori) medidos en 1.299 partidos reales de 11 jornadas de torneos absolutos españoles (2026):
 * duración media por prueba y dispersión, y proporción de W.O. Se usan hasta que el torneo en curso aporta datos propios, y
 * después se mezclan con ellos (ver `estimate`). Se pueden sustituir (las pruebas lo hacen para no «ver» la jornada que evalúan).
 */
export interface Priors {
  /** Minutos de duración media por prueba (IM, IF, DM, DF, DX). */
  mean: Record<string, number>;
  /** Duración media de cualquier prueba. */
  globalMean: number;
  /** Coeficiente de variación de la duración de un partido (desviación / media). */
  cv: number;
  /** Proporción de W.O. («no hay partido»). */
  walkover: number;
  /** Variación relativa del ritmo medio entre torneos distintos. */
  paceTau: number;
}

export const defaultPriors: Priors = {
  mean: { IM: 28.3, IF: 26.2, DM: 31.2, DF: 30.9, DX: 29.5 },
  globalMean: 28.9,
  cv: 0.32,
  walkover: 0.074,
  paceTau: 0.076,
};

export interface EstimateConfig {
  /** Si se indica, escala los valores a priori para que la duración media sea esta (ajuste manual de la administración). */
  defaultMatchMin?: number;
  /** Tiempo entre un partido y el siguiente en la misma pista. */
  changeoverMin: number;
  simulations: number;
  priors?: Priors;
  /** Ensancha o estrecha el margen probable (calibrado con las pruebas). */
  spread?: number;
  /** Percentil de la simulación que se da como hora de fin / de inicio (0,5 = mediana; algo más alto = más prudente). */
  endQuantile?: number;
  startQuantile?: number;
}

export const defaultEstimateConfig: EstimateConfig = { changeoverMin: 3, simulations: 400, priors: defaultPriors, spread: 1.3, endQuantile: 0.65, startQuantile: 0.6 };

export interface Estimate {
  asOf: string;
  total: number;
  finished: number;
  live: number;
  remaining: number;
  /** Media de lo que han tardado los partidos terminados. */
  avgDurationMin?: number;
  /** Lo que la organización reserva por partido (distancia entre partidos programados en la misma pista). */
  plannedSlotMin?: number;
  /** Retraso medio del inicio real respecto al programado (+ = tarde). */
  delayMin?: number;
  courts: number;
  /** `observed`: aprende de partidos terminados; `default`: duración supuesta; `manual`: cifras que introduce el club. */
  basis: 'observed' | 'default' | 'manual';
  done: boolean;
  estimatedEnd?: string;
  estimatedEndLow?: string;
  estimatedEndHigh?: string;
  /** Hora estimada de inicio de cada partido no terminado. */
  starts: Record<string, string>;
}

const MIN = 60_000;
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Cuantil de un vector ya ordenado. */
const q = (sorted: ArrayLike<number>, p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
const group = (e?: string) => (e ?? '').slice(0, 2).toUpperCase() || 'XX';

/** Generador pseudoaleatorio con semilla: la misma entrada da siempre la misma estimación. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar (Box–Muller). */
const normal = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

const WALKOVER_WEIGHT = 30; // «partidos virtuales» que pesa la proporción de W.O. a priori

/**
 * Estima el avance del día: hora de inicio de cada partido pendiente y hora de fin.
 *
 * Modelo (todo se aprende de partidos reales, ver `Priors` y `tests/backtest`):
 *  - La duración de un partido es log-normal; su media depende de la prueba (individual/dobles…) y del ritmo del torneo.
 *  - El ritmo del torneo (rápido/lento frente a la media) se estima con los partidos ya terminados, mezclado con lo esperable
 *    (bayesiano): con pocos datos manda lo a priori, con muchos mandan los observados. Su incertidumbre entra en la simulación.
 *  - Algunos partidos acaban en W.O. (duran 0): su proporción también se aprende del torneo.
 *  - Un partido en juego no puede acabar antes de lo que ya lleva jugado (se condiciona a eso).
 *  - Cada pista atiende sus partidos en orden y no empieza antes de la hora programada. Sin pistas publicadas, su número se
 *    deduce de cuántos partidos coinciden a la misma hora programada.
 *  - Se repite la jornada `simulations` veces; la hora estimada es la mediana y el margen, los percentiles 10-90.
 */
export function estimate(slots: Slot[], now: Date, cfg: EstimateConfig = defaultEstimateConfig): Estimate {
  const nowMs = now.getTime();
  const base0 = cfg.priors ?? defaultPriors;
  const scale = cfg.defaultMatchMin ? cfg.defaultMatchMin / base0.globalMean : 1;
  const priorMean = (e?: string) => (base0.mean[group(e)] ?? base0.globalMean) * scale;

  const isDone = (s: Slot) => s.status === 'finished' || s.status === 'walkover' || s.status === 'retired';
  const finished = slots.filter(isDone);
  const live = slots.filter((s) => s.status === 'on_court');
  const pending = slots
    .filter((s) => !isDone(s) && s.status !== 'on_court')
    .sort((a, b) => (a.plannedUtc ?? '').localeCompare(b.plannedUtc ?? '') || a.orderIdx - b.orderIdx);

  // ---- Lo observado -------------------------------------------------------------------------------------------------
  const played = finished.filter((s) => s.status !== 'walkover' && s.durationMin && s.durationMin > 0);
  const n = played.length;
  const sumObs = played.reduce((a, s) => a + s.durationMin!, 0);
  const sumExp = played.reduce((a, s) => a + priorMean(s.event), 0);
  const ratio = n > 0 ? sumObs / sumExp : 1;
  const k = (base0.cv / base0.paceTau) ** 2; // peso de lo a priori frente a los partidos observados
  const pace = (k + n * ratio) / (k + n); // ritmo del torneo: 1 = como la media
  const paceSd = 1 / Math.sqrt(1 / base0.paceTau ** 2 + n / base0.cv ** 2); // incertidumbre relativa del ritmo
  const resolved = finished.length;
  const walkovers = finished.filter((s) => s.status === 'walkover').length;
  const pWalkover = (walkovers + WALKOVER_WEIGHT * base0.walkover) / (resolved + WALKOVER_WEIGHT);
  const sigma = Math.sqrt(Math.log(1 + base0.cv ** 2));
  const basis: Estimate['basis'] = n > 0 ? 'observed' : 'default';

  // Retraso: inicio observado (entre la lectura anterior y la que lo vio en pista) frente a la hora programada.
  const delays: number[] = [];
  for (const s of slots) {
    if (!s.plannedUtc || !s.startedSeenAt) continue;
    const seen = Date.parse(s.startedSeenAt);
    const prev = s.prevPollAt ? Date.parse(s.prevPollAt) : seen;
    delays.push(((seen + prev) / 2 - Date.parse(s.plannedUtc)) / MIN);
  }
  const delayMin = median(delays);

  // Reserva por partido de la organización: huecos entre programados consecutivos de una misma pista.
  const byCourt = new Map<string, number[]>();
  for (const s of slots) if (s.court && s.plannedUtc) byCourt.set(s.court, [...(byCourt.get(s.court) ?? []), Date.parse(s.plannedUtc)]);
  const gaps: number[] = [];
  for (const times of byCourt.values()) {
    const t = [...times].sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) gaps.push((t[i] - t[i - 1]) / MIN);
  }
  const plannedSlotMin = median(gaps);

  // Pistas: las publicadas y, como mínimo, cuántos partidos coinciden a la misma hora programada.
  const courtIds = new Set(slots.map((s) => s.court).filter((c): c is string => !!c));
  const concurrent = new Map<string, number>();
  for (const s of slots) if (s.plannedUtc) concurrent.set(s.plannedUtc, (concurrent.get(s.plannedUtc) ?? 0) + 1);
  const inferred = Math.max(1, ...concurrent.values());
  // Pistas por adelantado: solo si TODOS los pendientes con partido real (no W.O.) la traen.
  const knownCourt = (s: Slot) => !!s.court && courtIds.has(s.court);
  const preassigned = pending.length > 0 && pending.filter((s) => s.status !== 'walkover').every(knownCourt);
  const courts = preassigned ? courtIds.size : Math.max(courtIds.size, inferred);

  const result: Estimate = {
    asOf: now.toISOString(),
    total: slots.length,
    finished: finished.length,
    live: live.length,
    remaining: pending.length,
    avgDurationMin: n > 0 ? Math.round((sumObs / n) * 10) / 10 : undefined,
    plannedSlotMin: plannedSlotMin === undefined ? undefined : Math.round(plannedSlotMin),
    delayMin: delayMin === undefined ? undefined : Math.round(delayMin),
    courts,
    basis,
    done: pending.length === 0 && live.length === 0 && slots.length > 0,
    starts: {},
  };

  if (result.done) {
    const last = finished.map((s) => s.finishedSeenAt).filter((x): x is string => !!x).sort().at(-1);
    return { ...result, estimatedEnd: last };
  }
  if (slots.length === 0) return result;

  // ---- Simulación ---------------------------------------------------------------------------------------------------
  const courtIndex = new Map<string, number>();
  for (const c of courtIds) courtIndex.set(c, courtIndex.size);
  const nCourts = Math.max(courts, courtIndex.size, 1);
  const free0 = new Float64Array(nCourts).fill(nowMs);
  const earliest = (free: Float64Array) => {
    let b = 0;
    for (let i = 1; i < free.length; i++) if (free[i] < free[b]) b = i;
    return b;
  };

  const liveInfo = live.map((s) => {
    const seen = s.startedSeenAt ? Date.parse(s.startedSeenAt) : nowMs;
    const prev = s.prevPollAt ? Date.parse(s.prevPollAt) : seen;
    const startedAt = Math.min(nowMs, (seen + prev) / 2);
    return { mean: priorMean(s.event), elapsed: Math.max(0, (nowMs - startedAt) / MIN), court: s.court ? courtIndex.get(s.court) : undefined };
  });
  const pend = pending.map((s) => ({
    key: s.key,
    planned: s.plannedUtc ? Date.parse(s.plannedUtc) : 0,
    mean: priorMean(s.event),
    court: preassigned && s.court ? courtIndex.get(s.court) ?? -1 : -1,
  }));

  const sims = Math.max(50, cfg.simulations);
  const rand = rng(Math.floor(nowMs / (5 * MIN)) * 31 + slots.length);
  const ends = new Float64Array(sims);
  const startsBy = pend.map(() => new Float64Array(sims));
  const changeover = cfg.changeoverMin * MIN;
  const free = new Float64Array(nCourts);

  for (let r = 0; r < sims; r++) {
    free.set(free0);
    const paceS = pace * Math.exp(paceSd * normal(rand) - (paceSd * paceSd) / 2);
    const draw = (mean: number) => {
      const m = Math.max(10, Math.min(90, mean * paceS));
      return Math.max(10, Math.min(95, m * Math.exp(sigma * normal(rand) - (sigma * sigma) / 2)));
    };
    let last = nowMs;
    for (const l of liveInfo) {
      const lc = l.court !== undefined ? l.court : earliest(free);
      let d = draw(l.mean);
      for (let t = 0; t < 8 && d <= l.elapsed; t++) d = draw(l.mean); // no acaba antes de lo que ya lleva jugado
      if (d <= l.elapsed) d = l.elapsed + 3 + rand() * 6;
      const end = nowMs + Math.max(1, d - l.elapsed) * MIN;
      free[lc] = Math.max(free[lc], end);
      last = Math.max(last, end);
    }
    for (let i = 0; i < pend.length; i++) {
      const p = pend[i];
      const c = p.court >= 0 ? p.court : earliest(free);
      const freeAt = free[c];
      if (rand() < pWalkover) {
        // W.O.: se resuelve a la hora programada (o ya) sin ocupar pista.
        const start = Math.max(p.planned, nowMs);
        startsBy[i][r] = start;
        last = Math.max(last, start);
        continue;
      }
      const start = Math.max(freeAt > nowMs ? freeAt + changeover : nowMs, p.planned, nowMs);
      const end = start + draw(p.mean) * MIN;
      startsBy[i][r] = start;
      free[c] = end;
      last = Math.max(last, end);
    }
    ends[r] = last;
  }

  ends.sort();
  const spread = cfg.spread ?? 1;
  const mid = q(ends, cfg.endQuantile ?? 0.5);
  result.starts = Object.fromEntries(
    pend.map((p, i) => {
      const a = startsBy[i].sort();
      return [p.key, new Date(Math.max(q(a, cfg.startQuantile ?? 0.5), nowMs)).toISOString()];
    }),
  );
  result.estimatedEnd = new Date(mid).toISOString();
  const median0 = q(ends, 0.5);
  result.estimatedEndLow = new Date(mid - (median0 - q(ends, 0.1)) * spread).toISOString();
  result.estimatedEndHigh = new Date(mid + (q(ends, 0.9) - median0) * spread).toISOString();
  return result;
}

export interface ManualProgress {
  /** Partidos del día en total, terminados y en juego (cifras que anota el club). */
  total: number;
  finished: number;
  live: number;
  courts: number;
  /** Duración media por partido y retraso medio al empezar (minutos), si el club los conoce. */
  avgDurationMin?: number;
  delayMin?: number;
}

/**
 * Estimación sencilla con las cifras que introduce el club: los partidos que quedan se reparten por rondas entre las pistas.
 * Cada ronda dura la duración media más el cambio de pista; los partidos en juego acaban, de media, a mitad de duración.
 */
export function estimateManual(p: ManualProgress, now: Date, cfg: EstimateConfig = defaultEstimateConfig): Estimate {
  const avg = p.avgDurationMin && p.avgDurationMin > 0 ? p.avgDurationMin : (cfg.defaultMatchMin ?? defaultPriors.globalMean);
  const courts = Math.max(1, Math.round(p.courts));
  const remaining = Math.max(0, p.total - p.finished - p.live);
  const done = remaining === 0 && p.live === 0 && p.total > 0;
  const rounds = Math.ceil(remaining / courts);
  const at = (factor: number) => new Date(now.getTime() + ((p.live > 0 ? avg / 2 : 0) + rounds * (avg + cfg.changeoverMin)) * factor * MIN).toISOString();
  return {
    asOf: now.toISOString(),
    total: p.total,
    finished: p.finished,
    live: p.live,
    remaining,
    avgDurationMin: p.avgDurationMin,
    delayMin: p.delayMin,
    courts,
    basis: 'manual',
    done,
    estimatedEnd: done ? now.toISOString() : at(1),
    estimatedEndLow: done ? undefined : at(0.85),
    estimatedEndHigh: done ? undefined : at(1.2),
    starts: {},
  };
}
