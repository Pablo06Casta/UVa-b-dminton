import { describe, expect, it } from 'vitest';
import type { Tournament } from '../types';
import { monthGrid, formatDateRange, shiftMonth } from './dates';
import { applyFilters, getStatus, getUpcoming, hasUvaPlayers, indexByDay, mergeUva, recentResults, upcomingMatches } from './tournaments';

const t = (id: string, startDate: string, endDate?: string, extra: Partial<Tournament> = {}): Tournament => ({
  id,
  name: id,
  startDate,
  endDate,
  city: 'X',
  ...extra,
});

describe('getStatus', () => {
  it('clasifica por fechas', () => {
    expect(getStatus(t('a', '2026-10-25'), '2026-10-20')).toBe('upcoming');
    expect(getStatus(t('a', '2026-10-19', '2026-10-21'), '2026-10-20')).toBe('ongoing');
    expect(getStatus(t('a', '2026-10-20'), '2026-10-20')).toBe('ongoing');
    expect(getStatus(t('a', '2026-10-10'), '2026-10-20')).toBe('finished');
  });
});

describe('getUpcoming', () => {
  it('devuelve los 3 primeros no finalizados, en orden', () => {
    const list = [t('d', '2026-12-01'), t('old', '2026-01-01'), t('b', '2026-10-21'), t('c', '2026-11-01'), t('e', '2027-01-01')];
    expect(getUpcoming(list, 3, '2026-10-20').map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('indexByDay', () => {
  it('reparte un torneo multidía en todos sus días', () => {
    const map = indexByDay([t('a', '2026-11-21', '2026-11-23')]);
    expect([...map.keys()]).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
  });
});

describe('applyFilters', () => {
  const list = [t('a', '2026-10-30', '2026-11-02', { category: 'Absoluto' }), t('b', '2026-11-15', undefined, { category: 'Universitario' })];
  it('un torneo que cruza de mes aparece en ambos meses', () => {
    const base = { status: 'all', category: 'all' } as const;
    expect(applyFilters(list, { ...base, month: '2026-10' }, '2026-10-01').map((x) => x.id)).toEqual(['a']);
    expect(applyFilters(list, { ...base, month: '2026-11' }, '2026-10-01').map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('filtra por categoría y estado', () => {
    expect(applyFilters(list, { month: 'all', status: 'all', category: 'Universitario' }, '2026-10-01').map((x) => x.id)).toEqual(['b']);
    expect(applyFilters(list, { month: 'all', status: 'ongoing', category: 'all' }, '2026-11-01').map((x) => x.id)).toEqual(['a']);
  });
});

describe('fechas', () => {
  it('la cuadrícula empieza en lunes y completa semanas', () => {
    const grid = monthGrid('2026-10'); // 1 oct 2026 = jueves
    expect(grid[0].iso).toBe('2026-09-28');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
  });
  it('formatea rangos', () => {
    expect(formatDateRange('2026-11-21', '2026-11-22')).toBe('21–22 de noviembre de 2026');
    expect(formatDateRange('2026-11-21')).toBe('21 de noviembre de 2026');
  });
  it('cambia de mes sin saltarse meses cortos', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('participación de la UVa', () => {
  const official = [t('fesba-1', '2026-11-07'), t('fesba-2', '2026-11-21')];
  it('sin entrada del club no hay jugadores de la UVa', () => {
    expect(mergeUva(official, []).some(hasUvaPlayers)).toBe(false);
  });
  it('superpone la participación solo sobre el torneo indicado', () => {
    const merged = mergeUva(official, [{ tournamentId: 'fesba-2', players: ['Jugador A', 'Jugador B'] }]);
    expect(merged.filter(hasUvaPlayers).map((x) => x.id)).toEqual(['fesba-2']);
    expect(merged.find((x) => x.id === 'fesba-2')?.clubParticipants).toBe(2);
  });
  it('ignora entradas que no existen en el calendario oficial', () => {
    expect(mergeUva(official, [{ tournamentId: 'no-existe', clubParticipants: 3 }])).toHaveLength(2);
  });
  it('admite torneos propios fuera del calendario oficial', () => {
    const own = t('propio', '2026-12-01', undefined, { clubParticipants: 1 });
    expect(mergeUva(official, [], [own]).map((x) => x.id)).toContain('propio');
  });
});

describe('partidos de la UVa', () => {
  const m = (id: string, state: 'scheduled' | 'finished', date: string, time: string) => ({
    id, state, date, time, players: ['Jugador A'],
  });
  const list = [
    t('a', '2026-11-07', undefined, { matches: [m('m1', 'finished', '2026-11-07', '10:00'), m('m2', 'scheduled', '2026-11-07', '16:30')] }),
    t('b', '2026-11-21', undefined, { matches: [m('m3', 'scheduled', '2026-11-21', '09:00'), m('m4', 'finished', '2026-11-21', '12:00')] }),
  ];
  it('lista solo los partidos no terminados, en orden', () => {
    expect(upcomingMatches(list).map((x) => x.match.id)).toEqual(['m2', 'm3']);
  });
  it('lista los resultados del más reciente al más antiguo', () => {
    expect(recentResults(list).map((x) => x.match.id)).toEqual(['m4', 'm1']);
  });
  it('un torneo con partidos de la UVa cuenta como torneo con jugadores UVa', () => {
    expect(hasUvaPlayers(list[0])).toBe(true);
  });
});
