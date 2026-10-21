import { describe, expect, it } from 'vitest';
import { buildAgenda, madrid, pickDay } from './agenda';
import type { UvaMatch } from '../types';

const m = (id: string, over: Partial<UvaMatch> = {}): UvaMatch => ({ id, players: ['Ana Prueba'], state: 'scheduled', ...over });

describe('agenda por horas', () => {
  it('convierte un instante a fecha y minutos en hora de Madrid (verano e invierno)', () => {
    expect(madrid('2026-10-24T07:30:00Z')).toEqual({ date: '2026-10-24', minutes: 9 * 60 + 30 }); // UTC+2
    expect(madrid('2026-11-07T08:30:00Z')).toEqual({ date: '2026-11-07', minutes: 9 * 60 + 30 }); // UTC+1
  });

  it('coloca cada partido a su hora estimada y, si no hay, a la programada; ordena por hora', () => {
    const days = buildAgenda([
      m('b', { plannedStart: '2026-10-24T07:30:00Z', estimatedStart: '2026-10-24T08:10:00Z' }), // 10:10 estimado
      m('a', { plannedStart: '2026-10-24T07:00:00Z' }), // 09:00
      m('c', { date: '2026-10-24', time: '12:15' }), // sin instante: fecha y hora locales
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].items.map((i) => [i.match.id, i.at])).toEqual([['a', 540], ['b', 610], ['c', 735]]);
    expect([days[0].firstHour, days[0].lastHour]).toEqual([9, 12]);
  });

  it('un partido terminado se coloca a su hora programada aunque tenga estimación antigua', () => {
    const [d] = buildAgenda([m('x', { state: 'finished', plannedStart: '2026-10-24T07:00:00Z', estimatedStart: '2026-10-24T09:00:00Z' })]);
    expect(d.items[0].at).toBe(540);
  });

  it('separa por días, omite lo que no se puede situar y elige el día a mostrar', () => {
    const days = buildAgenda([
      m('1', { plannedStart: '2026-10-25T07:00:00Z' }),
      m('2', { plannedStart: '2026-10-24T07:00:00Z' }),
      m('sinhora'),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-10-24', '2026-10-25']);
    expect(pickDay(days, '2026-10-25')).toBe('2026-10-25'); // hoy
    expect(pickDay(days, '2026-10-21')).toBe('2026-10-24'); // el próximo
    expect(pickDay(days, '2026-11-30')).toBe('2026-10-25'); // el último
  });
});
