import { describe, expect, it } from 'vitest';
import type { Tournament } from '../../types';
import { entriesOf, monthlyOf, type TrajectoryEntry } from './TrajectoryChart';

const e = (id: string, date: string, won: number, lost = 0, medals: Partial<TrajectoryEntry> = {}): TrajectoryEntry => ({ id, name: id, date, won, lost, gold: 0, silver: 0, bronze: 0, ...medals });
const NOW = new Date('2026-10-21T10:00:00+02:00');

describe('trayectoria mensual de los últimos 5 años', () => {
  it('abarca 60 meses hasta el mes actual, agrupa por mes y acumula', () => {
    const m = monthlyOf([e('a', '2025-12-20', 4, 2), e('b', '2025-12-21', 1), e('c', '2026-04-14', 9, 2, { gold: 1, bronze: 2 }), e('fuera', '2021-09-30', 50), e('futuro', '2026-12-01', 7)], NOW);
    expect(m).toHaveLength(60);
    expect(m[0].key).toBe('2021-11');
    expect(m.at(-1)!.key).toBe('2026-10');
    const dec = m.find((x) => x.key === '2025-12')!;
    expect([dec.won, dec.lost, dec.items.length, dec.total]).toEqual([5, 2, 2, 5]);
    const apr = m.find((x) => x.key === '2026-04')!;
    expect([apr.won, apr.total, apr.gold, apr.bronze]).toEqual([9, 14, 1, 2]);
    expect(m.at(-1)!.total).toBe(14); // lo anterior a la ventana y lo futuro no cuentan
    expect(m.find((x) => x.key === '2026-01')!.total).toBe(5); // los meses sin torneos repiten el acumulado
  });

  it('une torneos publicados, perfiles oficiales y los datos que aporta el club', () => {
    const t = { id: 'T', name: 'Torneo', startDate: '2026-03-15', city: 'X', record: { won: 3, lost: 1, gold: 0, silver: 1, bronze: 0 } } as Tournament;
    const all = entriesOf([t, { id: 'sin', name: 'Sin balance', startDate: '2026-01-01', city: 'X' } as Tournament], [{ id: 'H', name: 'Antiguo', date: '2025-02-02', won: 2, lost: 2 }]);
    expect(all.map((x) => [x.id, x.won])).toEqual([['T', 3], ['H', 2]]);
  });
});
