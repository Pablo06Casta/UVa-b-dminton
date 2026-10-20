import { describe, expect, it } from 'vitest';
import { parseBracket, parseDayMatches, parseDays, parseDrawsList, parseProfile, parseStandings, parseTournamentPage, ParseError } from '../src/officialParsers';

/**
 * Ejemplos construidos a mano con la misma estructura que las páginas de badminton.es (nombres y datos ficticios).
 * No contienen datos reales de personas.
 */
const G = '11111111-2222-3333-4444-555555555555';

const tournamentHtml = `
<div id="divTournamentHeader" class="header"><div class="title"><h3>Torneo de Prueba Absoluto</h3></div>
<p class="subtitle">Última actualización: sábado, 3 de octubre de 2026 20:12 <br /><span class="printonly flag">[ESP] </span>Federación de Prueba-REGIÓN, Villa Ejemplo, Región de Prueba</p></div>
<table id="x_tblContactInformation"><tr><th>Lugar:</th><td>Polideportivo de Prueba</td></tr><tr><th>Dirección:</th><td>Calle Falsa 1</td></tr></table>`;

const drawsHtml = `<table><tr><td><a href="draw.aspx?id=${G}&draw=24">IM - Grupo A</a></td><td>3</td><td>Liguilla</td><td>Previas</td></tr>
<tr><td><a href="draw.aspx?id=${G}&draw=32">IM</a></td><td>8</td><td>Eliminación</td><td>C.Principal</td></tr>
<tr><td><a href="draw.aspx?id=${G}&draw=24">IM - Grupo A</a></td><td>3</td><td>Liguilla</td><td></td></tr></table>`;

const standingRow = (rank: number, club: string, id: number, name: string, nums: string[], form: string[]) => `<tr>
<td><span class="standing-table-name__info"><span class="entrant-info"><span class="standing-status">${rank}</span>
<span class="entrant-info__content"><span class="entrant-info-club" title="${club}">${club}</span><span class="entrant-info-state" title="CyL">CyL</span></span></span></span></td>
<td><a href="/tournament/${G.toLowerCase()}/Player/${id}" class="nav-link"><span class="nav-link__value">${name}</span></a></td>
${nums.map((n, i) => `<td class="cell-points${i === 7 ? ' text--bold' : ''}">${n}</td>`).join('')}
<td class="standing-form"><ul>${form.map((f) => `<li><span class="tag match__status">${f}</span></li>`).join('')}</ul></td></tr>`;
const standingsHtml = `<table><thead><tr><th>Player</th></tr></thead><tbody>
${standingRow(1, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba', ['2', '2', '0', '0', '2-0', '4-0', '84-40', '4'], ['W', 'W'])}
${standingRow(2, 'CLUB DE PRUEBA', 33, 'Jugador Dos', ['2', '1', '0', '1', '1-1', '2-2', '70-66', '2'], ['W', 'L'])}</tbody></table>`;

const bracketRow = (won: boolean, club: string, id: number | null, name: string) => `<div class="match__row ${won ? 'has-won' : ''}"><div class="match__row-title">
<div class="match__row-entrant-info"><div class="match__row-entrant-info-content"><span class="match__row-entrant-info-club">${club}&nbsp;</span></div></div>
<div class="match__row-title-value"><span class="match__row-title-value-content">${id ? `<a href="/sport/player.aspx?id=${G}&amp;player=${id}" data-player-id="${id}" class="nav-link"><span class="nav-link__value">${name}</span></a>` : name}</span></div></div></div>`;
const bracketMatch = (a: string, b: string, points: [number, number][], footer: string) => `<div class="match"><div class="match__body"><div class="match__row-wrapper">${a}${b}</div>
<div class="match__result">${points.map(([x, y]) => `<ul class="points"><li class="points__cell points__cell--won"> ${x}</li><li class="points__cell"> ${y}</li></ul>`).join('')}</div></div>
<div class="match__footer"><ul><li><span class="nav-link__value">${footer}</span></li></ul></div></div>`;
const bracketHtml = `<div class="swiper-bracket-header"><div class="js-subheading">Semi final</div><div class="js-subheading">Final</div></div>
<swiper-container><swiper-slide class="bracket-round__item">
${bracketMatch(bracketRow(true, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba [1, Q]'), bracketRow(false, 'CLUB DE PRUEBA', 69, 'Jugador Tres [Q]'), [[21, 11], [21, 10]], 'sá. 03/10/2026 15:05')}
${bracketMatch(bracketRow(false, '', null, 'Bye'), bracketRow(false, 'OTRO', 70, 'Jugador Cuatro'), [], 'sá. 03/10/2026 15:35')}
</swiper-slide><swiper-slide class="bracket-round__item">
${bracketMatch(bracketRow(false, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba'), bracketRow(false, '', null, 'Ganador semifinal 2'), [], 'sá. 03/10/2026 19:05')}
</swiper-slide></swiper-container>`;

