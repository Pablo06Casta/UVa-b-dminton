import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import { FakeSource, GUID, info, memDb, PROFILE } from './helpers/fakes';

const NOW = new Date('2026-10-21T10:00:00+02:00');
const consent = { consentBy: 'Ella misma', consentAt: '2026-10-01' };
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const OLD = 'BBBBBBBB-0000-0000-0000-000000000001';

function world() {
  const db = memDb();
  const src = new FakeSource();
  src.infoData = info({ startDate: '2026-11-07', endDate: '2026-11-08', days: ['2026-11-07', '2026-11-08'] });
  src.drawList = [];
  src.draws = (async () => { throw new Error('sin cuadros'); }) as never;
  let reads = 0;
  src.profileMatches = (async () => {
    reads++;
    return [
      { key: 'k1', tournamentId: OLD, tournamentName: 'Máster Antiguo', date: '2025-11-15', won: true },
      { key: 'k2', tournamentId: OLD, tournamentName: 'Máster Antiguo', date: '2025-11-15', won: false },
      { key: 'k3', tournamentId: OLD, tournamentName: 'Máster Antiguo', date: '2025-11-16', won: true },
      { key: 'k4', tournamentId: GUID, tournamentName: 'Torneo de prueba', date: '2026-04-11', won: true },
      { key: 'k5', tournamentId: 'CCCCCCCC-0000-0000-0000-000000000009', tournamentName: 'Liga Nacional de Clubes edición 2025-2026', date: '2026-05-16', won: true },
    ];
  }) as never;
  return { db, src, reads: () => reads };
}

beforeEach(() => {
  settings.officialReadEnabled = true;
  settings.rankingUrls = [];
  settings.historyEnabled = true;
});

describe('histórico de partidos por perfil', () => {
  it('lee a cada persona pública una vez al día, guarda los partidos terminados (sin Liga Nacional) y los publica por torneo', async () => {
    const { db, src, reads } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    createPlayer(db, { name: 'Sin Consentimiento', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-FFFFFFFFFFFF' });
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 40; i++) await engine.tick(min(i));
    expect(reads()).toBe(1); // solo la persona pública
    expect((db.prepare('select count(*) n from history_matches').get() as { n: number }).n).toBe(4); // la Liga Nacional no se guarda

    const state = buildPublicState(db, NOW);
    expect(state.history).toEqual([{ id: OLD, name: 'Máster Antiguo', date: '2025-11-15', won: 2, lost: 1 }]);
    // El torneo que sí está publicado toma sus cifras del perfil.
    const t = state.tournaments.find((x) => x.id === GUID);
    expect(t?.record).toMatchObject({ won: 1, lost: 0 });

    for (let i = 0; i < 20; i++) await engine.tick(min(100 + i * 30)); // dentro de las 24 h: no vuelve a leer
    expect(reads()).toBe(1);
    for (let i = 0; i < 15; i++) await engine.tick(new Date(NOW.getTime() + 25 * 3600_000 + i * 5000)); // pasadas 24 h toca otra vuelta (tras lo más urgente)
    expect(reads()).toBe(2);
  });

  it('un partido de dobles visto en el perfil de dos personas se cuenta una vez', async () => {
    const { db, src } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    createPlayer(db, { name: 'Bea Prueba', profile: 'AAAAAAAA-BBBB-CCCC-DDDD-FFFFFFFFFFFF', public: true, ...consent });
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 60; i++) await engine.tick(min(i));
    expect(buildPublicState(db, NOW).history[0]).toMatchObject({ won: 2, lost: 1 }); // los mismos partidos (misma clave) no se duplican
  });
});
