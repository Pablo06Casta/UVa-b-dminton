import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildAutoNews } from '../src/news';
import { buildPublicState, type PublicTournament } from '../src/publicView';
import { createPlayer } from '../src/roster';
import type { BracketRound } from '../src/model';
import { FakeSource, memDb, PROFILE } from './helpers/fakes';

const t = (over: Partial<PublicTournament> = {}): PublicTournament =>
  ({ id: 'G1', name: 'TOP de Prueba', startDate: '2026-11-07', endDate: '2026-11-08', city: 'Valladolid', manual: false, uvaPlayers: ['Ana Prueba'], matches: [], draws: [], results: [], entries: [], stale: false, officialUrl: 'https://x/t', ...over }) as PublicTournament;
const r = (over: Partial<PublicTournament['results'][number]>) => ({ event: 'IM', entrant: 'Ana Prueba', text: 'Oro', done: true, ...over });

describe('noticias automáticas', () => {
  it('no hay noticia hasta que el torneo termina, y sale cuando pasa su último día o no quedan partidos', () => {
    const tour = t({ results: [r({ place: 1 })] });
    expect(buildAutoNews([tour], new Date('2026-11-08T12:00:00+01:00'))).toEqual([]);
    expect(buildAutoNews([tour], new Date('2026-11-09T09:00:00+01:00'))).toHaveLength(1);
    const done = t({ results: [r({ place: 1 })], progress: { date: '2026-11-08', done: true } as never });
    expect(buildAutoNews([done], new Date('2026-11-08T20:00:00+01:00'))).toHaveLength(1);
  });

  it('con medallas: título con el recuento, detalle de las finales y sin nombres de rivales', () => {
    const tour = t({ results: [r({ place: 1, score: '21-10 21-12' }), r({ event: 'DM', entrant: 'Ana Prueba / Luis Ejemplo', place: 1, score: '21-15 21-9' }), r({ event: 'DX', place: 2, text: 'Plata', score: '19-21 21-18 15-21' }), r({ event: 'IF', place: 3, text: 'Bronce' })] });
    const [n] = buildAutoNews([tour], new Date('2026-11-09T09:00:00+01:00'));
    expect(n).toMatchObject({ id: 'auto-G1', date: '2026-11-08', tag: 'Podio', title: '4 medallas para la UVa en TOP de Prueba', auto: true, tournamentGuid: 'G1' });
    expect(n.summary).toContain('2 oros, 1 plata, 1 bronce');
    expect(n.medals?.[0]).toMatchObject({ place: 1, eventName: 'Individual masculino', who: 'Ana Prueba', detail: 'Ganó la final por 21-10 21-12.' });
    expect(n.sources[0].url).toBe('https://x/t');
  });

  it('una sola medalla nombra a la persona; sin medallas lista dónde cayó cada una', () => {
    const solo = buildAutoNews([t({ results: [r({ place: 3, text: 'Bronce' })] })], new Date('2026-11-09T09:00:00+01:00'))[0];
    expect(solo.title).toBe('Ana Prueba, medalla de bronce en TOP de Prueba');
    const none = buildAutoNews([t({ results: [r({ text: 'Cae en Cuartos de final' }), r({ event: 'IF', entrant: 'Luis Ejemplo', text: '2.º en Grupo A' })] })], new Date('2026-11-09T09:00:00+01:00'))[0];
    expect(none).toMatchObject({ tag: 'Resultados', medals: undefined });
    expect(none.highlights).toEqual(['Ana Prueba · Individual masculino: Cae en Cuartos de final.', 'Luis Ejemplo · Individual femenino: 2.º en Grupo A.']);
  });

  it('caduca a los 45 días y no se crea sin resultados', () => {
    expect(buildAutoNews([t({ results: [r({ place: 1 })] })], new Date('2027-01-15T09:00:00+01:00'))).toEqual([]);
    expect(buildAutoNews([t()], new Date('2026-11-09T09:00:00+01:00'))).toEqual([]);
  });
});

describe('noticia de extremo a extremo con el motor', () => {
  beforeEach(() => {
    settings.opponents = 'none';
    settings.officialReadEnabled = true;
    settings.rankingUrls = [];
  });
  const uvaE = (n: string, id: number) => ({ names: [n], ids: [id], club: 'UNIVERSIDAD DE VALLADOLID' });
  const other = (n: string, id: number) => ({ names: [n], ids: [id], club: 'OTRO CLUB' });
  const bracket: BracketRound[] = [
    { title: 'Semi final', matches: [{ a: uvaE('Ana Prueba', 1), b: other('Rival Uno', 2), winner: 1, sets: [[21, 10], [21, 12]] }, { a: other('Rival Dos', 3), b: other('Rival Tres', 4), winner: 1, sets: [[21, 5], [21, 5]] }] },
    { title: 'Final', matches: [{ a: uvaE('Ana Prueba', 1), b: other('Rival Dos', 3), winner: 1, sets: [[21, 18], [17, 21], [21, 19]] }] },
  ];

  it('al terminar el torneo se crea la noticia con el oro de la UVa', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.drawList = [{ drawId: 1, name: 'IM', type: 'knockout' }];
    src.bracket = (async () => bracket) as never;
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, consentBy: 'Ella', consentAt: '2026-10-01' });
    const day = new Date('2026-11-09T10:00:00+01:00'); // el torneo (7 de noviembre) ya terminó
    const e = new SyncEngine(db, src, () => day);
    for (let i = 0; i < 8; i++) await e.tick(new Date(day.getTime() + i * 5 * 60_000));
    const state = buildPublicState(db, day);
    expect(state.news).toHaveLength(1);
    expect(state.news[0]).toMatchObject({ tag: 'Podio', title: 'Ana Prueba, medalla de oro en Torneo de prueba' });
    expect(state.news[0].medals?.[0].detail).toBe('Ganó la final por 21-18 17-21 21-19.');
    expect(JSON.stringify(state.news)).not.toMatch(/Rival/);
  });
});
