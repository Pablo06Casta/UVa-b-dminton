/**
 * Banco de pruebas de la estimación con datos REALES y anónimos de torneos terminados (tests/data/real-days.json).
 *
 * Reconstruye cada jornada: las horas programadas, pistas, duraciones y W.O. son los reales; el inicio real de cada partido se
 * obtiene de la propia lógica de una pista (empieza cuando está libre y no antes de la hora programada). Luego «reproduce» la
 * jornada: cada 15 minutos el servidor ve lo que vería en directo (partidos terminados con su duración, partidos en pista y
 * los pendientes sin pista) y se le pide la hora de fin y la hora de inicio de cada partido pendiente. Se compara con lo que
 * pasó de verdad. Las lecturas previas (los datos de aprendizaje) nunca incluyen la jornada que se está probando.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Estimate, EstimateConfig, Priors, Slot } from '../../src/estimate';

export interface RealSlot {
  order: number;
  event?: string;
  phase: 'group' | 'ko';
  plannedMin?: number;
  court?: string;
  durationMin?: number;
  status: Slot['status'];
  doubles: boolean;
}
export interface RealDay { id: string; date: string; slots: RealSlot[] }

export const realDays = (): RealDay[] => (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'data', 'real-days.json'), 'utf8')) as { days: RealDay[] }).days;

const MIN = 60_000;
const CHANGEOVER = 3;
export type Estimator = (slots: Slot[], now: Date, cfg: EstimateConfig) => Estimate;

interface TruthSlot { s: RealSlot; key: string; planned: number; start: number; end: number; wo: boolean }

/** Reconstruye cuándo empezó y acabó cada partido de la jornada. */
export function truthOf(day: RealDay): TruthSlot[] {
  const base = Date.UTC(2026, 0, 1);
  const slots = day.slots
    .filter((s) => s.plannedMin !== undefined)
    .map((s) => ({ s, key: `${day.id}:${s.order}`, planned: base + s.plannedMin! * MIN, start: 0, end: 0, wo: s.status === 'walkover' }))
    .sort((a, b) => a.planned - b.planned || a.s.order - b.s.order);
  const free = new Map<string, number>();
  for (const t of slots) {
    const court = t.s.court ?? `c${t.s.order % 7}`;
    const freeAt = free.get(court) ?? 0;
    const dur = t.wo ? 0 : t.s.durationMin ?? 28;
    t.start = Math.max(t.planned, freeAt > t.planned ? freeAt + CHANGEOVER * MIN : t.planned);
    t.end = t.start + dur * MIN;
    if (!t.wo) free.set(court, t.end);
  }
  return slots;
}

export interface Checkpoint {
  at: number;
  progress: number;
  predictedEnd: number;
  low: number;
  high: number;
  trueEnd: number;
  startErrors: number[];
  startBias: number[];
}

