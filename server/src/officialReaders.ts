import type { PoliteClient, Priority } from './http';
import type { LiveReaders, RosterReaders } from './source';
import { parseRankingCategory, parseRankingProfileGuid } from './rankingParse';
import { TsSource, urls } from './lib/ts/source';
import { parseBracket, parseDrawsList, parseStandingTable } from './lib/ts/parse/draws';
import { parseEventPage } from './lib/ts/parse/pages';

const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

/**
 * Lectores de las páginas públicas de torneo y de perfil de badminton.es.
 * Todas las lecturas pasan por el cliente prudente (una petición cada ≥ 2,5 s, con caché y reintentos).
 * Los lectores de HTML (`lib/ts/parse`) proceden de «Badminton Live» y están probados allí con páginas oficiales reales.
 */
export class OfficialLiveReaders implements LiveReaders, RosterReaders {
  private readonly src: TsSource;

  constructor(private readonly http: PoliteClient) {
    this.src = new TsSource(http, http.url('/').replace(/\/$/, ''));
  }

  async profile(guid: string, p: Priority) {
    const { data } = await this.src.profile(guid, p);
    const ids = new Set<string>([...data.currentlyPlaying.map((t) => t.tournamentId), ...data.recentTournamentIds]);
    return { name: data.name, tournamentIds: [...ids] };
  }

  async tournament(guid: string, p: Priority) {
    const { data } = await this.src.tournament(guid, p);
    return data;
  }

  async draws(guid: string, p: Priority) {
    const res = await this.http.get(urls.draws(guid), { priority: p });
    const list = parseDrawsList(res.body);
    if (list.length === 0) {
      // Para diagnóstico: qué página llegó realmente (código, dirección final, título y tamaño), sin contenido personal.
      const title = res.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 80);
      const e = new Error(`Lista de cuadros vacía: HTTP ${res.status}, ${res.bytes || res.body.length} B, final «${res.finalUrl ?? res.url}», título «${title ?? '-'}»`);
      throw e;
    }
    return list;
  }

  async standings(guid: string, drawId: number, p: Priority) {
    return parseStandingTable((await this.http.get(urls.standings(guid, drawId), { priority: p, headers: XHR })).body);
  }

  async bracket(guid: string, drawId: number, p: Priority) {
    return parseBracket((await this.http.get(urls.drawContent(guid, drawId), { priority: p, headers: XHR })).body);
  }

  async day(guid: string, date: string, tz: string, p: Priority) {
    const { data } = await this.src.day(guid, date, tz, p);
    return data;
  }

  /** Pruebas del torneo: enlaces a `event.aspx?...&event=N` de la página de categorías. */
  async events(guid: string, p: Priority) {
    const body = (await this.http.get(`/sport/events.aspx?id=${guid}`, { priority: p })).body;
    const out: { eventId: number; name: string }[] = [];
    for (const m of body.matchAll(/<a[^>]+href="[^"]*event\.aspx\?[^"]*?event=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const eventId = Number(m[1]);
      const name = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ').trim();
      if (eventId && name && !out.some((o) => o.eventId === eventId)) out.push({ eventId, name });
    }
    return out;
  }

  async eventEntries(guid: string, eventId: number, p: Priority) {
    const { entries } = parseEventPage((await this.http.get(urls.event(guid, eventId), { priority: p })).body);
    return entries.map((e) => ({ names: e.names, status: e.status as 'confirmed' | 'reserve' | 'excluded' | 'unknown', label: e.label }));
  }

  async rankingPlayers(url: string, p: Priority) {
    return parseRankingCategory((await this.http.get(url, { priority: p })).body);
  }

  async rankingProfile(playerPath: string, p: Priority) {
    return parseRankingProfileGuid((await this.http.get(playerPath, { priority: p })).body);
  }
}
