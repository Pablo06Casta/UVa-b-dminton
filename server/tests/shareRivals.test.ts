import { afterEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { renderPng, svgOf, tournamentSvg } from '../src/share';
import { hasYouthCategories, nameAndFirstSurname, rivalNamesFor } from '../src/shareRivals';
import type { PublicTournament } from '../src/publicView';
import { buildStoredMatch } from '../src/uva';
import { GUID, memDb, row } from './helpers/fakes';

describe('nombre y primer apellido del rival', () => {
  it('recorta a nombre + primer apellido, con partículas y en formato «Apellido, Nombre»', () => {
    expect(nameAndFirstSurname('Pablo Martín Castañeda')).toBe('Pablo Martín');
    expect(nameAndFirstSurname('Ana de la Torre Gil')).toBe('Ana de la Torre');
    expect(nameAndFirstSurname('García López, María')).toBe('María García');
    expect(nameAndFirstSurname('Luis Pérez')).toBe('Luis Pérez');
    expect(nameAndFirstSurname('Madonna')).toBe('Madonna');
  });

  it('detecta torneos con categorías de menores', () => {
    expect(hasYouthCategories('Navarra Máster Territorial Estella Sub-13, Sub-17 y Absoluto')).toBe(true);
    expect(hasYouthCategories('CANTABRIA TOP TTR Sub 15')).toBe(true);
    expect(hasYouthCategories('TOP Máster Absoluto')).toBe(false);
  });
});

describe('rivales en la imagen del torneo', () => {
  afterEach(() => {
    settings.shareRivalNames = true;
    settings.shareRivalYouth = false;
  });

  function seed(db = memDb()) {
    const m = buildStoredMatch(row({ names2: [['Rival Uno Segundo', 2]] }), { tournamentGuid: GUID, entrants: new Map([[1, 1]]) })!;
    db.prepare('insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values(?,?,?,?,?,?,?,?,?)').run(m.key, GUID, m.date ?? null, JSON.stringify(m), 'h', m.status, 'x', 'x', 'x');
    return { db, key: m.key };
  }

  it('no nombra al rival de una prueba de menores aunque el torneo sea mixto', () => {
    const { db } = seed();
    db.prepare("update matches set json = replace(json, '\"drawName\":\"IM\"', '\"drawName\":\"IM Sub-15\"')").run();
    expect(rivalNamesFor(db, GUID, 'Máster Sub-15 y Absoluto')).toEqual({});
  });

  it('da el nombre y el primer apellido del rival por partido; se puede apagar y no se nombra en torneos de menores', () => {
    const { db, key } = seed();
    expect(rivalNamesFor(db, GUID, 'TOP Máster Absoluto')).toEqual({ [key]: 'Rival Uno' });
    expect(rivalNamesFor(db, GUID, 'Máster Sub-13 y Absoluto')).toEqual({ [key]: 'Rival Uno' }); // torneo mixto: solo se bloquean las pruebas de menores
    expect(rivalNamesFor(db, GUID, 'Campeonato Sub-13 y Sub-15')).toEqual({}); // torneo solo de menores
    settings.shareRivalYouth = true;
    expect(rivalNamesFor(db, GUID, 'Campeonato Sub-13 y Sub-15')).toEqual({ [key]: 'Rival Uno' });
    settings.shareRivalNames = false;
    expect(rivalNamesFor(db, GUID, 'TOP Máster Absoluto')).toEqual({});
  });

  it('la tarjeta del torneo lista la jornada por horas con el rival y su resultado; sin nombre pone «Rival»', () => {
    const t = {
      id: GUID, name: 'TOP Máster Absoluto', startDate: '2026-10-24', city: 'Estella', uvaPlayers: ['Ana Prueba'], results: [], draws: [], entries: [], stale: false, manual: false,
      matches: [
        { id: 'b', players: ['Ana Prueba'], state: 'scheduled', date: '2026-10-24', time: '11:00' },
        { id: 'a', players: ['Ana Prueba'], state: 'finished', date: '2026-10-24', time: '09:00', score: '21-10 21-12', outcome: 'win' },
      ],
    } as unknown as PublicTournament;
    const svg = tournamentSvg(t, 'og', 'torneo', { a: 'Rival Uno' });
    expect(svg.indexOf('09:00')).toBeLessThan(svg.indexOf('11:00'));
    expect(svg).toContain('ANA PRUEBA VS RIVAL UNO');
    expect(svg).toContain('ANA PRUEBA VS RIVAL<'); // el segundo no tiene rival conocido
    expect(svg).toContain('V 21-10 21-12');
    expect(svgOf({ kind: 'torneo', t }, 'og')).not.toContain('RIVAL UNO'); // sin pasar rivales, no sale ningún nombre
    expect(renderPng({ kind: 'torneo', t, rivals: { a: 'Rival Uno' } }, 'og').subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('tarjeta de resultados con podio', () => {
  const t = {
    id: GUID, name: 'TOP Máster Absoluto', startDate: '2026-10-24', city: 'Villanueva de la Vera', uvaPlayers: [], matches: [], draws: [], entries: [], stale: false, manual: false,
    results: [
      { event: 'IM', entrant: 'Ana Prueba', place: 1, text: 'Oro', done: true },
      { event: 'DM', entrant: 'Luis Prueba / Eva Prueba', place: 2, text: 'Plata', done: true },
      { event: 'IF', entrant: 'Marta Prueba', place: 3, text: 'Bronce', done: true },
      { event: 'DF', entrant: 'Otra Prueba', place: 3, text: 'Bronce', done: true },
    ],
  } as unknown as PublicTournament;

  it('con medallas dibuja el podio 2-1-3 con los nombres, el titular publicitario y la llamada a la acción (cuadrada y vertical)', () => {
    for (const size of ['square', 'story'] as const) {
      const svg = tournamentSvg(t, size, 'resultados');
      expect(svg).toContain('EL TALENTO UVA');
      expect(svg).toContain('SUBE AL PODIO');
      expect(svg).toContain('ANA PRUEBA');
      expect(svg).toContain('LUIS PRUEBA'); // las parejas, una línea por persona
      expect(svg).toContain('EVA PRUEBA');
      expect(svg).toContain('+1 MEDALLA MÁS'); // hay 4 medallas y el podio enseña 3
      expect(svg).toContain('SÚMATE AL CLUB');
    }
  });

  it('sin medallas, o en formato panorámico, sigue la lista de resultados', () => {
    expect(tournamentSvg({ ...t, results: [{ event: 'IM', entrant: 'Ana Prueba', text: 'Cae en Cuartos', done: true }] } as unknown as PublicTournament, 'square', 'resultados')).not.toContain('SUBE AL PODIO');
    expect(tournamentSvg(t, 'og', 'resultados')).not.toContain('SUBE AL PODIO');
  });
});
