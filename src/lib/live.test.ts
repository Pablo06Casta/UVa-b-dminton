import { describe, expect, it } from 'vitest';
import type { LiveState, Tournament, UvaMatch } from '../types';
import { boardOf, lateness, mergeLive, nextInfo, pickActive, spanText } from './live';

const t = (id: string, startDate: string, city: string, extra: Partial<Tournament> = {}): Tournament => ({ id, name: id, startDate, city, ...extra });
const m = (id: string, state: UvaMatch['state'], plannedStart?: string, estimatedStart?: string): UvaMatch => ({ id, state, players: ['A'], plannedStart, estimatedStart });
const state = (over: Partial<LiveState['tournaments'][number]> = {}): LiveState => ({
  generatedAt: '', officialReadEnabled: true, version: 'v', players: [], pushEnabled: false,
  tournaments: [{ id: 'AAAAAAAA-1', name: 'Torneo en vivo', startDate: '2026-11-07', city: 'Valladolid', officialUrl: 'u' as string | undefined, uvaPlayers: ['Ana Prueba'], matches: [m('k1', 'scheduled')], draws: [], stale: false, ...over }],
});

describe('mezcla con los datos en directo', () => {
  it('pasa los resultados de la UVa (podio) a la ficha del torneo', () => {
    const results = [{ event: 'IM', entrant: 'Ana Prueba', place: 3 as const, text: 'Bronce', done: true }];
    const [out] = mergeLive([t('a', '2026-11-07', 'Valladolid')], state({ results }));
    expect(out.podium).toEqual(results);
  });
  it('superpone jugadores, partidos y estimación sobre el torneo oficial de la misma fecha y localidad', () => {
    const out = mergeLive([t('fesba-1', '2026-11-07', 'Valladolid'), t('fesba-2', '2026-11-14', 'Burgos')], state());
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'fesba-1', liveId: 'AAAAAAAA-1', players: ['Ana Prueba'], clubParticipants: 1 });
    expect(out[1].matches).toBeUndefined();
  });
  it('empareja aunque la localidad lleve la provincia entre paréntesis', () => {
    const out = mergeLive([t('fesba-1', '2026-11-21', 'Tudela de Duero (Valladolid)')], state({ startDate: '2026-11-21', city: 'Tudela de Duero' }));
    expect(out[0].liveId).toBe('AAAAAAAA-1');
  });
  it('si no está en el calendario oficial, se añade como torneo propio', () => {
    const out = mergeLive([t('fesba-9', '2026-12-01', 'Otra')], state());
    expect(out.map((x) => x.id)).toEqual(['ts-aaaaaaaa', 'fesba-9']);
  });
});

describe('torneos introducidos a mano por el club', () => {
  it('se añaden aunque no tengan ficha oficial y no enlazan a badminton.es', () => {
    const out = mergeLive([], state({ id: 'M-ABC123', officialUrl: undefined, manual: true }));
    expect(out[0]).toMatchObject({ id: 'ts-m-abc123', liveId: 'M-ABC123', players: ['Ana Prueba'] });
    expect(out[0].externalUrl).toBeUndefined();
  });
});

describe('panel en directo', () => {
  it('separa en juego, próximos (por hora estimada) y resultados', () => {
    const tour = t('x', '2026-11-07', 'V');
    const list = [m('a', 'scheduled', '2026-11-07T09:00Z', '2026-11-07T10:00Z'), m('b', 'scheduled', '2026-11-07T09:30Z', '2026-11-07T09:45Z'), m('c', 'live'), m('d', 'finished', '2026-11-07T08:00Z'), m('e', 'finished', '2026-11-07T08:30Z')].map((match) => ({ tournament: tour, match }));
    const b = boardOf(list);
    expect(b.live.map((x) => x.match.id)).toEqual(['c']);
    expect(b.next.map((x) => x.match.id)).toEqual(['b', 'a']);
    expect(b.done.map((x) => x.match.id)).toEqual(['e', 'd']);
  });
  it('retraso de un partido respecto a lo programado', () => {
    expect(lateness(m('a', 'scheduled', '2026-11-07T09:00:00Z', '2026-11-07T09:25:00Z'))).toBe(25);
    expect(lateness(m('a', 'scheduled'))).toBeUndefined();
  });
  it('elige el torneo en juego hoy; si no, el próximo; si no, el último', () => {
    const l = [t('pasado', '2026-10-01', 'A', { liveId: 'x' }), t('hoy', '2026-11-07', 'B', { liveId: 'y' }), t('futuro', '2026-12-01', 'C', { liveId: 'z' }), t('sin-datos', '2026-11-07', 'D')];
    expect(pickActive(l, '2026-11-07')?.id).toBe('hoy');
    expect(pickActive(l, '2026-11-20')?.id).toBe('futuro');
    expect(pickActive(l, '2027-02-01')?.id).toBe('futuro');
  });
});

describe('nextInfo', () => {
  const NOW = new Date('2026-10-24T08:00:00Z');
  const progress = { date: '2026-10-24', asOf: NOW.toISOString(), total: 40, finished: 10, live: 3, remaining: 27, courts: 3, basis: 'observed', done: false } as const;
  it('junta cuántos faltan, el tiempo hasta empezar y las horas oficial y estimada', () => {
    const match = { ...m('x', 'scheduled', '2026-10-24T08:30:00Z', '2026-10-24T08:50:00Z'), date: '2026-10-24', ahead: 5 };
    expect(nextInfo(match, progress, NOW)).toMatchObject({ ahead: 5, inPlay: 3, remaining: 30, minutes: 50, delay: 20 });
  });
  it('sin estimación usa la hora oficial, y no mezcla el progreso de otro día', () => {
    const match = { ...m('x', 'scheduled', '2026-10-25T08:30:00Z'), date: '2026-10-25' };
    const i = nextInfo(match, progress, NOW);
    expect(i.remaining).toBeUndefined();
    expect(i.minutes).toBe(24 * 60 + 30);
    expect(i.delay).toBeUndefined();
  });
  it('spanText', () => {
    expect(spanText(25)).toBe('25 min');
    expect(spanText(65)).toBe('1 h 05 min');
  });
});
