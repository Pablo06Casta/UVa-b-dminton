import { describe, expect, it } from 'vitest';
import { defaultEstimateConfig, estimate, type Slot } from '../src/estimate';
import { estimate as legacy } from './helpers/legacyEstimate';
import { priorsWithout, realDays, replay, summarize, type Checkpoint, type Estimator } from './helpers/backtest';

/**
 * Pruebas con datos REALES: 10 jornadas de torneos absolutos terminados (≈1.300 partidos, anónimos). Se «reproduce» cada jornada
 * con lecturas cada 15 minutos y se compara la estimación con lo que pasó. Los valores a priori se calculan sin la jornada evaluada.
 * Si alguien empeora el estimador, estas pruebas fallan.
 */
const days = realDays();
const evaluate = (est: Estimator, visible: boolean, loo = true): Checkpoint[] =>
  days.flatMap((d) => replay(d, est, loo ? { ...defaultEstimateConfig, priors: priorsWithout(days, d.id) } : { defaultMatchMin: 35, changeoverMin: 4, simulations: 300 }, { courtsVisible: visible }));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('estimación frente a torneos reales', () => {
  const now = evaluate(estimate as Estimator, false);
  const old = evaluate(legacy as Estimator, false, false);
  const nowVisible = evaluate(estimate as Estimator, true);

  it('hay datos suficientes para que la prueba valga', () => {
    expect(days.filter((d) => d.slots.length > 20).length).toBeGreaterThanOrEqual(9);
    expect(now.length).toBeGreaterThan(300);
  });

  it('antes de empezar el torneo el error de la hora de fin es muy inferior al del estimador anterior', () => {
    const a = summarize(now)[0];
    const b = summarize(old)[0];
    expect(a.endMAE).toBeLessThan(35); // minutos
    expect(a.endMAE).toBeLessThan(b.endMAE / 2);
    expect(Math.abs(a.endBias)).toBeLessThan(10); // sin sesgo sistemático
  });

  it('durante el torneo el error de la hora de fin y de inicio de cada partido es razonable y mejora al anterior', () => {
    const s = summarize(now).slice(1);
    const o = summarize(old).slice(1);
    for (const [i, x] of s.entries()) {
      expect(x.endMAE).toBeLessThan(23);
      expect(x.startMAE).toBeLessThan(23);
      expect(x.endMAE).toBeLessThanOrEqual(o[i].endMAE + 1);
    }
    expect(avg(now.flatMap((c) => c.startErrors))).toBeLessThan(avg(old.flatMap((c) => c.startErrors)) * 0.7);
  });

  it('el margen probable acierta aproximadamente el 80 % de las veces', () => {
    for (const pts of [now, nowVisible]) {
      const cover = avg(pts.map((p) => (p.low <= p.trueEnd && p.trueEnd <= p.high ? 1 : 0)));
      expect(cover).toBeGreaterThan(0.7);
      expect(cover).toBeLessThan(0.95);
    }
  });

  it('con las pistas publicadas, en la recta final el error baja a unos 10 minutos', () => {
    expect(summarize(nowVisible)[3].endMAE).toBeLessThan(13);
  });

  it('es determinista: la misma lectura da la misma estimación', () => {
    const d = days.find((x) => x.slots.length > 100)!;
    const cfg = { ...defaultEstimateConfig, priors: priorsWithout(days, d.id) };
    const a = replay(d, estimate as Estimator, cfg).map((c) => c.predictedEnd);
    const b = replay(d, estimate as Estimator, cfg).map((c) => c.predictedEnd);
    expect(a).toEqual(b);
  });
});

