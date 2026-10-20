/** Lectura de las fuentes oficiales: calendario FESBA y buscador de torneos de badminton.es. */
import * as cheerio from "cheerio";
import { clean } from "./text";
import { parseDMY, parseLongDate } from "./time";

export interface FesbaRow {
  calendarId: string;
  url: string;
  name: string;
  startDate: string;
  group: string;
  level?: string;
  city?: string;
  country?: string;
}

/** Calendario oficial de la FESBA: /calendar/192/Calendario-FESBA?year=&egid= */
export function parseFesbaCalendar(html: string, baseUrl: string): FesbaRow[] {
  const $ = cheerio.load(html);
  const out: FesbaRow[] = [];
  $("table tr").each((_, tr) => {
    const td = $(tr).children("td");
    if (td.length < 7) return;
    const a = td.eq(4).find("a").first();
    const href = a.attr("href") ?? "";
    const id = href.match(/calendarevent\/(\d+)/)?.[1];
    const startDate = parseDMY(clean(td.eq(1).text()));
    if (!id || !startDate) return;
    out.push({
      calendarId: id,
      url: `${baseUrl}/calendarevent/${id}`,
      name: clean(a.text()),
      startDate,
      group: clean(td.eq(2).text()),
      level: clean(td.eq(3).text()) || undefined,
      city: clean(td.eq(5).text()) || undefined,
      country: clean(td.eq(6).text()) || undefined,
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

function parseRange(text: string): { start?: string; end?: string } {
  const range = text.match(/(\d{2}\/\d{2}\/\d{4})\s+(?:hasta|until|-)\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (range) return { start: parseDMY(range[1]), end: parseDMY(range[2]) };
  const d = parseLongDate(text) ?? parseDMY(text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? "");
  return { start: d, end: d };
}

/** Buscador oficial: /tournamentlist.aspx (una página de resultados). */
export function parseFinder(html: string): { rows: FinderRow[]; page?: number; pages?: number; total?: number } {
  const $ = cheerio.load(html);
  const rows: FinderRow[] = [];
  $("tr[id*='_row']").each((_, tr) => {
    const a = $(tr).find("h3 a[href*='tournament.aspx']").first();
    const id = a.attr("href")?.match(/id=([0-9A-F-]{36})/i)?.[1];
    if (!id) return;
    const { start, end } = parseRange(clean($(tr).find(".dates").first().text()));
    const evText = clean($(tr).find("span[id^='spnEvents']:not([id^='spnEventsShort'])").first().text());
    const org = $(tr).find("td.organization").first();
    const orgName = clean(org.find("a").first().text());
    const city = clean(org.clone().children().remove().end().text());
    rows.push({
      tsId: id.toUpperCase(),
      name: clean(a.attr("title") ?? a.text()),
      startDate: start,
      endDate: end,
      events: evText ? evText.split(",").map(clean).filter(Boolean) : [],
      organizer: orgName || undefined,
      city: city || undefined,
    });
  });
  const cap = clean($(".page_caption").first().text());
  const m = cap.match(/(\d+)\s+de\s+(\d+)\s*-\s*(\d+)/);
  return { rows, page: m ? +m[1] : undefined, pages: m ? +m[2] : undefined, total: m ? +m[3] : undefined };
}

/** Campos del formulario ASP.NET para pedir otra página del buscador (mismo mecanismo que usa el navegador). */
export function finderPostBody(html: string, opts: { page: number; size: number; status?: string }): string {
  const $ = cheerio.load(html);
  const p = new URLSearchParams();
  $("form")
    .first()
    .find("input[type=hidden],input[type=text],select,input[type=radio]:checked")
    .each((_, e) => {
      const name = $(e).attr("name");
      if (!name) return;
      if ((e as { tagName?: string }).tagName === "select") p.set(name, $(e).find("option[selected]").attr("value") ?? "");
      else p.set(name, $(e).attr("value") ?? "");
    });
  if (opts.status !== undefined) {
    const radio = $("input[type=radio][name$='ffStatus']").first().attr("name");
    if (radio) p.set(radio, opts.status);
  }
  p.set("__EVENTTARGET", "ClientFunctionHandler");
  p.set("__EVENTARGUMENT", `PageSelected;${opts.page};${opts.size}`);
  p.set("_TListNav_PageSize", String(opts.size));
  return p.toString();
}

