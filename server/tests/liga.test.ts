import { describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildLiga, latestEdition, ligaEveryMs, type LigaSnapshot } from '../src/liga';
import { kvGet } from '../src/db';
import { FakeSource, memDb } from './helpers/fakes';

const NOW = new Date('2026-10-23T10:00:00+02:00');
const ED = '4EF9A0C0-4868-4A7A-9199-4B85CB2C641A';
const std = (club: string, rank: number, played = 0) => ({ rank, club, points: played * 3, adjusted: false, played, won: played, drawn: 0, lost: 0, matchesFor: 0, matchesAgainst: 0 });

describe('Liga: edición y cadencia', () => {
  it('elige la edición más reciente e ignora pruebas y regionales', () => {
    const e = latestEdition([
      { id: 'A', name: 'Liga Nacional de Clubes edición 2025-2026' },
      { id: 'B', name: 'Liga Nacional de Clubes edición 2026-2027' },
      { id: 'T', name: 'TEST Liga de Prueba de Clubes 2027-2028' },
      { id: 'R', name: 'ANDALUCÍA -Liga Nacional de Clubes Segunda 2030-2031' },
    ]);
    expect(e?.id).toBe('B');
    expect(latestEdition([])).toBeUndefined();
  });

  it('cada 5 min el día de jornada, cada hora si hay encuentros en los próximos días y cada 12 h si no', () => {
    const f = (date: string, played = false) => ({ id: 1, round: 1, date, home: 'A', away: 'B', moved: false, ...(played ? { homeScore: 4, awayScore: 3 } : {}) });
    expect(ligaEveryMs({ fixtures: [f('2026-10-23')] }, NOW)).toBe(5 * 60_000);
    expect(ligaEveryMs({ fixtures: [f('2026-10-25')] }, NOW)).toBe(3600_000);
    expect(ligaEveryMs({ fixtures: [f('2026-12-25'), f('2026-09-01', true)] }, NOW)).toBe(12 * 3600_000);
    expect(ligaEveryMs(undefined, NOW)).toBe(12 * 3600_000);
  });
});

describe('Liga: lectura y publicación', () => {
  const world = () => {
    const db = memDb();
    const src = new FakeSource();
    src.leagueEditions = (async () => [{ id: 'OLD', name: 'Liga Nacional de Clubes edición 2025-2026' }, { id: ED, name: 'Liga Nacional de Clubes edición 2026-2027' }]) as never;
    src.drawList = [{ drawId: 17, name: 'Liga Nacional de Clubes – Primera ORO', type: 'roundrobin' }, { drawId: 18, name: 'Liga Nacional de Clubes – Primera PLATA', type: 'roundrobin' }];
    src.infoData = { id: ED, name: 'Liga Nacional de Clubes edición 2026-2027', days: [], tz: 'Europe/Madrid' } as never;
    let calls = 0;
    src.leagueDraw = (async (guid: string, drawId: number) => {
      calls++;
      expect([guid, drawId]).toEqual([ED, 18]);
      return {
        standings: [std('CD UNIVERSIDAD DE VALLADOLID', 1), std('CLUB BADMINTON CIDE', 1)],
        fixtures: [
          { id: 1094, round: 1, home: 'CLUB BADMINTON CIDE', away: 'CD UNIVERSIDAD DE VALLADOLID', moved: false },
          { id: 1095, round: 2, date: '2026-12-05', time: '11:00', home: 'CD UNIVERSIDAD DE VALLADOLID', away: 'CLUB BADMINTON CIDE', homeScore: 4, awayScore: 3, moved: true },
        ],
      };
    }) as never;
    return { db, src, calls: () => calls };
  };

  it('encuentra la última edición, la división Plata, y guarda clasificación y encuentros; luego espera', async () => {
    settings.officialReadEnabled = true;
    const { db, src, calls } = world();
    const e = new SyncEngine(db, src, () => NOW, { live: true, calendar: false });
    for (let i = 0; i < 6; i++) await e.tick(new Date(NOW.getTime() + i * 5000));
    const snap = kvGet<LigaSnapshot>(db, 'liga')!;
    expect(snap).toMatchObject({ tournamentId: ED, drawId: 18, division: 'Primera PLATA', edition: 'Liga Nacional de Clubes edición 2026-2027' });
    expect(calls()).toBe(1);
    for (let i = 0; i < 6; i++) await e.tick(new Date(NOW.getTime() + 60_000 + i * 5000)); // no toca hasta dentro de horas
    expect(calls()).toBe(1);
  });

  it('la vista pública marca al club, pone nombres legibles y la jornada actual', async () => {
    settings.officialReadEnabled = true;
    const { db, src } = world();
    const e = new SyncEngine(db, src, () => NOW, { live: true, calendar: false });
    for (let i = 0; i < 6; i++) await e.tick(new Date(NOW.getTime() + i * 5000));
    const liga = buildLiga(kvGet<LigaSnapshot>(db, 'liga'))!;
    expect(liga.clubs[0]).toMatchObject({ club: 'CD Universidad de Valladolid', uva: true });
    expect(liga.started).toBe(false);
    expect(liga.currentRound).toBe(1);
    expect(liga.rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(liga.rounds[1].fixtures[0]).toMatchObject({ status: 'finished', homeScore: 4, uva: true, moved: true });
    expect(liga.rounds[0].fixtures[0].url).toContain(`teammatch.aspx?id=${ED}&match=1094`);
    expect(buildLiga(undefined)).toBeUndefined();
  });
});
