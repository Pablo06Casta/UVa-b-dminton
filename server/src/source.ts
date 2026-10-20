import { config } from '@/lib/config';
import type { TournamentInfo } from '@/lib/domain/types';
import { TsHttpClient, type Priority } from '@/lib/ts/http';
import type { ParsedRow } from '@/lib/ts/parse/common';
import { parseBracket, parseDrawsList, parseStandingTable, type BracketRound, type DrawInfo, type StandingRow } from '@/lib/ts/parse/draws';
import { TsSource, urls } from '@/lib/ts/source';
import { finderPostBody, parseFesbaCalendar, parseFinder, type FesbaRow, type FinderRow } from '@/lib/org/parse';

/** Lo que el motor necesita de la fuente oficial. Se puede sustituir por una copia en las pruebas. */
export interface OfficialSource {
  profile(guid: string, p: Priority): Promise<{ name: string; tournamentIds: string[] }>;
  tournament(guid: string, p: Priority): Promise<TournamentInfo>;
  draws(guid: string, p: Priority): Promise<DrawInfo[]>;
  standings(guid: string, drawId: number, p: Priority): Promise<StandingRow[]>;
  bracket(guid: string, drawId: number, p: Priority): Promise<BracketRound[]>;
  day(guid: string, date: string, tz: string, p: Priority): Promise<ParsedRow[]>;
  /** Calendario oficial FESBA y buscador de torneos (rutas permitidas por robots.txt). */
  calendar(p: Priority): Promise<{ fesba: FesbaCalendarRow[]; finder: FinderRow[] }>;
}

export type FesbaCalendarRow = FesbaRow & { year: number; egid: string };

export interface HttpStats {
  requestsLastHour: number;
  consecutiveFailures: number;
  circuitOpenUntil: string | null;
  queued: number;
}

const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

/** Fuente real: badminton.es a través del cliente prudente (≥2,5 s entre peticiones, caché, reintentos, corte). */
export class RealSource implements OfficialSource {
  readonly http: TsHttpClient;
  private ts: TsSource;

  constructor(http?: TsHttpClient) {
    this.http =
      http ??
      new TsHttpClient({
        baseUrl: config.baseUrl,
        minIntervalMs: config.minRequestIntervalMs,
        timeoutMs: config.requestTimeoutMs,
        userAgent: config.userAgent,
      });
    this.ts = new TsSource(this.http, config.baseUrl);
  }

  async profile(guid: string, p: Priority) {
    const { data } = await this.ts.profile(guid, p);
    return { name: data.name, tournamentIds: [...new Set([...data.currentlyPlaying.map((t) => t.tournamentId), ...data.recentTournamentIds])] };
  }
  async tournament(guid: string, p: Priority) {
    return (await this.ts.tournament(guid, p)).data;
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
    return (await this.ts.day(guid, date, tz, p)).data;
  }

  async calendar(p: Priority) {
    const year = new Date().getFullYear();
    const fesba: FesbaCalendarRow[] = [];
    for (const y of [year, year + 1]) {
      for (const g of ['593', '253', '276']) {
        const res = await this.http.get(`/calendar/192/Calendario-FESBA?year=${y}&egid=${g}`, { priority: p });
        for (const r of parseFesbaCalendar(res.body, config.baseUrl)) fesba.push({ ...r, year: y, egid: g });
      }
    }
    const finder: FinderRow[] = [];
    const form = { method: 'POST' as const, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, priority: p };
    const first = (await this.http.get('/tournamentlist.aspx', { priority: p })).body;
    let html = first;
    for (let page = 1; page <= 4; page++) {
      html = (await this.http.get('/tournamentlist.aspx', { ...form, body: finderPostBody(page === 1 ? first : html, { page, size: 100 }) })).body;
      const parsed = parseFinder(html);
      finder.push(...parsed.rows);
      if (!parsed.pages || page >= parsed.pages) break;
    }
    return { fesba, finder };
  }
}