/** Reproduce la jornada con lecturas cada `pollMin` minutos. `courtsVisible`: si los pendientes ya traen pista. */
export function replay(day: RealDay, estimator: Estimator, cfg: EstimateConfig, opts: { pollMin?: number; courtsVisible?: boolean } = {}): Checkpoint[] {
  const poll = (opts.pollMin ?? 15) * MIN;
  const truth = truthOf(day);
  if (truth.length < 10) return [];
  const t0 = Math.min(...truth.map((t) => t.start));
  const trueEnd = Math.max(...truth.map((t) => t.end));
  const out: Checkpoint[] = [];
  for (let now = t0 - 30 * MIN; now < trueEnd; now += poll) {
    const prev = now - poll;
    const slots: Slot[] = truth.map((t) => {
      const base = { key: t.key, plannedUtc: new Date(t.planned).toISOString(), orderIdx: t.s.order, event: t.s.event };
      if (t.wo ? t.planned <= now : t.end <= now) {
        return { ...base, court: t.s.court, status: t.wo ? 'walkover' : 'finished', durationMin: t.wo ? undefined : t.s.durationMin, finishedSeenAt: new Date(now).toISOString() } as Slot;
      }
      if (!t.wo && t.start <= now) {
        return { ...base, court: t.s.court, status: 'on_court', startedSeenAt: new Date(now).toISOString(), prevPollAt: new Date(Math.max(prev, t.start - 0)).toISOString() } as Slot;
      }
      return { ...base, court: opts.courtsVisible ? t.s.court : undefined, status: 'scheduled' } as Slot;
    });
    const done = truth.filter((t) => (t.wo ? t.planned <= now : t.end <= now)).length;
    const est = estimator(slots, new Date(now), cfg);
    if (est.done || !est.estimatedEnd) continue;
    const startErrors: number[] = [];
    const startBias: number[] = [];
    for (const t of truth) {
      const p = est.starts[t.key];
      if (p === undefined || t.start <= now || t.wo) continue; // solo pendientes que de verdad se jugaron
      const e = (Date.parse(p) - t.start) / MIN;
      startErrors.push(Math.abs(e));
      startBias.push(e);
    }
    out.push({
      at: now,
      progress: done / truth.length,
      predictedEnd: Date.parse(est.estimatedEnd),
      low: Date.parse(est.estimatedEndLow ?? est.estimatedEnd),
      high: Date.parse(est.estimatedEndHigh ?? est.estimatedEnd),
      trueEnd,
      startErrors,
      startBias,
    });
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export interface Summary {
  bucket: string;
  n: number;
  endMAE: number;
  endBias: number;
  coverage: number;
  startMAE: number;
  startBias: number;
}

const BUCKETS: [string, number, number][] = [
  ['antes/inicio (<10 %)', -1, 0.1],
  ['10-40 %', 0.1, 0.4],
  ['40-70 %', 0.4, 0.7],
  ['70-95 %', 0.7, 0.95],
];

/** Resume los puntos de control por tramo de avance del torneo. */
export function summarize(all: Checkpoint[]): Summary[] {
  return BUCKETS.map(([bucket, lo, hi]) => {
    const c = all.filter((x) => x.progress >= lo && x.progress < hi);
    return {
      bucket,
      n: c.length,
      endMAE: mean(c.map((x) => Math.abs(x.predictedEnd - x.trueEnd) / MIN)),
      endBias: mean(c.map((x) => (x.predictedEnd - x.trueEnd) / MIN)),
      coverage: mean(c.map((x) => (x.low <= x.trueEnd && x.trueEnd <= x.high ? 1 : 0))),
      startMAE: mean(c.flatMap((x) => x.startErrors)),
      startBias: mean(c.flatMap((x) => x.startBias)),
    };
  });
}

/** Valores a priori calculados SIN la jornada indicada (validación «dejando uno fuera»). */
export function priorsWithout(days: RealDay[], exceptTournament: string): Priors {
  const slots = days.filter((d) => d.id !== exceptTournament).flatMap((d) => d.slots.map((s) => ({ ...s, t: d.id })));
  const played = slots.filter((s) => (s.status === 'finished' || s.status === 'retired') && s.durationMin);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs: number[]) => Math.sqrt(avg(xs.map((x) => (x - avg(xs)) ** 2)));
  const byEvent: Record<string, number> = {};
  for (const ev of ['IM', 'IF', 'DM', 'DF', 'DX']) {
    const xs = played.filter((s) => (s.event ?? '').slice(0, 2) === ev).map((s) => s.durationMin!);
    if (xs.length >= 20) byEvent[ev] = avg(xs);
  }
  const all = played.map((s) => s.durationMin!);
  const tournaments = [...new Set(played.map((s) => s.t))];
  const tMeans = tournaments.map((t) => avg(played.filter((s) => s.t === t).map((s) => s.durationMin!)));
  return {
    mean: byEvent,
    globalMean: avg(all),
    cv: sd(all) / avg(all),
    walkover: slots.filter((s) => s.status === 'walkover').length / slots.length,
    paceTau: sd(tMeans) / avg(tMeans),
  };
}
