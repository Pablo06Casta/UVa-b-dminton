import * as cheerio from 'cheerio';
import { parseDMY } from './dates';
import { clean } from './text';

/** Lectura del calendario oficial FESBA y del buscador de torneos de badminton.es (rutas públicas permitidas por su robots.txt). */

export interface FesbaRow {
  calendarId: string;
  url: string;
  name: string;
  /** ISO (YYYY-MM-DD). */
  startDate: string;
  group: string;
  level?: string;
  city?: string;
  country?: string;
}

/** `/calendar/192/Calendario-FESBA?year=AAAA&egid=N`: una tabla con una fila por torneo. */
export function parseFesbaCalendar(html: string, baseUrl: string): FesbaRow[] {
  const $ = cheerio.load(html);
  const out: FesbaRow[] = [];
  $('#tblEvents tr').each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 7) return;
    const link = cells.eq(4).find('a[href*="calendarevent/"]').first();
    const id = (link.attr('href') ?? '').match(/calendarevent\/(\d+)/)?.[1];
    const startDate = parseDMY(clean(cells.eq(1).text()));
    if (!id || !startDate) return; // filas de cabecera o de mes
    out.push({
      calendarId: id,
      url: `${baseUrl}/calendarevent/${id}`,
      name: clean(link.text()),
      startDate,
      group: clean(cells.eq(2).text()),
      level: clean(cells.eq(3).text()) || undefined,
      city: clean(cells.eq(5).text()) || undefined,
      country: clean(cells.eq(6).text()) || undefined,
    });
  });
  return out;
}

export interface FinderRow {
  tsId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  events: string[];
  organizer?: string;
  city?: string;
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** «sábado, 26 de septiembre de 2026» → «2026-09-26». */
export function parseSpanishDate(s: string): string | undefined {
  const m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/);
  if (!m || !MONTHS[m[2]]) return undefined;
  return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

/** Fechas de una fila: «19/09/2026 hasta 30/05/2027» o una fecha larga si es de un solo día. */
function parseDates(text: string): { start?: string; end?: string } {
  const range = text.match(/(\d{2}\/\d{2}\/\d{4})\s+(?:hasta|until|-)\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (range) return { start: parseDMY(range[1]), end: parseDMY(range[2]) };
  const day = parseSpanishDate(text) ?? parseDMY(text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '');
  return { start: day, end: day };
}

/** `/tournamentlist.aspx`: una página de resultados del buscador. */
export function parseFinder(html: string): { rows: FinderRow[]; page?: number; pages?: number; total?: number } {
  const $ = cheerio.load(html);
  const rows: FinderRow[] = [];
  $('tr[id*="_row"]').each((_, tr) => {
    const a = $(tr).find('h3 a[href*="tournament.aspx"]').first();
    const id = (a.attr('href') ?? '').match(/id=([0-9a-f-]{36})/i)?.[1];
    if (!id) return;
    const { start, end } = parseDates(clean($(tr).find('.dates').first().text()));
    const events = clean($(tr).find('span[id^="spnEvents"]:not([id^="spnEventsShort"])').first().text());
    const org = $(tr).find('td.organization').first();
    const city = clean(org.clone().children().remove().end().text());
    rows.push({
      tsId: id.toUpperCase(),
      name: clean(a.attr('title') ?? a.text()),
      startDate: start,
      endDate: end,
      events: events ? events.split(',').map(clean).filter(Boolean) : [],
      organizer: clean(org.find('a').first().text()) || undefined,
      city: city || undefined,
    });
  });
  // «Página 1 de 12 - 117 resultados»
  const caption = clean($('.page_caption').first().text()).match(/(\d+)\s+de\s+(\d+)\s*-\s*(\d+)/);
  return { rows, page: caption ? +caption[1] : undefined, pages: caption ? +caption[2] : undefined, total: caption ? +caption[3] : undefined };
}

/**
 * Cuerpo del formulario para pedir otra página del buscador. El propio sitio lo hace con `PageSelected(n, tamaño)`, que envía
 * el formulario con `__EVENTTARGET=ClientFunctionHandler` y `__EVENTARGUMENT=PageSelected;n;tamaño`.
 */
export function finderPageBody(html: string, page: number, size: number): string {
  const $ = cheerio.load(html);
  const body = new URLSearchParams();
  $('form#formBasePage')
    .find('input[type=hidden], input[type=text], input[type=radio]:checked, input[type=checkbox]:checked, select')
    .each((_, el) => {
      const name = $(el).attr('name');
      if (!name) return;
      const isSelect = (el as { tagName?: string }).tagName === 'select';
      body.set(name, isSelect ? $(el).find('option[selected]').attr('value') ?? '' : $(el).attr('value') ?? '');
    });
  body.set('__EVENTTARGET', 'ClientFunctionHandler');
  body.set('__EVENTARGUMENT', `PageSelected;${page};${size}`);
  body.set('_TListNav_PageSize', String(size));
  return body.toString();
}
