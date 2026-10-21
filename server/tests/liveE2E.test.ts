import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { PoliteClient } from '../src/http';
import { OfficialLiveReaders } from '../src/officialReaders';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import { RealSource } from '../src/source';
import { bracketHtml, dayHtml, drawsHtml, G, page, profileHtml, standingsHtml, tournamentHtml } from './helpers/pages';
import { memDb } from './helpers/fakes';

/**
 * Ciclo completo con el motor real, el cliente HTTP prudente y los lectores oficiales,
 * contra un servidor simulado con páginas ficticias que replican la estructura de badminton.es.
 */
const NOW = new Date('2026-10-03T10:00:00+02:00');
const consent = { consentBy: 'Ella misma', consentAt: '2026-10-01' };

function world(day = dayHtml) {
  const urls: string[] = [];
  const ats: number[] = [];
  let clock = NOW.getTime();
  const client = new PoliteClient({
    baseUrl: 'https://fuente.test',
    minIntervalMs: 2500,
    userAgent: 'prueba',
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    fetchImpl: (async (url: string) => {
      urls.push(String(url));
      ats.push(clock);
      const u = String(url);
      const body = /profile\/overview/.test(u) ? profileHtml.replace('aaaaaaaa-0000-0000-0000-000000000001', G)
        : /tournament\.aspx/.test(u) ? tournamentHtml
        : /draws\.aspx/.test(u) ? drawsHtml
        : /GetStandings/.test(u) ? standingsHtml
        : /GetDrawContent/.test(u) ? bracketHtml
        : /matches\.aspx/.test(u) ? (/d=20261003/.test(u) ? day : page('<div>Sin partidos</div>'))
        : undefined;
      return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
    }) as typeof fetch,
  });
  const source = new RealSource(client, new OfficialLiveReaders(client));
  return { source, urls, ats };
}

async function runAll(engine: SyncEngine, times = 14) {
  for (let i = 0; i < times; i++) await engine.tick(new Date(NOW.getTime() + i * 5 * 60_000));
}

beforeEach(() => {
  settings.opponents = 'none';
  settings.officialReadEnabled = true;
});

describe('sincronización completa con los lectores oficiales', () => {
  it('descubre el torneo desde el perfil, identifica a la UVa por el club y publica sus partidos', async () => {
    const db = memDb();
    const { source, urls } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', public: true, ...consent });
    const engine = new SyncEngine(db, source, () => NOW);
    await runAll(engine);

    const t = db.prepare('select guid, name, city, days_json from tournaments where guid = ?').get(G.toUpperCase()) as { name: string; city: string; days_json: string };
    expect(t).toMatchObject({ name: 'Torneo de Prueba Absoluto', city: 'Villa Ejemplo' });
    expect(JSON.parse(t.days_json)).toEqual(['2026-10-03', '2026-10-04']);

    const state = buildPublicState(db, NOW);
    expect(state.tournaments).toHaveLength(1);
    const [pub] = state.tournaments;
    expect(pub.uvaPlayers).toEqual(['Ana Prueba']);
    const states = pub.matches.map((m) => m.state);
    expect(states).toContain('finished');
    // El rival no se publica por defecto y solo salen partidos con jugadores del club con consentimiento.
    expect(JSON.stringify(state)).not.toContain('Jugador Dos');
    expect(JSON.stringify(state)).not.toContain('Jugador Seis');
    // Solo se pidió lo necesario: perfil, ficha, cuadros, clasificaciones/cuadros y los días del torneo.
    expect(urls.every((u) => /profile\/overview|tournament\.aspx|draws\.aspx|GetStandings|GetDrawContent|matches\.aspx/.test(u))).toBe(true);
  });

  it('no publica nada si la jugadora no ha dado su consentimiento, aunque la lectura funcione', async () => {
    const db = memDb();
    const { source } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' });
    await runAll(new SyncEngine(db, source, () => NOW));
    expect(buildPublicState(db, NOW).tournaments).toEqual([]);
    expect(JSON.stringify(buildPublicState(db, NOW))).not.toContain('Ana Prueba');
  });

  it('un homónimo con otro club no recibe los partidos de otra persona de la UVa', async () => {
    const db = memDb();
    const { source } = world();
    createPlayer(db, { name: 'Jugador Cuatro', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', public: true, ...consent });
    await runAll(new SyncEngine(db, source, () => NOW));
    // «Jugador Cuatro» figura con otro club: no se le atribuyen los partidos de la jugadora de la UVa (que no está en la lista ni ha dado consentimiento).
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.matches).toEqual([]);
    expect(JSON.stringify(buildPublicState(db, NOW))).not.toContain('Ana Prueba');
  });

  it('respeta la separación mínima entre peticiones durante todo el ciclo', async () => {
    const db = memDb();
    const { source, urls, ats } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', public: true, ...consent });
    await runAll(new SyncEngine(db, source, () => NOW));
    expect(urls.length).toBeGreaterThan(5);
    for (let i = 1; i < ats.length; i++) expect(ats[i] - ats[i - 1]).toBeGreaterThanOrEqual(2500);
  });
});