const team = (id: number, name: string, win = false) => `<td${win ? '' : ''}><table><tr><td>${win ? '<strong>' : ''}<a href="../player.aspx?id=${G}&player=${id}">${name}</a>${win ? '</strong>' : ''}</td></tr></table></td>`;
const dayRow = (time: string, draw: string, drawId: number, t1: string, t2: string, result: string, dur = '', court = '') =>
  `<tr><td></td><td class="plannedtime" align="right">${time}</td><td><a href="../draw.aspx?id=${G}&draw=${drawId}">${draw}</a></td>${t1}<td align="center">-</td>${t2}<td>${result}</td><td></td><td></td><td align="right">${dur}</td><td>${court ? `<a href="../court.aspx?id=${G}&crtid=2">${court}</a>` : ''}</td></tr>`;
const dayHtml = `<ul class="days"><li><a href="matches.aspx?id=${G}&amp;d=20261003">03</a></li><li><a href="matches.aspx?id=${G}&amp;d=20261004">04</a></li></ul>
<table class="ruler matches"><thead><tr><td></td><td>Hora</td></tr></thead><tbody>
${dayRow('9:35', 'IM - Grupo A', 24, team(45, 'Ana Prueba', true), team(33, 'Jugador Dos'), '<span class="score"><span>21-10</span> <span>21-14</span></span>', '27m', 'Pabellón - 2')}
${dayRow('9:35', 'IM - Grupo B', 25, team(70, 'Jugador Cuatro'), team(2, 'Jugador Cinco'), '<span class="score">No hay partido</span>')}
${dayRow('10:10', 'DM', 23, team(45, 'Ana Prueba') .replace('</td></tr></table></td>', '</td></tr><tr><td><a href="../player.aspx?id=' + G + '&player=64">Luis Prueba</a></td></tr></table></td>'), team(8, 'Jugador Seis'), '<span class="score"><span>18-21</span> <span>21-19</span> <span>21-15</span></span>', '1h 05m', 'Pabellón - 3')}
${dayRow('11:00', 'IM A1', 6, team(45, 'Ana Prueba'), team(9, 'Jugador Siete'), '', '', 'Pabellón - 1')}
${dayRow('11:30', 'IM A1', 6, team(33, 'Jugador Dos'), team(9, 'Jugador Siete'), '<span class="score"></span><span class="tag">Jugando</span>', '', 'Pabellón - 4')}
${dayRow('12:00', 'IM A1', 6, team(33, 'Jugador Dos'), team(70, 'Jugador Cuatro'), '')}
${dayRow('12:30', 'IM A1', 6, team(2, 'Jugador Cinco'), team(8, 'Jugador Seis'), '<span class="score"><span>21-18</span> <span>5-3</span> Retirada</span>')}
</tbody></table>`;

const profileHtml = `<div class="profileheader"><div class="title"><h3 title="ANA PRUEBA GIL"><span class="printonly flag">[ESP] </span>ANA PRUEBA GIL</h3></div></div>
<div class="currentlyplaying"><table><tbody><tr><td><a href="../sport/tournament.aspx?id=aaaaaaaa-0000-0000-0000-000000000001">TOP Máster</a></td></tr></tbody></table></div>
<div class="recentmatches"><table class="ruler matches"><tbody><tr><th colspan="8"><a href="../sport/tournament.aspx?id=${G}">Torneo de Prueba</a></th></tr><tr><th colspan="8"><a href="../sport/tournament.aspx?id=${G}">Torneo de Prueba</a></th></tr></tbody></table></div>`;

describe('ficha del torneo, días y cuadros', () => {
  it('lee nombre, organizador, localidad, región y sede', () => {
    expect(parseTournamentPage(tournamentHtml)).toEqual({ name: 'Torneo de Prueba Absoluto', organizer: 'Federación de Prueba-REGIÓN', city: 'Villa Ejemplo', region: 'Región de Prueba', venue: 'Polideportivo de Prueba' });
  });
  it('falla con un error claro si la página no tiene el formato esperado', () => {
    expect(() => parseTournamentPage('<html><body>Mantenimiento</body></html>')).toThrow(ParseError);
  });
  it('lee los días del selector, ordenados y sin repetir', () => {
    expect(parseDays(dayHtml + dayHtml)).toEqual(['2026-10-03', '2026-10-04']);
  });
  it('lista los cuadros sin duplicados, con su tipo', () => {
    expect(parseDrawsList(drawsHtml)).toEqual([
      { drawId: 24, name: 'IM - Grupo A', type: 'roundrobin' },
      { drawId: 32, name: 'IM', type: 'knockout' },
    ]);
  });
});

