import { describe, expect, it } from 'vitest';
import { applyShift, learnedShift } from '../src/calibration';
import { defaultPriors, type Estimate } from '../src/estimate';
import { consolidate, learnedPriors, loadPatterns, purgeGhostEra } from '../src/patterns';
import { memDb } from './helpers/fakes';

const NOW = new Date('2026-11-20T10:00:00Z');
const at = (day: number, hhmm: string) => `2026-11-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;

/** Una jornada terminada de 30 partidos (IM) de `dur` minutos, 2 de ellos W.O.; la estimación de fin llegó `errMin` min antes (−) o después (+) con margen ±`half`. */
function seedDay(db: ReturnType<typeof memDb>, day: number, dur: number, errMin: number, half = 10) {
  const g = `G${day}`;
  const date = `2026-11-${String(day).padStart(2, '0')}`;
  db.prepare('insert into tournaments(guid, name, discovered_at) values(?,?,?)').run(g, `Torneo ${day}`, at(day, '00:00'));
  const slot = db.prepare('insert into slots(key, tournament_guid, date, planned_utc, order_idx, court, status, duration_min, started_seen_at, prev_poll_at, finished_seen_at, updated_at, event) values(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 32; i++) {
    const t = at(day, `${String(9 + (i >> 2)).padStart(2, '0')}:00`);
    slot.run(`${g}-${i}`, g, date, t, i, `P${i % 4}`, i < 2 ? 'walkover' : 'finished', i < 2 ? null : dur, t, t, at(day, '12:00'), at(day, '12:00'), 'IM');
  }
  const mins = (m: number) => new Date(Date.parse(at(day, '12:00')) + m * 60_000).toISOString();
  const log = db.prepare('insert into estimate_log(tournament_guid, date, at, est_end, est_end_low, est_end_high, remaining, finished, total) values(?,?,?,?,?,?,?,?,?)');
  for (const before of [120, 60, 30]) log.run(g, date, mins(-before), mins(errMin), mins(errMin - half), mins(errMin + half), 3, 3, 6);
}

describe('patrones de seguimiento', () => {
  it('guarda un patrón anónimo por jornada terminada, una sola vez', () => {
    const db = memDb();
    seedDay(db, 1, 40, 0);
    expect(consolidate(db, NOW)).toBe(1);
    expect(consolidate(db, NOW)).toBe(0);
    const [p] = loadPatterns(db);
    expect(p).toMatchObject({ matches: 32, played: 30, walkovers: 2, avgDurationMin: 40, courts: 4 });
    expect(p.perEvent.IM.n).toBe(30);
    expect(Object.keys(p)).not.toContain('players'); // solo cifras
  });

  it('con menos de 3 jornadas usa los valores de partida', () => {
    const db = memDb();
    seedDay(db, 1, 40, 0);
    seedDay(db, 2, 40, 0);
    consolidate(db, NOW);
    expect(learnedPriors(db)).toEqual({ priors: defaultPriors, days: 0, matches: 0 });
  });

  it('aprende la duración real de las pruebas, con prudencia, y la proporción de W.O.', () => {
    const db = memDb();
    for (const d of [1, 2, 3, 4, 5, 6]) seedDay(db, d, 40, 0);
    consolidate(db, NOW);
    const l = learnedPriors(db);
    expect(l.days).toBe(6);
    expect(l.priors.mean.IM).toBeGreaterThan(defaultPriors.mean.IM);
    expect(l.priors.mean.IM).toBeLessThan(40); // no salta del todo al valor observado
    expect(l.priors.mean.DM).toBe(defaultPriors.mean.DM); // lo que no ha visto no se toca
    expect(l.priors.walkover).toBeGreaterThan(defaultPriors.walkover - 0.01);
    expect(l.priors.cv).toBeLessThan(defaultPriors.cv); // duraciones idénticas: menos dispersión
  });

  it('ensancha el margen si no acierta el 80 % y lo aplica en torno a la hora estimada', () => {
    const db = memDb();
    for (const d of [1, 2, 3, 4, 5, 6]) seedDay(db, d, 30, d % 2 ? 25 : -25, 10); // errores de ±25 con margen ±10
    const s = learnedShift(db, NOW);
    expect(s.spread).toBeGreaterThan(1);
    const est = { estimatedEnd: '2026-11-07T12:00:00.000Z', estimatedEndLow: '2026-11-07T11:50:00.000Z', estimatedEndHigh: '2026-11-07T12:10:00.000Z', starts: {} } as unknown as Estimate;
    const out = applyShift(est, { endMin: 0, startMin: 0, days: 6, spread: 1.5 });
    expect(out.estimatedEndLow).toBe('2026-11-07T11:45:00.000Z');
    expect(out.estimatedEndHigh).toBe('2026-11-07T12:15:00.000Z');
  });

  it('estrecha el margen si acierta de sobra y lo deja como está si ya acierta ~80 %', () => {
    const db = memDb();
    for (const d of [1, 2, 3, 4, 5, 6]) seedDay(db, d, 30, 0, 40); // error 0 con margen ±40
    expect(learnedShift(db, NOW).spread).toBeLessThan(1);
  });
});

describe('migración de partidos fantasma', () => {
  it('descarta una sola vez las estimaciones y patrones anteriores', () => {
    const db = memDb();
    seedDay(db, 1, 30, 40);
    consolidate(db, NOW);
    expect(loadPatterns(db)).toHaveLength(1);
    expect(purgeGhostEra(db, NOW)).toBe(true);
    expect(loadPatterns(db)).toHaveLength(0);
    expect((db.prepare('select count(*) n from estimate_log').get() as { n: number }).n).toBe(0);
    seedDay(db, 2, 30, 0); // estimaciones nuevas: ya no se borran
    expect(purgeGhostEra(db, NOW)).toBe(false);
    expect((db.prepare('select count(*) n from estimate_log').get() as { n: number }).n).toBeGreaterThan(0);
  });
});
