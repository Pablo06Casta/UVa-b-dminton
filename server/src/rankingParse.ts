import * as cheerio from 'cheerio';
import { clean } from './text';

export interface RankingCandidate {
  name: string;
  /** Ruta de la ficha del ranking (player.aspx?id=…&player=…). */
  playerPath: string;
  club: string;
  birthYear?: number;
}

/** «PABLO MARTIN CASTAÑEDA» → «Pablo Martin Castañeda». */
export const titleCase = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase());

/** Categoría del ranking oficial (/ranking/category.aspx): jugadores con su club y año de nacimiento. */
export function parseRankingCategory(html: string): RankingCandidate[] {
  const $ = cheerio.load(html);
  const out: RankingCandidate[] = [];
  $('tr').each((_, tr) => {
    const a = $(tr).find('a[href*="player.aspx"]').first();
    const href = a.attr('href');
    if (!href || !/player=\d+/.test(href)) return;
    const cells = $(tr).children('td').map((_, td) => clean($(td).text())).get().filter(Boolean);
    const name = clean(a.text());
    const club = cells[cells.length - 1] ?? '';
    const year = cells.find((c) => /^(19|20)\d{2}$/.test(c));
    if (name && club && club !== name) out.push({ name, playerPath: href.startsWith('/') ? href : `/ranking/${href}`, club, birthYear: year ? Number(year) : undefined });
  });
  return out;
}

/** Ficha de un jugador del ranking: GUID de su perfil oficial (profile/default.aspx?id=…). */
export function parseRankingProfileGuid(html: string): string | undefined {
  return html.match(/\/profile\/(?:default|overview)\.aspx\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]?.toUpperCase();
}
