import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { createPlayer, listPlayers } from '../src/roster';
import { parseRankingCategory, parseRankingProfileGuid, titleCase } from '../src/rankingParse';
import { FakeSource, memDb } from './helpers/fakes';

/** Páginas ficticias con la estructura del ranking oficial. */
const row = (rank: number, name: string, id: number, year: number, club: string) =>
  `<tr><td>${rank}</td><td><a href="player.aspx?id=1&amp;player=${id}">${name}</a></td><td>6086</td><td>4938</td><td>29630,0</td><td>8</td><td>${year}</td><td>Castilla León</td><td>${club}</td></tr>`;
const category = `<table><tr><th>Puesto</th><th>Jugador</th></tr>
${row(18, 'ANA PRUEBA GIL', 11, 1994, 'Universidad de Valladolid')}
${row(20, 'LUIS EJEMPLO DE LA FUENTE', 12, 2010, 'Universidad de Valladolid')}
${row(30, 'ROSA OTRA SANZ', 13, 1990, 'Club de Otra Ciudad')}</table>`;
const GUID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

describe('lectura del ranking', () => {
  it('lee jugadores, club, año y ficha; los nombres pasan a formato normal', () => {
    const c = parseRankingCategory(category);
    expect(c.map((x) => x.name)).toEqual(['ANA PRUEBA GIL', 'LUIS EJEMPLO DE LA FUENTE', 'ROSA OTRA SANZ']);
    expect(c[0]).toMatchObject({ club: 'Universidad de Valladolid', birthYear: 1994, playerPath: '/ranking/player.aspx?id=1&player=11' });
    expect(titleCase('LUIS EJEMPLO DE LA FUENTE')).toBe('Luis Ejemplo de la Fuente');
  });
  it('extrae el GUID del perfil de la ficha', () => {
    expect(parseRankingProfileGuid(`<a href="/profile/default.aspx?id=${GUID.toLowerCase()}">Perfil</a>`)).toBe(GUID);
    expect(parseRankingProfileGuid('<p>sin enlace</p>')).toBeUndefined();
  });
});

describe('lista del club construida sola', () => {
  beforeEach(() => {
    settings.rankingUrls = ['https://fuente.test/ranking/cat1'];
    settings.autoRosterConsent = 'declared';
  });
  const source = () => {
    const s = new FakeSource();
    s.rankingPlayers = async () => parseRankingCategory(category);
    s.rankingProfile = async () => GUID;
    return s;
  };
  const NOW = new Date('2026-10-21T10:00:00Z');

  it('añade a quienes figuran con el club de la UVa, con su perfil, y no duplica a los que ya están', async () => {
    const db = memDb();
    createPlayer(db, { name: 'Ana Prueba', public: true, consentBy: 'Ella', consentAt: '2026-10-01' }); // sin perfil
    const e = new SyncEngine(db, source(), () => NOW);
    expect(await e.tick(NOW)).toBe('roster');
    const players = listPlayers(db);
    expect(players.map((p) => p.name).sort()).toEqual(['Ana Prueba', 'Luis Ejemplo de la Fuente']); // Rosa es de otro club
    expect(players.find((p) => p.name === 'Ana Prueba')!.profileGuid).toBe(GUID); // se completó el perfil
  });

  it('los menores se añaden ocultos, aunque el consentimiento esté «declarado»', async () => {
    const db = memDb();
    await new SyncEngine(db, source(), () => NOW).tick(NOW);
    const luis = listPlayers(db).find((p) => p.name.startsWith('Luis'))!;
    expect(luis).toMatchObject({ isMinor: true, public: false });
    const ana = listPlayers(db).find((p) => p.name.startsWith('Ana'))!;
    expect(ana).toMatchObject({ isMinor: false, public: true, consentBy: 'Declarado por la administración del club' });
  });

  it('con el modo «hidden» nadie queda visible', async () => {
    settings.autoRosterConsent = 'hidden';
    const db = memDb();
    await new SyncEngine(db, source(), () => NOW).tick(NOW);
    expect(listPlayers(db).every((p) => !p.public)).toBe(true);
  });

  it('se repite solo una vez al día', async () => {
    const db = memDb();
    const e = new SyncEngine(db, source(), () => NOW);
    expect(await e.tick(NOW)).toBe('roster');
    const jobs = e.plan(new Date(NOW.getTime() + 3600_000)).map((j) => j.kind);
    expect(jobs).not.toContain('roster');
    expect(e.plan(new Date(NOW.getTime() + 25 * 3600_000)).map((j) => j.kind)).toContain('roster');
  });
});