describe('clasificación de grupo', () => {
  const rows = parseStandings(standingsHtml);
  it('lee puesto, club, jugador y cifras', () => {
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rank: 1, names: ['Ana Prueba'], ids: [45], club: 'UNIVERSIDAD DE VALLADOLID', played: 2, won: 2, lost: 0, matches: '2-0', games: '4-0', points: '84-40', pts: 4, form: ['W', 'W'] });
    expect(rows[1]).toMatchObject({ rank: 2, club: 'CLUB DE PRUEBA', won: 1, lost: 1, pts: 2 });
  });
});

describe('cuadro eliminatorio', () => {
  const rounds = parseBracket(bracketHtml);
  it('traduce los títulos de ronda y lee los partidos', () => {
    expect(rounds.map((r) => r.title)).toEqual(['Semifinales', 'Final']);
    expect(rounds.map((r) => r.matches.length)).toEqual([2, 1]);
  });
  it('lee participantes, club, cabeza de serie, ganador, sets y hora', () => {
    const m = rounds[0].matches[0];
    expect(m.a).toMatchObject({ names: ['Ana Prueba'], ids: [45], club: 'UNIVERSIDAD DE VALLADOLID', seed: '1, Q' });
    expect(m.b).toMatchObject({ names: ['Jugador Tres'], ids: [69], club: 'CLUB DE PRUEBA' });
    expect(m).toMatchObject({ winner: 1, sets: [[21, 11], [21, 10]], when: 'sá. 03/10/2026 15:05', whenIso: '2026-10-03T15:05' });
  });
  it('reconoce el bye y las plazas por decidir', () => {
    expect(rounds[0].matches[1].a).toMatchObject({ bye: true, names: [] });
    expect(rounds[1].matches[0].b).toMatchObject({ placeholder: 'Ganador semifinal 2', names: [] });
    expect(rounds[1].matches[0]).toMatchObject({ winner: undefined, sets: [] });
  });
});

describe('orden de juego del día', () => {
  const rows = parseDayMatches(dayHtml, { tournamentId: G, date: '2026-10-03', tz: 'Europe/Madrid' });
  it('lee todas las filas', () => expect(rows).toHaveLength(7));

  it('partido terminado: jugadores, ganador, sets, duración, pista, prueba y hora en UTC', () => {
    expect(rows[0]).toMatchObject({
      drawName: 'IM - Grupo A', eventCode: 'IM', round: 'Grupo A', plannedClock: '09:35', plannedUtc: '2026-10-03T07:35:00.000Z',
      winner: 1, sets: [[21, 10], [21, 14]], durationMin: 27, court: 'Pabellón - 2', status: 'finished',
    });
    expect(rows[0].team1.players).toEqual([{ name: 'Ana Prueba', tsPlayerId: 45 }]);
    expect(rows[0].team2.players).toEqual([{ name: 'Jugador Dos', tsPlayerId: 33 }]);
  });
  it('W.O. («No hay partido»)', () => expect(rows[1]).toMatchObject({ status: 'walkover', sets: [] }));
  it('dobles con tres sets y duración en horas', () => {
    expect(rows[2].team1.players.map((p) => p.name)).toEqual(['Ana Prueba', 'Luis Prueba']);
    expect(rows[2]).toMatchObject({ eventCode: 'DM', sets: [[18, 21], [21, 19], [21, 15]], winner: 1, durationMin: 65, status: 'finished' });
  });
  it('partido pendiente (con pista, sin resultado) y sin pista', () => {
    expect(rows[3]).toMatchObject({ status: 'scheduled', court: 'Pabellón - 1', sets: [] });
    expect(rows[5]).toMatchObject({ status: 'scheduled', court: undefined });
  });
  it('partido en juego, si la página lo marca', () => expect(rows[4].status).toBe('on_court'));
  it('retirada, con el marcador parcial', () => expect(rows[6]).toMatchObject({ status: 'retired', sets: [[21, 18], [5, 3]], winner: 1 }));
  it('las claves son únicas y estables entre lecturas', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    expect(parseDayMatches(dayHtml, { tournamentId: G, date: '2026-10-03', tz: 'Europe/Madrid' }).map((r) => r.key)).toEqual(rows.map((r) => r.key));
  });
  it('un día sin tabla de partidos da lista vacía', () => expect(parseDayMatches('<div>Sin partidos</div>', { tournamentId: G, date: '2026-10-03', tz: 'Europe/Madrid' })).toEqual([]));
});

describe('perfil de jugador', () => {
  it('lee el nombre y los torneos en curso y recientes, sin repetir', () => {
    expect(parseProfile(profileHtml)).toEqual({ name: 'ANA PRUEBA GIL', current: ['AAAAAAAA-0000-0000-0000-000000000001'], recent: [G.toUpperCase()] });
  });
  it('falla con un error claro si no hay nombre', () => expect(() => parseProfile('<div></div>')).toThrow(ParseError));
});
