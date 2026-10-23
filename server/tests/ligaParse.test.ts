import { describe, expect, it } from 'vitest';
import { parseLigaFixtures, parseLigaStandings } from '../src/ligaParse';
import { LIGA_PAGE } from './helpers/ligaPage';

describe('lectura de la Liga (badminton.es)', () => {
  it('clasificación: puesto, club, puntos (con asterisco), balance y partidos a favor y en contra', () => {
    const s = parseLigaStandings(LIGA_PAGE);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ rank: 1, club: 'Maó', points: 33, adjusted: false, played: 11, won: 11, drawn: 0, lost: 0, matchesFor: 63, matchesAgainst: 14 });
    expect(s[1]).toMatchObject({ club: 'CDB Huelva', points: 27, adjusted: true, lost: 2 });
  });

  it('encuentros: jornada, fecha y hora, local y visitante, resultado (o pendiente) y aviso de cambio', () => {
    const f = parseLigaFixtures(LIGA_PAGE);
    expect(f).toHaveLength(2);
    expect(f[0]).toEqual({ id: 1094, round: 1, date: '2026-01-24', time: '11:00', home: 'Estella', away: 'Cura Mora', homeScore: 0, awayScore: 7, moved: true });
    expect(f[1]).toMatchObject({ id: 1100, round: 2, date: '2026-01-25', time: '9:30', home: 'Maó', away: 'CIDE', moved: false });
    expect(f[1].homeScore).toBeUndefined();
  });
});
