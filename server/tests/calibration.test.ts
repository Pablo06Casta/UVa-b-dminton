import { describe, expect, it } from 'vitest';
import { applyShift, learnedShift } from '../src/calibration';
import type { Estimate } from '../src/estimate';
import { memDb } from './helpers/fakes';

const NOW = new Date('2026-11-20T10:00:00Z');
const at = (day: number, hhmm: string) => `2026-11-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;

/** Una jornada terminada cuyo último partido acabó a las 12:00 y cuya estimación a 60 min llegó `errMin` minutos pronto (−) o tarde (+). */
function seedDay(db: ReturnType<typeof memDb>, day: number, errMin: number, startErrMin = 0) {
  const g = `G${day}`;
  const date = `2026-11-${String(day).padStart(2, '0')}`;
  db.prepare('insert into tournaments(guid, name, discovered_at) values(?,?,?)').run(g, `Torneo ${day}`, at(day, '00:00'));
  const slot = db.prepare('insert into slots(key, tournament_guid, date, planned_utc, order_idx, status, started_seen_at, prev_poll_at, finished_seen_at, updated_at, event) values(?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 6; i++) {
    const start = `${String(9 + i * 0.5 | 0).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    slot.run(`${g}-${i}`, g, date, at(day, start), i, 'finished', at(day, start), at(day, start), at(day, '12:00'), at(day, '12:00'), 'IM');
  }
  const mins = (m: number) => new Date(Date.parse(at(day, '12:00')) + m * 60_000).toISOString();
  const log = db.prepare('insert into estimate_log(tournament_guid, date, at, est_end, est_end_low, est_end_high, remaining, finished, total) values(?,?,?,?,?,?,?,?,?)');
  for (const before of [120, 60, 30]) log.run(g, date, mins(-before), mins(errMin), mins(errMin - 10), mins(errMin + 10), 3, 3, 6);
  const st = db.prepare('insert into estimate_starts(tournament_guid, date, at, slot_key, est_start) values(?,?,?,?,?)');
  for (let i = 0; i < 6; i++) {
    const start = `${String(9 + i * 0.5 | 0).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    st.run(g, date, new Date(Date.parse(at(day, start)) - 40 * 60_000).toISOString(), `${g}-${i}`, new Date(Date.parse(at(day, start)) + startErrMin * 60_000).toISOString());
  }
}

describe('autocorrección de la estimación', () => {
  it('con pocas jornadas medidas no corrige nada', () => {
    const db = memDb();
    seedDay(db, 1, -15);
    seedDay(db, 2, -15);
    expect(learnedShift(db, NOW)).toEqual({ endMin: 0, startMin: 0, days: 0 });
  });

  it('si el modelo llega sistemáticamente pronto, retrasa la hora estimada con prudencia y con tope', () => {
    const db = memDb();
    for (const d of [1, 2, 3, 4, 5, 6]) seedDay(db, d, -12, -4);
    const s = learnedShift(db, NOW);
    expect(s.days).toBe(6);
    expect(s.endMin).toBeCloseTo(12 * (6 / 10), 0); // desvío mediano 12 min × n/(n+4)
    expect(s.startMin).toBeCloseTo(4 * 0.6, 0);
    const big = memDb();
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) seedDay(big, d, -90);
    expect(learnedShift(big, NOW).endMin).toBeLessThanOrEqual(20); // tope
  });

  it('una estimación sin sesgo no se toca', () => {
    const db = memDb();
    for (const d of [1, 2, 3, 4]) seedDay(db, d, d % 2 ? 6 : -6);
    expect(Math.abs(learnedShift(db, NOW).endMin)).toBeLessThanOrEqual(1);
  });

  it('desplaza fin y márgenes y las horas de inicio pendientes', () => {
    const est = { estimatedEnd: '2026-11-07T12:00:00.000Z', estimatedEndLow: '2026-11-07T11:40:00.000Z', estimatedEndHigh: '2026-11-07T12:20:00.000Z', starts: { a: '2026-11-07T10:00:00.000Z' } } as unknown as Estimate;
    const out = applyShift(est, { endMin: 7, startMin: 2, days: 5 });
    expect(out.estimatedEnd).toBe('2026-11-07T12:07:00.000Z');
    expect(out.estimatedEndLow).toBe('2026-11-07T11:47:00.000Z');
    expect(out.starts.a).toBe('2026-11-07T10:02:00.000Z');
    expect(applyShift(est, { endMin: 0, startMin: 0, days: 0 })).toBe(est);
  });
});
