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

export interface EstimateConfig {
  /** Duración que se supone si aún no hay partidos terminados de los que aprender. */
  defaultMatchMin: number;
  /** Tiempo entre un partido y el siguiente en la misma pista. */
  changeoverMin: number;
  simulations: number;
}

export const defaultEstimateConfig: EstimateConfig = { defaultMatchMin: 35, changeoverMin: 4, simulations: 300 };

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
  /** `observed` si hay partidos terminados de los que aprender; `default` si se usa la duración por defecto. */
  basis: 'observed' | 'default';
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
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
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

export function estimate(slots: Slot[], now: Date, cfg: EstimateConfig = defaultEstimateConfig): Estimate {
  const nowMs = now.getTime();
  const isDone = (s: Slot) => s.status === 'finished' || s.status === 'walkover' || s.status === 'retired';
  const finished = slots.filter(isDone);
  const live = slots.filter((s) => s.status === 'on_court');
  const pending = slots
    .filter((s) => !isDone(s) && s.status !== 'on_court')
    .sort((a, b) => (a.plannedUtc ?? '').localeCompare(b.plannedUtc ?? '') || a.orderIdx - b.orderIdx);

  // Duraciones reales de partidos disputados (los W.O. no cuentan).
  const played = finished.filter((s) => s.status !== 'walkover' && s.durationMin && s.durationMin > 0);
  const all = played.map((s) => s.durationMin!);
  const byGroup = new Map<string, number[]>();
  for (const s of played) byGroup.set(group(s.event), [...(byGroup.get(group(s.event)) ?? []), s.durationMin!]);
  const samplesFor = (e?: string) => {
    const g = byGroup.get(group(e));
    return g && g.length >= 4 ? g : all;
  };
  const meanFor = (e?: string) => mean(samplesFor(e)) ?? cfg.defaultMatchMin;
  const basis: Estimate['basis'] = all.length > 0 ? 'observed' : 'default';

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

  const courtIds = new Set(slots.map((s) => s.court).filter((c): c is string => !!c));
  const courts = Math.max(1, courtIds.size);

  const base: Estimate = {
    asOf: now.toISOString(),
    total: slots.length,
    finished: finished.length,
    live: live.length,
    remaining: pending.length,
    avgDurationMin: mean(all) === undefined ? undefined : Math.round(mean(all)! * 10) / 10,
    plannedSlotMin: plannedSlotMin === undefined ? undefined : Math.round(plannedSlotMin),
    delayMin: delayMin === undefined ? undefined : Math.round(delayMin),
    courts,
    basis,
    done: pending.length === 0 && live.length === 0 && slots.length > 0,
    starts: {},
  };

  if (base.done) {
    const last = finished.map((s) => s.finishedSeenAt).filter((x): x is string => !!x).sort().at(-1);
    return { ...base, estimatedEnd: last };
  }
  if (slots.length === 0) return base;

  // Simulación: cada pista queda libre cuando acaba su partido en juego. Si TODOS los pendientes traen pista (pistas
  // preasignadas) cada uno espera a la suya; si no (pista asignada al llamar el partido), entra en la primera libre.
  // Respeta la hora programada como hora mínima de inicio.
  const courtList = courtIds.size ? [...courtIds] : ['?'];
  const preassigned = pending.length > 0 && pending.every((s) => s.court && courtIds.has(s.court));
  const simulate = (draw: (e?: string) => number) => {
    const free = new Map<string, number>(courtList.map((c) => [c, nowMs]));
    const earliest = () => [...free.entries()].sort((a, b) => a[1] - b[1])[0][0];
    for (const s of live) {
      const startedAt = s.startedSeenAt ? Date.parse(s.startedSeenAt) : nowMs;
      const end = Math.max(nowMs + 2 * MIN, startedAt + draw(s.event) * MIN); // un partido en juego no acaba "ya mismo" ni en el pasado
      const c = s.court && free.has(s.court) ? s.court : earliest();
      free.set(c, Math.max(free.get(c)!, end));
    }
    const starts: Record<string, number> = {};
    let last = Math.max(nowMs, ...free.values());
    for (const s of pending) {
      const c = preassigned && s.court && free.has(s.court) ? s.court : earliest();
      const freeAt = free.get(c)!;
      const planned = s.plannedUtc ? Date.parse(s.plannedUtc) : 0;
      const start = Math.max(freeAt + (freeAt > nowMs ? cfg.changeoverMin * MIN : 0), planned, nowMs);
      const end = start + draw(s.event) * MIN;
      starts[s.key] = start;
      free.set(c, end);
      last = Math.max(last, end);
    }
    return { starts, end: last };
  };

  const det = simulate((e) => meanFor(e));
  const rand = rng(Math.floor(nowMs / (5 * MIN)) + slots.length);
  const ends: number[] = [];
  for (let n = 0; n < cfg.simulations; n++) {
    ends.push(
      simulate((e) => {
        const samples = samplesFor(e);
        if (samples.length >= 3) return samples[Math.floor(rand() * samples.length)];
        return meanFor(e) * (0.75 + rand() * 0.5);
      }).end,
    );
  }
  base.starts = Object.fromEntries(Object.entries(det.starts).map(([k, v]) => [k, new Date(v).toISOString()]));
  base.estimatedEnd = new Date(median(ends) ?? det.end).toISOString();
  base.estimatedEndLow = new Date(quantile(ends, 0.1)).toISOString();
  base.estimatedEndHigh = new Date(quantile(ends, 0.9)).toISOString();
  return base;
}
