import { load } from 'cheerio';

/** Clasificación y encuentros de una división de la Liga Nacional de Clubes, tal como los publica badminton.es (páginas `draw.aspx` y `drawmatches.aspx`). */
export interface LigaStanding {
  rank: number;
  club: string;
  points: number;
  /** Los puntos llevan asterisco en la web oficial (sanción o ajuste). */
  adjusted: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Partidos individuales a favor y en contra, p. ej. 63-14. */
  matchesFor: number;
  matchesAgainst: number;
}

export interface LigaFixture {
  /** Identificador del encuentro en badminton.es (`teammatch.aspx?match=N`). */
  id: number;
  round: number;
  /** YYYY-MM-DD y hora local. */
  date?: string;
  time?: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  moved: boolean;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const int = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) && (s ?? '').trim() !== '' ? n : 0;
};

/** Clasificación: primera tabla de la página de la división. */
export function parseLigaStandings(html: string): LigaStanding[] {
  const $ = load(html);
  const out: LigaStanding[] = [];
  $('table')
    .first()
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr)
        .children('td,th')
        .map((_, c) => clean($(c).text()))
        .get()
        .filter((c) => c !== '');
      // Fila de datos: puesto, club, puntos, jugados, ganados, empatados, perdidos, partidos a favor, «-», en contra, ...
      if (cells.length < 10 || !/^\d+$/.test(cells[0])) return;
      out.push({
        rank: int(cells[0]),
        club: cells[1],
        points: int(cells[2]),
        adjusted: cells[2].includes('*'),
        played: int(cells[3]),
        won: int(cells[4]),
        drawn: int(cells[5]),
        lost: int(cells[6]),
        matchesFor: int(cells[7]),
        matchesAgainst: int(cells[9]),
      });
    });
  return out;
}

/** «sá. 24/01/2026» → «2026-01-24». */
const isoDate = (s: string) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
};

/** Encuentros: tabla `matches` (hora, ronda, local, visitante, resultado). */
export function parseLigaFixtures(html: string): LigaFixture[] {
  const $ = load(html);
  const out: LigaFixture[] = [];
  $('table.matches tbody tr').each((_, tr) => {
    const planned = $(tr).find('td.plannedtime').first();
    const teams = $(tr).find('a.teamname');
    if (teams.length < 2) return;
    const id = Number(($(teams[0]).attr('href') ?? '').match(/match=(\d+)/)?.[1]);
    const round = int($(tr).children('td').eq(2).text());
    const time = clean(planned.find('.time').text()) || undefined;
    const score = clean($(tr).find('span.score').first().text()).match(/^(\d+)\s*-\s*(\d+)$/);
    out.push({
      id: id || 0,
      round,
      date: isoDate(planned.text()),
      time,
      home: clean($(teams[0]).text()),
      away: clean($(teams[1]).text()),
      homeScore: score ? Number(score[1]) : undefined,
      awayScore: score ? Number(score[2]) : undefined,
      moved: $(tr).find('img.icon_planningchanged').length > 0,
    });
  });
  return out;
}
