import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { localToUtcIso, parseDMY } from './dates';
import type { BracketMatch, BracketRound, DrawInfo, Entrant, MatchRow, MatchStatus, StandingRow, Team } from './model';
import { clean, extractGuid, hashString } from './text';

/**
 * Lectores de las páginas de torneo de badminton.es (interfaz de Tournament Software): ficha del torneo, lista de cuadros,
 * clasificaciones de grupo, cuadros eliminatorios, orden de juego del día y perfil de jugador.
 *
 * Están escritos a partir de la estructura de esas páginas y se prueban con ejemplos construidos a mano. Son funciones puras:
 * reciben HTML y devuelven datos; no hacen peticiones.
 */

export class ParseError extends Error {
  constructor(
    public what: string,
    message: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const int = (s: string | undefined) => {
  const n = Number(clean(s).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Quita la marca de cabeza de serie o clasificación: «Nombre [1, Q]» → «Nombre». */
const stripSeed = (s: string) => clean(s.replace(/\s*\[[^\]]*\]\s*$/, ''));
const seedOf = (s: string) => clean(s.match(/\[([^\]]*)\]\s*$/)?.[1]);

/* ------------------------------------------------------------------ */
/* Ficha del torneo: /sport/tournament.aspx?id=GUID                    */
/* ------------------------------------------------------------------ */

export interface TournamentPage {
  name: string;
  organizer?: string;
  city?: string;
  region?: string;
  venue?: string;
}

export function parseTournamentPage(html: string): TournamentPage {
  const $ = cheerio.load(html);
  const name = clean($('#divTournamentHeader .title h3').first().text());
  if (!name) throw new ParseError('torneo', 'No se encontró el nombre del torneo: la página no tiene el formato esperado.');
  // «Última actualización: sábado, 3 de octubre de 2026 20:12  [ESP] Organizador, Ciudad, Región»
  const sub = clean($('#divTournamentHeader p.subtitle').first().text());
  const after = sub.replace(/^.*\d{1,2}:\d{2}\s*/, '').replace(/\[[A-Z]{3}\]\s*/, '');
  const parts = after.split(',').map(clean).filter(Boolean);
  let venue: string | undefined;
  $('table[id$="tblContactInformation"] tr').each((_, tr) => {
    if (/^(Lugar|Venue|Location)/i.test(clean($(tr).children('th').first().text()))) venue = clean($(tr).children('td').first().text()) || undefined;
  });
  return {
    name,
    organizer: parts.length >= 2 ? parts[0] : undefined,
    city: parts.length >= 2 ? parts[1] : undefined,
    region: parts.length >= 3 ? parts[2] : undefined,
    venue,
  };
}

/** Días con orden de juego (selector de días de la página de partidos): `…&d=YYYYMMDD`. */
export function parseDays(html: string): string[] {
  const days = new Set<string>();
  for (const m of html.matchAll(/[?&](?:amp;)?d=(\d{4})(\d{2})(\d{2})/g)) days.add(`${m[1]}-${m[2]}-${m[3]}`);
  return [...days].sort();
}

/* ------------------------------------------------------------------ */
/* Lista de cuadros: /sport/draws.aspx?id=GUID                         */
/* ------------------------------------------------------------------ */

export function parseDrawsList(html: string): DrawInfo[] {
  const $ = cheerio.load(html);
  const out = new Map<number, DrawInfo>();
  $('table tr').each((_, tr) => {
    const a = $(tr).find('a[href*="draw="]').first();
    const drawId = Number((a.attr('href') ?? '').match(/draw=(\d+)/)?.[1]);
    if (!drawId || out.has(drawId)) return;
    const cells = $(tr).children('td').map((_, td) => clean($(td).text())).get();
    out.set(drawId, { drawId, name: clean(a.text()) || cells[0], type: /elimin|knock/i.test(cells[2] ?? '') ? 'knockout' : 'roundrobin' });
  });
  return [...out.values()];
}

/* ------------------------------------------------------------------ */
/* Clasificación de un grupo: /tournament/{guid}/Draw/{n}/GetStandings */
/* ------------------------------------------------------------------ */

export function parseStandings(html: string): StandingRow[] {
  const $ = cheerio.load(html);
  const out: StandingRow[] = [];
  $('tbody > tr').each((_, tr) => {
    const links = $(tr).find('a[href*="/Player/"], a[href*="/player/"]');
    if (links.length === 0) return;
    const names = links.map((_, a) => clean($(a).find('.nav-link__value').text() || $(a).text())).get().filter(Boolean);
    const ids = links.map((_, a) => Number(($(a).attr('href') ?? '').match(/\/player\/(\d+)/i)?.[1])).get().filter(Boolean);
    const nums = $(tr).find('td.cell-points').map((_, td) => clean($(td).text())).get(); // Pl, G, E, P, Partidos, Juegos, Puntos, Pts
    out.push({
      rank: int($(tr).find('.standing-status').first().text()) || out.length + 1,
      names,
      ids,
      club: clean($(tr).find('.entrant-info-club').first().attr('title') ?? $(tr).find('.entrant-info-club').first().text()) || undefined,
      played: int(nums[0]),
      won: int(nums[1]),
      drawn: int(nums[2]),
      lost: int(nums[3]),
      matches: nums[4] ?? '',
      games: nums[5] ?? '',
      points: nums[6] ?? '',
      pts: int(nums[7]),
      form: $(tr).find('.match__status').map((_, s) => clean($(s).text())).get(),
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Cuadro eliminatorio: /tournament/{guid}/Draw/{n}/GetDrawContent     */
/* ------------------------------------------------------------------ */

const ROUND_ES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^final$/i, () => 'Final'],
  [/^semi[- ]?final/i, () => 'Semifinales'],
  [/^quarter[- ]?final/i, () => 'Cuartos de final'],
  [/^round of (\d+)/i, (m) => `Ronda de ${m[1]}`],
];
const roundTitle = (t: string) => {
  const s = clean(t);
  for (const [re, f] of ROUND_ES) {
    const m = s.match(re);
    if (m) return f(m);
  }
  return s;
};

const entrantOf = ($: cheerio.CheerioAPI, row: cheerio.Cheerio<Element>): Entrant => {
  const links = row.find('a[data-player-id], a[href*="player.aspx"]');
  const names = links.map((_, a) => stripSeed(clean($(a).find('.nav-link__value').text() || $(a).text()))).get().filter(Boolean);
  const ids = links.map((_, a) => Number($(a).attr('data-player-id') ?? ($(a).attr('href') ?? '').match(/player=(\d+)/)?.[1])).get().filter(Boolean);
  const club = clean(row.find('.match__row-entrant-info-club').first().text().replace(/ /g, ' ')) || undefined;
  const seed = seedOf(clean(links.first().find('.nav-link__value').text() || links.first().text())) || undefined;
  if (names.length === 0) {
    const text = clean(row.find('.match__row-title-value-content').text());
    if (/^bye$/i.test(text)) return { names: [], ids: [], bye: true };
    return { names: [], ids: [], placeholder: text || undefined };
  }
  return { names, ids, club, seed };
};

const whenIso = (text: string): string | undefined => {
  const d = parseDMY(text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '');
  const t = text.match(/(\d{1,2}):(\d{2})/);
  return d && t ? `${d}T${t[1].padStart(2, '0')}:${t[2]}` : undefined;
};

export function parseBracket(html: string): BracketRound[] {
  const $ = cheerio.load(html);
  const titles = $('.js-subheading').map((_, e) => roundTitle($(e).text())).get();
  const rounds: BracketRound[] = [];
  $('.bracket-round__item').each((i, item) => {
    const matches: BracketMatch[] = [];
    $(item)
      .find('.match')
      .each((_, m) => {
        const rows = $(m).find('.match__row');
        if (rows.length < 2) return;
        const a = entrantOf($, rows.eq(0));
        const b = entrantOf($, rows.eq(1));
        const sets: [number, number][] = [];
        $(m).find('.match__result ul.points').each((_, ul) => {
          const cells = $(ul).find('.points__cell').map((_, c) => int($(c).text())).get();
          if (cells.length >= 2) sets.push([cells[0], cells[1]]);
        });
        const footer = $(m).find('.match__footer .nav-link__value').map((_, e) => clean($(e).text())).get();
        const when = footer.find((t) => /\d{2}\/\d{2}\/\d{4}/.test(t));
        const court = footer.find((t) => !/\d{2}\/\d{2}\/\d{4}/.test(t));
        const noScore = clean($(m).find('.match__result').text());
        matches.push({
          a,
          b,
          winner: rows.eq(0).hasClass('has-won') ? 1 : rows.eq(1).hasClass('has-won') ? 2 : undefined,
          sets,
          when,
          whenIso: when ? whenIso(when) : undefined,
          court,
          note: sets.length === 0 && /[A-Za-z]{2,}/.test(noScore) ? noScore : undefined,
        });
      });
    rounds.push({ title: titles[i] ?? `Ronda ${i + 1}`, matches });
  });
  return rounds;
}

/* ------------------------------------------------------------------ */
/* Orden de juego del día: /sport/matches.aspx?id=GUID&d=YYYYMMDD      */
/* ------------------------------------------------------------------ */

const LIVE_TEXT = /jugando|en juego|en pista|en curso|now playing|\blive\b/i;
const WALKOVER = /no hay partido|walk\s*over|\bw\.?\s?o\.?\b|sin jugar/i;
const RETIRED = /retirad|retired|\bret\b/i;

const parseDuration = (s: string): number | undefined => {
  const m = clean(s).match(/^(?:(\d+)\s*h)?\s*(\d+)\s*m/i);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : undefined;
};

function teamOf($: cheerio.CheerioAPI, cell: cheerio.Cheerio<Element>): { team: Team; won: boolean } {
  const links = cell.find('a[href*="player.aspx"]');
  const players = links.map((_, a) => ({ name: clean($(a).text()), tsPlayerId: Number(($(a).attr('href') ?? '').match(/player=(\d+)/)?.[1]) || undefined })).get();
  const won = cell.find('strong').length > 0;
  const placeholder = players.length === 0 ? clean(cell.text()) || undefined : undefined;
  return { team: { players, placeholder }, won };
}

export function parseDayMatches(html: string, ctx: { tournamentId: string; date: string; tz: string }): MatchRow[] {
  const $ = cheerio.load(html);
  const table = $('table.matches').first();
  if (!table.length) return []; // día sin partidos publicados
  const out: MatchRow[] = [];
  table
    .children('tbody')
    .children('tr')
    .each((_, tr) => {
      const row = $(tr);
      const clockText = clean(row.children('td.plannedtime').text());
      const draw = row.find('a[href*="draw="]').first();
      if (!clockText && !draw.length) return; // fila de cabecera o de grupo
      const cells = row.children('td').toArray().map((el) => $(el));
      const teamCells = cells.filter((c) => c.children('table').length > 0); // un cuadro por lado, con los jugadores
      if (teamCells.length < 2) return;
      const t1 = teamOf($, teamCells[0]);
      const t2 = teamOf($, teamCells[1]);

      const scoreCell = row.find('.score').first();
      const resultText = clean(scoreCell.text());
      const sets: [number, number][] = [];
      for (const s of scoreCell.find('span').toArray().map((e) => clean($(e).text()))) {
        const m = s.match(/^(\d+)-(\d+)$/);
        if (m) sets.push([Number(m[1]), Number(m[2])]);
      }
      if (sets.length === 0) for (const m of resultText.matchAll(/(\d+)-(\d+)/g)) sets.push([Number(m[1]), Number(m[2])]);
      const liveTag = row.find('.tag').toArray().some((e) => LIVE_TEXT.test($(e).text())) || (resultText === '' && LIVE_TEXT.test(clean(row.text())));

      let status: MatchStatus;
      if (WALKOVER.test(resultText) && sets.length === 0) status = 'walkover';
      else if (RETIRED.test(resultText)) status = 'retired';
      else if (sets.length > 0) status = 'finished';
      else if (liveTag) status = 'on_court';
      else status = 'scheduled';

      let winner: 1 | 2 | undefined = t1.won ? 1 : t2.won ? 2 : undefined;
      if (!winner && sets.length > 0 && (status === 'finished' || status === 'retired')) {
        const w1 = sets.filter(([a, b]) => a > b).length;
        const w2 = sets.filter(([a, b]) => b > a).length;
        winner = w1 > w2 ? 1 : w2 > w1 ? 2 : undefined;
      }

      const drawId = Number((draw.attr('href') ?? '').match(/draw=(\d+)/)?.[1]) || undefined;
      const drawName = clean(draw.text());
      const clock = clockText.match(/(\d{1,2}):(\d{2})/);
      const plannedClock = clock ? `${clock[1].padStart(2, '0')}:${clock[2]}` : undefined;
      const ids = [...t1.team.players, ...t2.team.players].map((p) => (p.tsPlayerId ? `p${p.tsPlayerId}` : p.name.toLowerCase())).sort().join(',');
      const key = ids
        ? `${ctx.tournamentId}:d${drawId ?? hashString(drawName)}:${ids}`
        : `${ctx.tournamentId}:${drawId ?? ''}:${ctx.date}T${plannedClock ?? ''}:${hashString(JSON.stringify([t1.team, t2.team]))}`;
      const court = clean(row.find('a[href*="crtid"]').first().text()) || undefined;

      out.push({
        key,
        tournamentId: ctx.tournamentId,
        drawName,
        eventCode: drawName.match(/^([A-Z]{2})\b/)?.[1],
        round: drawName.match(/-\s*(Grupo\s+\S+)$/i)?.[1],
        date: ctx.date,
        plannedClock,
        plannedUtc: plannedClock ? localToUtcIso(ctx.date, plannedClock, ctx.tz) : undefined,
        team1: t1.team,
        team2: t2.team,
        winner,
        sets,
        scoreText: resultText || undefined,
        durationMin: parseDuration(clean(cells.find((c) => /^\s*(?:\d+\s*h\s*)?\d+\s*m\s*$/i.test(c.text()))?.text() ?? '')),
        court,
        status,
        orderIndex: out.length,
      });
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Perfil de jugador: /profile/overview.aspx?id=GUID                   */
/* ------------------------------------------------------------------ */

export function parseProfile(html: string): { name: string; current: string[]; recent: string[] } {
  const $ = cheerio.load(html);
  const h3 = $('.profileheader .title h3').first();
  const name = clean(h3.attr('title') ?? h3.text().replace(/\[[A-Z]{3}\]/, ''));
  if (!name) throw new ParseError('perfil', 'No se encontró el nombre en el perfil: la página no tiene el formato esperado.');
  const ids = (sel: string) => [...new Set($(sel).map((_, a) => extractGuid($(a).attr('href') ?? '')?.toUpperCase()).get().filter((x): x is string => !!x))];
  return {
    name,
    current: ids('.currentlyplaying a[href*="tournament.aspx"]'),
    recent: ids('.recentmatches th a[href*="tournament.aspx"]'),
  };
}
