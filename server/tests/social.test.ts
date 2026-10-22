import { describe, expect, it } from 'vitest';
import type { PublicState, PublicTournament } from '../src/publicView';
import { buildSocial } from '../src/social';

const base = 'https://srv.example';
const tour = (over: Partial<PublicTournament>) => ({ id: 'AAAA-1', name: 'TOP Máster Absoluto', startDate: '2026-10-24', endDate: '2026-10-25', city: 'Villanueva de la Vera', uvaPlayers: ['Ana Prueba Gil'], matches: [], draws: [], entries: [{ player: 'Ana Prueba Gil', event: 'IM-N4', status: 'admitted', seed: 4 }], results: [], stale: false, manual: false, ...over }) as unknown as PublicTournament;
const state = (...t: PublicTournament[]) => ({ tournaments: t }) as unknown as PublicState;

describe('paquete para redes sociales', () => {
  it('previa: torneos que empiezan mañana con gente del club, con imágenes y pie de foto con datos reales', () => {
    const items = buildSocial(state(tour({}), tour({ id: 'B', startDate: '2026-11-07' })), 'previa', base, new Date('2026-10-23T18:00:00+02:00'));
    expect(items).toHaveLength(1);
    const [i] = items;
    expect(i.images.square).toBe(`${base}/og/torneo/AAAA-1.png?size=square`);
    expect(i.images.story).toContain('size=story');
    expect(i.caption).toContain('TOP Máster Absoluto en Villanueva de la Vera del 24 al 25 de octubre');
    expect(i.caption).toContain('Ana Prueba'); // nombre y primer apellido
    expect(i.caption).not.toContain('Gil');
    expect(i.caption).toContain('cabeza de serie 4');
    expect(i.caption).toContain('#VillanuevadelaVera');
  });

  it('resultados: torneos del fin de semana con resultados; marca los provisionales y cuenta medallas', () => {
    const t = tour({ results: [{ event: 'IM', entrant: 'Ana Prueba Gil', place: 1, text: 'Oro', done: true }, { event: 'DM', entrant: 'A / B', place: 3, text: 'Bronce', done: true }] as never, record: { won: 7, lost: 2, gold: 1, silver: 0, bronze: 1 }, matches: [{ state: 'live' }] as never });
    const [i] = buildSocial(state(t), 'resultados', base, new Date('2026-10-25T22:00:00+01:00'));
    expect(i.provisional).toBe(true);
    expect(i.medals).toEqual({ gold: 1, silver: 0, bronze: 1 });
    expect(i.caption).toContain('1 oro y 1 bronce');
    expect(i.caption).toContain('7 partidos ganados y 2 perdidos');
    expect(i.images.square).toContain('/og/resultados/');
    expect(buildSocial(state(t), 'resultados', base, new Date('2026-11-02T22:00:00+01:00'))).toEqual([]); // ya no es el fin de semana
    expect(buildSocial(state(tour({ results: [] })), 'resultados', base, new Date('2026-10-25T22:00:00+01:00'))).toEqual([]);
  });
});
