import type { PoliteClient, Priority } from './http';
import type { LiveReaders, RosterReaders } from './source';
import { parseRankingCategory, parseRankingProfileGuid } from './rankingParse';
import { TsSource, urls } from './lib/ts/source';
import { parseBracket, parseDrawsList, parseStandingTable } from './lib/ts/parse/draws';

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
    return parseDrawsList((await this.http.get(urls.draws(guid), { priority: p })).body);
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

  async rankingPlayers(url: string, p: Priority) {
    return parseRankingCategory((await this.http.get(url, { priority: p })).body);
  }

  async rankingProfile(playerPath: string, p: Priority) {
    return parseRankingProfileGuid((await this.http.get(playerPath, { priority: p })).body);
  }
}
