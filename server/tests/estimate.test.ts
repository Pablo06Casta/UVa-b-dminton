import { describe, expect, it } from 'vitest';
import { estimate, type Slot } from '../src/estimate';

const T0 = Date.parse('2026-11-07T08:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const NOW = new Date(at(120));

const slot = (i: number, o: Partial<Slot> = {}): Slot => ({
  key: `s${i}`, orderIdx: i, court: String((i % 2) + 1), event: 'IM', status: 'scheduled', plannedUtc: at(i * 15), ...o,
});

describe('estimación del fin del torneo', () => {
  it('sin datos previos usa la duración por defecto y lo indica', () => {
    const e = estimate([slot(0), slot(1), slot(2), slot(3)], new Date(at(0)));
    expect(e.basis).toBe('default');
    expect(e.remaining).toBe(4);
    expect(e.estimatedEnd).toBeDefined();
    expect(e.avgDurationMin).toBeUndefined();
  });

  it('aprende de lo que han tardado los partidos terminados', () => {
    const fin = (i: number, d: number) => slot(i, { status: 'finished', durationMin: d, startedSeenAt: at(i * 15 + 10), prevPollAt: at(i * 15 + 5) });
    const slots = [fin(0, 20), fin(1, 20), fin(2, 20), fin(3, 20), slot(4), slot(5), slot(6), slot(7)];
    const short = estimate(slots, NOW);
    const long = estimate(slots.map((s) => (s.status === 'finished' ? { ...s, durationMin: 50 } : s)), NOW);
    expect(short.basis).toBe('observed');
    expect(short.avgDurationMin).toBe(20);
    expect(Date.parse(long.estimatedEnd!)).toBeGreaterThan(Date.parse(short.estimatedEnd!));
  });

  it('calcula el retraso medio del inicio respecto a lo programado', () => {
    const s = slot(0, { status: 'finished', durationMin: 30, plannedUtc: at(0), startedSeenAt: at(25), prevPollAt: at(15) });
    expect(estimate([s, slot(1)], NOW).delayMin).toBe(20); // vistos entre el min 15 y el 25 → ~20 min tarde
  });

  it('más partidos pendientes y menos pistas retrasan el final', () => {
    const base = [0, 1, 2, 3].map((i) => slot(i, { status: 'finished', durationMin: 30 }));
    const few = estimate([...base, slot(4), slot(5)], NOW);
    const many = estimate([...base, ...[4, 5, 6, 7, 8, 9, 10, 11].map((i) => slot(i))], NOW);
    const oneCourt = estimate([...base, ...[4, 5, 6, 7].map((i) => slot(i, { court: '1' }))].map((s) => ({ ...s, court: '1' })), NOW);
    expect(Date.parse(many.estimatedEnd!)).toBeGreaterThan(Date.parse(few.estimatedEnd!));
    expect(oneCourt.courts).toBe(1);
  });

  it('un partido en juego ocupa su pista hasta que se estima que acaba', () => {
    const slots = [
      slot(0, { status: 'finished', durationMin: 40 }), slot(1, { status: 'finished', durationMin: 40 }),
      slot(2, { status: 'finished', durationMin: 40 }), slot(3, { status: 'finished', durationMin: 40 }),
      slot(4, { status: 'on_court', court: '1', startedSeenAt: at(115), prevPollAt: at(110) }),
      slot(5, { court: '1', plannedUtc: at(100) }),
    ];
    const e = estimate(slots, NOW);
    expect(Date.parse(e.starts.s5)).toBeGreaterThan(NOW.getTime() + 30 * 60_000); // empieza cuando se libera la pista 1
  });

  it('da un margen (P10–P90) que contiene la estimación', () => {
    const fin = (i: number, d: number) => slot(i, { status: 'finished', durationMin: d });
    const e = estimate([fin(0, 20), fin(1, 35), fin(2, 50), fin(3, 28), slot(4), slot(5), slot(6), slot(7), slot(8)], NOW);
    expect(Date.parse(e.estimatedEndLow!)).toBeLessThanOrEqual(Date.parse(e.estimatedEnd!));
    expect(Date.parse(e.estimatedEndHigh!)).toBeGreaterThanOrEqual(Date.parse(e.estimatedEnd!));
  });

  it('es determinista: misma entrada, misma estimación', () => {
    const slots = [slot(0, { status: 'finished', durationMin: 25 }), slot(1, { status: 'finished', durationMin: 33 }), slot(2), slot(3), slot(4)];
    expect(estimate(slots, NOW)).toEqual(estimate(slots, NOW));
  });

  it('con todo terminado no estima: da la hora a la que terminó', () => {
    const e = estimate([slot(0, { status: 'finished', durationMin: 30, finishedSeenAt: at(100) })], NOW);
    expect(e.done).toBe(true);
    expect(e.estimatedEnd).toBe(at(100));
  });

  it('los W.O. no cuentan como duración', () => {
    const e = estimate([slot(0, { status: 'walkover' }), slot(1, { status: 'finished', durationMin: 30 }), slot(2)], NOW);
    expect(e.avgDurationMin).toBe(30);
  });

  it('si solo algunos pendientes traen pista, no se anclan: entran en la primera pista libre', () => {
    const fin = [0, 1, 2, 3].map((i) => slot(i, { status: 'finished', durationMin: 30, court: String((i % 4) + 1) }));
    const mixed = [...fin, ...[4, 5, 6, 7, 8, 9, 10, 11].map((i) => slot(i, { court: i % 2 ? '1' : undefined }))];
    const allOnOne = [...fin, ...[4, 5, 6, 7, 8, 9, 10, 11].map((i) => slot(i, { court: '1' }))];
    expect(Date.parse(estimate(mixed, NOW).estimatedEnd!)).toBeLessThan(Date.parse(estimate(allOnOne, NOW).estimatedEnd!));
  });
});

describe('horas estimadas sin pistas publicadas', () => {
  const T = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 24, h, m)).toISOString();
  const slot = (key: string, at: string, over: Partial<Slot> = {}): Slot => ({ key, status: 'scheduled', plannedUtc: at, orderIdx: 0, ...over } as Slot);

  it('antes de empezar el torneo, la hora estimada es la programada (no se acumula una cola)', () => {
    // 40 partidos programados cada 35 min, 4 a la vez (4 pistas deducidas), sin pistas publicadas.
    const slots: Slot[] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 4; c++) slots.push(slot(`m${r}-${c}`, T(7, 35 * r)));
    const e = estimate(slots, new Date(Date.UTC(2026, 9, 21, 10)));
    for (const s of slots) expect(e.starts[s.key]).toBe(s.plannedUtc);
    expect(e.courts).toBe(4);
  });

  it('con el torneo en marcha, los retrasos reales sí se aplican, pero no más de lo razonable', () => {
    const slots: Slot[] = [
      slot('a', T(7), { status: 'finished', durationMin: 30, startedSeenAt: T(7, 20), prevPollAt: T(7, 20), finishedSeenAt: T(7, 50) }),
      slot('b', T(7), { status: 'finished', durationMin: 30, startedSeenAt: T(7, 20), prevPollAt: T(7, 20), finishedSeenAt: T(7, 50) }),
      slot('c', T(8)), slot('d', T(8)), slot('e', T(8, 35)), slot('f', T(8, 35)),
    ];
    const e = estimate(slots, new Date(Date.UTC(2026, 9, 24, 7, 55)));
    const delayH = (k: string) => (Date.parse(e.starts[k]) - Date.parse(slots.find((s) => s.key === k)!.plannedUtc!)) / 3_600_000;
    expect(delayH('c')).toBeLessThan(1); // con 2 pistas deducidas no se apila todo en una
    expect(delayH('e')).toBeLessThan(1.5);
    expect(delayH('c')).toBeGreaterThanOrEqual(0);
  });
});
