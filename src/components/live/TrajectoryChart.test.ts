import { describe, expect, it } from 'vitest';
import type { Tournament } from '../../types';
import { trajectoryOf } from './TrajectoryChart';

const t = (id: string, startDate: string, record?: Tournament['record']) => ({ id, name: id, startDate, city: 'X', record }) as Tournament;

describe('trayectoria del club', () => {
  it('ordena por fecha, acumula los partidos ganados y se salta los torneos sin balance', () => {
    const pts = trajectoryOf([
      t('c', '2026-05-23', { won: 7, lost: 1, gold: 2, silver: 0, bronze: 0 }),
      t('sin', '2026-03-01'),
      t('a', '2025-12-20', { won: 4, lost: 2, gold: 0, silver: 0, bronze: 0 }),
      t('b', '2026-04-14', { won: 9, lost: 2, gold: 1, silver: 1, bronze: 2 }),
    ]);
    expect(pts.map((p) => [p.id, p.won, p.total])).toEqual([['a', 4, 4], ['b', 9, 13], ['c', 7, 20]]);
    expect(pts[1]).toMatchObject({ gold: 1, silver: 1, bronze: 2, lost: 2 });
  });

  it('sin ningún balance no hay puntos (la sección no se muestra)', () => {
    expect(trajectoryOf([t('x', '2026-01-01')])).toEqual([]);
  });
});
