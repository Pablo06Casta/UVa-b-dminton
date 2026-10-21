import { PoliteClient } from '../../src/http';
import { OfficialLiveReaders } from '../../src/officialReaders';

/**
 * Páginas construidas a mano con la misma estructura que las de badminton.es (nombres y datos ficticios, sin personas reales).
 * Las pruebas con páginas oficiales reales de los lectores están en el repositorio «Badminton Live», de donde proceden.
 */
export const G = '11111111-2222-3333-4444-555555555555';
export const page = (body: string) => `<html><head><title>Torneo</title></head><body><div id="content">${body}</div></body></html>`;

export const tournamentHtml = page(`
<div id="divTournamentHeader"><div class="title"><h3>Torneo de Prueba Absoluto</h3></div>
<p class="subtitle">Última actualización: sábado, 3 de octubre de 2026 20:12 <br /><span class="printonly flag">[ESP] </span>Federación de Prueba, Villa Ejemplo, Región de Prueba</p></div>
<ul class="tournamentcalendar"><li><a href="matches.aspx?id=${G}&amp;d=20261003">03</a></li><li><a href="matches.aspx?id=${G}&amp;d=20261004">04</a></li></ul>
<table id="x_tblContactInformation"><tr><th>Lugar:</th><td>Polideportivo de Prueba</td></tr></table>`);

export const drawsHtml = page(`<table><tr><td><a href="draw.aspx?id=${G}&draw=24">IM - Grupo A</a></td><td>3</td><td>Liguilla</td><td>Previas</td></tr>
<tr><td><a href="draw.aspx?id=${G}&draw=32">IM</a></td><td>8</td><td>Eliminación</td><td>C.Principal</td></tr></table>`);

const standingRow = (rank: number, club: string, id: number, name: string, nums: string[], form: string[]) => `<tr>
<td><span class="standing-status">${rank}</span></td>
<td><span class="entrant-info-club" title="${club}">${club}</span><a href="/tournament/${G.toLowerCase()}/Player/${id}" class="nav-link"><span class="nav-link__value">${name}</span></a></td>
${nums.map((n) => `<td class="cell-points">${n}</td>`).join('')}
<td class="standing-form"><ul>${form.map((f) => `<li><span class="tag match__status">${f}</span></li>`).join('\n')}</ul></td></tr>`;
export const standingsHtml = `<table><tbody>
${standingRow(1, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba', ['2', '2', '0', '0', '2-0', '4-0', '84-40', '4'], ['W', 'W'])}
${standingRow(2, 'CLUB DE PRUEBA', 33, 'Jugador Dos', ['2', '1', '0', '1', '1-1', '2-2', '70-66', '2'], ['W', 'L'])}</tbody></table>`;

const bracketRow = (won: boolean, club: string, id: number | null, name: string) => `<div class="match__row ${won ? 'has-won' : ''}">
<span class="match__row-entrant-info-club">${club}</span>
<span class="match__row-title-value-content">${id ? `<a href="/sport/player.aspx?id=${G}&amp;player=${id}" data-player-id="${id}"><span class="nav-link__value">${name}</span></a>` : name}</span></div>`;
const bracketMatch = (a: string, b: string, points: [number, number][], footer: string) => `<div class="match">${a}${b}
<div class="match__result">${points.map(([x, y]) => `<ul class="points"><li>${x}</li><li>${y}</li></ul>`).join('')}</div>
<ul><li class="match__footer-list-item">${footer}</li></ul></div>`;
export const bracketHtml = `<div class="bracket"><div class="subheading">Semi final</div><div class="subheading">Final</div>
<div class="bracket-round__item">
${bracketMatch(bracketRow(true, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba [1, Q]'), bracketRow(false, 'CLUB DE PRUEBA', 69, 'Jugador Tres'), [[21, 11], [21, 10]], 'sá. 03/10/2026 15:05')}
${bracketMatch(bracketRow(false, '', null, 'Bye'), bracketRow(false, 'OTRO', 70, 'Jugador Cuatro'), [], 'sá. 03/10/2026 15:35')}
</div><div class="bracket-round__item">
${bracketMatch(bracketRow(false, 'UNIVERSIDAD DE VALLADOLID', 45, 'Ana Prueba'), bracketRow(false, '', null, 'Ganador semifinal 2'), [], 'sá. 03/10/2026 19:05')}
</div></div>`;

