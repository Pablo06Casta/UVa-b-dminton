import { type FinderRow, finderPageBody, parseFesbaCalendar, parseFinder } from './calendarParse';
import type { FesbaCalendarRow } from './calendar';
import { httpConfig } from './config-http';
import { type Priority, PoliteClient } from './http';
import type { BracketRound, DrawInfo, MatchRow, StandingRow, TournamentInfo } from './model';

/** Lectores de las páginas de torneo (información, cuadros, clasificaciones, orden de juego y perfiles). */
export interface LiveReaders {
  profile(guid: string, p: Priority): Promise<{ name: string; tournamentIds: string[] }>;
  tournament(guid: string, p: Priority): Promise<TournamentInfo>;
  draws(guid: string, p: Priority): Promise<DrawInfo[]>;
  standings(guid: string, drawId: number, p: Priority): Promise<StandingRow[]>;
  bracket(guid: string, drawId: number, p: Priority): Promise<BracketRound[]>;
  day(guid: string, date: string, tz: string, p: Priority): Promise<MatchRow[]>;
}

/** Lo que el motor necesita de la fuente oficial. Las pruebas usan una copia simulada. */
export interface OfficialSource extends LiveReaders {
  /** Calendario oficial FESBA y buscador de torneos (rutas públicas permitidas por robots.txt). */
  calendar(p: Priority): Promise<{ fesba: FesbaCalendarRow[]; finder: FinderRow[] }>;
}

export class LiveReadersMissingError extends Error {
  constructor() {
    super('Los lectores de las páginas de torneo no están implementados.');
    this.name = 'LiveReadersMissingError';
  }
}

const missing = () => Promise.reject(new LiveReadersMissingError());

/**
 * Fuente real: badminton.es a través del cliente prudente. El calendario está implementado (páginas públicas permitidas).
 * Los lectores de torneo se inyectan en `live`; mientras no existan, la lectura en directo no puede activarse.
 */
export class RealSource implements OfficialSource {
  readonly http: PoliteClient;

  constructor(
    http?: PoliteClient,
    private readonly live?: LiveReaders,
  ) {
    this.http = http ?? new PoliteClient({ baseUrl: httpConfig.baseUrl, minIntervalMs: httpConfig.minIntervalMs, timeoutMs: httpConfig.timeoutMs, userAgent: httpConfig.userAgent });
  }

  get hasLiveReaders() {
    return !!this.live;
  }

  profile = (g: string, p: Priority) => (this.live ? this.live.profile(g, p) : missing());
  tournament = (g: string, p: Priority) => (this.live ? this.live.tournament(g, p) : missing());
  draws = (g: string, p: Priority) => (this.live ? this.live.draws(g, p) : missing());
  standings = (g: string, d: number, p: Priority) => (this.live ? this.live.standings(g, d, p) : missing());
  bracket = (g: string, d: number, p: Priority) => (this.live ? this.live.bracket(g, d, p) : missing());
  day = (g: string, date: string, tz: string, p: Priority) => (this.live ? this.live.day(g, date, tz, p) : missing());

  async calendar(p: Priority) {
    const year = new Date().getFullYear();
    const fesba: FesbaCalendarRow[] = [];
    for (const y of [year, year + 1]) {
      for (const egid of ['593', '253', '276']) {
        const res = await this.http.get(`/calendar/192/Calendario-FESBA?year=${y}&egid=${egid}`, { priority: p });
        for (const r of parseFesbaCalendar(res.body, httpConfig.baseUrl)) fesba.push({ ...r, year: y, egid });
      }
    }
    const finder: FinderRow[] = [];
    const size = 100;
    const first = (await this.http.get('/tournamentlist.aspx', { priority: p })).body;
    let html = first;
    for (let page = 1; page <= 4; page++) {
      html = (
        await this.http.get('/tournamentlist.aspx', {
          priority: p,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: finderPageBody(page === 1 ? first : html, page, size),
        })
      ).body;
      const parsed = parseFinder(html);
      finder.push(...parsed.rows);
      if (!parsed.pages || page >= parsed.pages) break;
    }
    return { fesba, finder };
  }
}