describe('propiedades del modelo', () => {
  const NOW = new Date('2026-10-24T10:00:00Z');
  const at = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
  const pend = (i: number, over: Partial<Slot> = {}): Slot => ({ key: `p${i}`, plannedUtc: at(10 + 35 * Math.floor(i / 4)), orderIdx: i, status: 'scheduled', event: 'IM', ...over });
  const done = (i: number, d: number, over: Partial<Slot> = {}): Slot => ({ key: `d${i}`, plannedUtc: at(-120), orderIdx: -i, status: 'finished', durationMin: d, event: 'IM', finishedSeenAt: at(-5), ...over });

  it('sin datos propios usa lo medido en torneos reales (≈ 29 min, no 35)', () => {
    const slots = Array.from({ length: 8 }, (_, i) => pend(i));
    const e = estimate(slots, NOW);
    expect(e.basis).toBe('default');
    // dos filas de 4 partidos a las 10:10 y 10:45 → fin hacia las 11:15 + duración típica
    const end = Date.parse(e.estimatedEnd!) - Date.parse(at(45));
    expect(end).toBeGreaterThan(24 * 60_000);
    expect(end).toBeLessThan(45 * 60_000);
  });

  it('se adapta al ritmo del torneo: si los partidos terminados son largos, el fin se retrasa; si son cortos, se adelanta', () => {
    const base = Array.from({ length: 12 }, (_, i) => pend(i));
    const slow = estimate([...Array.from({ length: 40 }, (_, i) => done(i, 40)), ...base], NOW);
    const fast = estimate([...Array.from({ length: 40 }, (_, i) => done(i, 20)), ...base], NOW);
    expect(Date.parse(slow.estimatedEnd!)).toBeGreaterThan(Date.parse(fast.estimatedEnd!));
    expect(slow.avgDurationMin).toBe(40);
    expect(fast.avgDurationMin).toBe(20);
  });

  it('con pocos partidos terminados manda lo a priori; con muchos, lo observado', () => {
    const base = Array.from({ length: 12 }, (_, i) => pend(i));
    const few = estimate([done(0, 50), ...base], NOW);
    const many = estimate([...Array.from({ length: 60 }, (_, i) => done(i, 50)), ...base], NOW);
    const none = estimate(base, NOW);
    const d = (x: typeof few) => Date.parse(x.estimatedEnd!);
    expect(d(few) - d(none)).toBeLessThan((d(many) - d(none)) / 2);
  });

  it('un partido en juego no acaba antes de lo que ya lleva jugado', () => {
    const live: Slot = { key: 'l', plannedUtc: at(-60), orderIdx: 0, status: 'on_court', event: 'IM', court: '1', startedSeenAt: at(-50), prevPollAt: at(-50) };
    const next: Slot = { key: 'n', plannedUtc: at(-30), orderIdx: 1, status: 'scheduled', event: 'IM', court: '1' };
    const e = estimate([live, next], NOW);
    expect(Date.parse(e.estimatedEnd!)).toBeGreaterThan(NOW.getTime() + 60_000);
    expect(Date.parse(e.starts.n)).toBeGreaterThan(NOW.getTime());
  });

  it('los W.O. no ocupan pista: más W.O. observados acortan la estimación', () => {
    const base = Array.from({ length: 16 }, (_, i) => pend(i));
    const wo = (i: number): Slot => ({ key: `w${i}`, plannedUtc: at(-60), orderIdx: -i, status: 'walkover', event: 'IM' });
    const lots = estimate([...Array.from({ length: 30 }, (_, i) => wo(i)), ...Array.from({ length: 10 }, (_, i) => done(i, 29)), ...base], NOW);
    const few = estimate([...Array.from({ length: 10 }, (_, i) => done(i, 29)), ...Array.from({ length: 30 }, (_, i) => done(100 + i, 29)), ...base], NOW);
    expect(Date.parse(lots.estimatedEnd!)).toBeLessThanOrEqual(Date.parse(few.estimatedEnd!));
  });

  it('los individuales se estiman más cortos que los dobles', () => {
    const mk = (ev: string) => Array.from({ length: 12 }, (_, i) => pend(i, { event: ev, plannedUtc: at(10) }));
    const s = estimate(mk('IM'), NOW);
    const d = estimate(mk('DM'), NOW);
    expect(Date.parse(d.estimatedEnd!)).toBeGreaterThan(Date.parse(s.estimatedEnd!));
  });

  it('nunca estima un inicio anterior a «ahora» ni al horario programado', () => {
    const slots = Array.from({ length: 20 }, (_, i) => pend(i));
    const e = estimate(slots, NOW);
    for (const s of slots) {
      const t = Date.parse(e.starts[s.key]);
      expect(t).toBeGreaterThanOrEqual(NOW.getTime());
      expect(t).toBeGreaterThanOrEqual(Date.parse(s.plannedUtc!));
    }
  });

  it('es rápida: una jornada de 200 partidos con 400 simulaciones tarda menos de 150 ms', () => {
    const slots: Slot[] = Array.from({ length: 200 }, (_, i) => pend(i, { court: `${(i % 9) + 1}` }));
    estimate(slots, NOW); // calentamiento
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) estimate(slots, new Date(NOW.getTime() + i * 5 * 60_000));
    const each = (performance.now() - t0) / 5;
    expect(each).toBeLessThan(150);
  });
});