const team = (players: [number, string][], win = false) =>
  `<td><table>${players.map(([id, n]) => `<tr><td>${win ? '<strong>' : ''}<a href="../player.aspx?id=${G}&player=${id}">${n}</a>${win ? '</strong>' : ''}</td></tr>`).join('')}</table></td>`;
const dayRow = (time: string, draw: string, drawId: number, t1: string, t2: string, result: string, dur = '', court = '') =>
  `<tr><td></td><td class="plannedtime" align="right">${time}</td><td><a href="../draw.aspx?id=${G}&draw=${drawId}">${draw}</a></td>${t1}<td align="center">-</td>${t2}<td>${result}</td><td></td><td></td><td align="right">${dur}</td><td>${court ? `<a href="../court.aspx?id=${G}&crtid=2">${court}</a>` : ''}</td></tr>`;
export const dayHtml = page(`<table class="ruler matches"><tbody>
${dayRow('9:35', 'IM - Grupo A', 24, team([[45, 'Ana Prueba']], true), team([[33, 'Jugador Dos']]), '<span class="score"><span>21-10</span> <span>21-14</span></span>', '27m', 'Pabellón - 2')}
${dayRow('9:35', 'IM - Grupo B', 25, team([[70, 'Jugador Cuatro']]), team([[2, 'Jugador Cinco']]), '<span class="score">No hay partido</span>')}
${dayRow('10:10', 'DM', 23, team([[45, 'Ana Prueba'], [64, 'Luis Prueba']], true), team([[8, 'Jugador Seis']]), '<span class="score"><span>18-21</span> <span>21-19</span> <span>21-15</span></span>', '1h 5m', 'Pabellón - 3')}
${dayRow('11:30', 'IM A1', 6, team([[33, 'Jugador Dos']]), team([[9, 'Jugador Siete']]), '<span class="score"></span><span class="tag">Jugando</span>', '', 'Pabellón - 4')}
${dayRow('12:00', 'IM A1', 6, team([[33, 'Jugador Dos']]), team([[70, 'Jugador Cuatro']]), '')}
${dayRow('12:30', 'IM A1', 6, team([[2, 'Jugador Cinco']]), team([[8, 'Jugador Seis']]), '<span class="score"><span>21-18</span> <span>5-3</span> Retirada</span>')}
</tbody></table>`);

export const profileHtml = page(`<div class="profileheader"><div class="title"><h3 title="ANA PRUEBA GIL"><span class="printonly flag">[ESP] </span>ANA PRUEBA GIL</h3></div></div>
<div class="currentlyplaying"><table><tbody><tr><td><a href="../sport/tournament.aspx?id=aaaaaaaa-0000-0000-0000-000000000001">TOP Máster</a></td><td>Villa Ejemplo</td></tr></tbody></table></div>
<div class="recentmatches"><table class="ruler matches"><tbody><tr><th colspan="8"><a href="../sport/tournament.aspx?id=${G}">Torneo de Prueba</a></th></tr><tr><th colspan="8"><a href="../sport/tournament.aspx?id=${G}">Torneo de Prueba</a></th></tr></tbody></table></div>`);

export function readers(routes: [RegExp, string | (() => Response)][]) {
  const calls: { url: string; at: number; headers: Record<string, string> }[] = [];
  let t = 1_000_000;
  const client = new PoliteClient({
    baseUrl: 'https://fuente.test',
    minIntervalMs: 2500,
    userAgent: 'prueba',
    now: () => t,
    sleep: async (ms) => void (t += ms),
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), at: t, headers: (init?.headers ?? {}) as Record<string, string> });
      const hit = routes.find(([re]) => re.test(String(url)));
      if (!hit) return new Response('', { status: 404 });
      return typeof hit[1] === 'string' ? new Response(hit[1], { status: 200 }) : hit[1]();
    }) as typeof fetch,
  });
  return { r: new OfficialLiveReaders(client), calls };
}

