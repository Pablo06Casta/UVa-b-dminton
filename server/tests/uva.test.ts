import { describe, expect, it } from 'vitest';
import { createPlayer, listPlayers } from '../src/roster';
import { buildStoredMatch, diffMatch, findClubEntrants, isUvaClub, matchFingerprint } from '../src/uva';
import { memDb, row } from './helpers/fakes';

describe('identificar al club', () => {
  it.each(['UNIVERSIDAD DE VALLADOLID', 'Universidad de Valladolid', 'UVA', 'Univ. Valladolid'])('reconoce «%s»', (c) => expect(isUvaClub(c)).toBe(true));
  it.each(['CIUDAD DE VILLALBA', 'VALLADOLID BADMINTON', '', undefined, 'UNIVERSIDAD DE BURGOS'])('no reconoce «%s»', (c) => expect(isUvaClub(c)).toBe(false));

  it('un participante es del club por el club publicado o por estar en la lista', () => {
    const db = memDb();
    createPlayer(db, { name: 'Carla Prueba' });
    const found = findClubEntrants(
      [
        { names: ['Ana Prueba'], ids: [1], club: 'UNIVERSIDAD DE VALLADOLID' },
        { names: ['Pedro Otro'], ids: [2], club: 'OTRO CLUB' },
        { names: ['Prueba Carla'], ids: [3], club: 'OTRO CLUB' }, // en la lista, con el apellido primero
      ],
      listPlayers(db),
    );
    expect(found.map((f) => f.tsPlayerId)).toEqual([1, 3]);
    expect(found[1].rosterId).toBeDefined();
  });
});

describe('partidos del club', () => {
  const roster = () => listPlayers((() => { const d = memDb(); createPlayer(d, { name: 'Ana Prueba' }); return d; })());

  it('se guarda solo si juega alguien del club', () => {
    expect(buildStoredMatch(row({ names1: [['Pedro Otro', 8]], names2: [['Rival Uno', 9]] }), { tournamentGuid: 'G', uvaTsIds: new Set(), roster: roster() })).toBeUndefined();
    const m = buildStoredMatch(row(), { tournamentGuid: 'G', uvaTsIds: new Set([1]), roster: roster() });
    expect(m?.sides[0].players[0]).toMatchObject({ uva: true });
    expect(m?.sides[1].players[0]).toMatchObject({ uva: false });
  });

  it('la huella cambia con hora, pista o resultado, y el diff no lleva nombres', () => {
    const ctx = { tournamentGuid: 'G', uvaTsIds: new Set([1]), roster: roster() };
    const a = buildStoredMatch(row(), ctx)!;
    const b = buildStoredMatch(row({ clock: '11:30', court: '4', status: 'finished', winner: 1, sets: [[21, 10], [21, 12]] }), ctx)!;
    expect(matchFingerprint(a)).not.toBe(matchFingerprint(b));
    expect(matchFingerprint(a)).toBe(matchFingerprint(buildStoredMatch(row(), ctx)!));
    const diff = diffMatch(a, b);
    expect(diff.map((d) => d.field).sort()).toEqual(['court', 'plannedClock', 'sets', 'status', 'winner']);
    expect(JSON.stringify(diff)).not.toMatch(/Prueba|Rival/);
  });
});
