import { compactDate } from "@/lib/util/time";
import { clean, queryParam } from "@/lib/util/text";
import { HttpError, type FetchResult, type Priority, type TsHttpClient } from "./http";
import { load } from "./parse/common";
import { isNewUiMatches, parseNewUiDayMatches } from "./parse/newui";
import {
  parseDayMatchesPage,
  parseEventPage,
  parseIcal,
  parseProfileMatches,
  parseProfileOverview,
  parseRankingIndex,
  parseRankingInternalId,
  parseRankingPlayerPage,
  parseRankingSearchJson,
  parseStandingsClubs,
  parseTournamentPage,
  parseTournamentPlayerPage,
} from "./parse/pages";

/** Rutas públicas del sistema oficial (interfaz clásica de Tournament Software). */
export const urls = {
  tournament: (id: string) => `/sport/tournament.aspx?id=${id}`,
  tournamentPlayer: (id: string, p: number) => `/sport/player.aspx?id=${id}&player=${p}`,
  players: (id: string) => `/sport/players.aspx?id=${id}`,
  event: (id: string, e: number) => `/sport/event.aspx?id=${id}&event=${e}`,
  draws: (id: string) => `/sport/draws.aspx?id=${id}`,
  draw: (id: string, d: number) => `/sport/draw.aspx?id=${id}&draw=${d}`,
  day: (id: string, date: string) => `/sport/matches.aspx?id=${id}&d=${compactDate(date)}`,
  dayNewUi: (id: string, date: string) => `/tournament/${id.toLowerCase()}/Matches/MatchesInDay?date=${compactDate(date)}`,
  court: (id: string, c: number) => `/sport/court.aspx?id=${id}&crtid=${c}`,
  match: (id: string, m: number) => `/sport/match.aspx?id=${id}&match=${m}`,
  ical: (id: string, p: number) => `/sport/matchcalendarhandler.ashx?code=${id}&id=${p}&LCID=3082&typeID=10`,
  drawContent: (id: string, d: number) => `/tournament/${id.toLowerCase()}/Draw/${d}/GetDrawContent?tabindex=1`,
  standings: (id: string, d: number) => `/tournament/${id.toLowerCase()}/Draw/${d}/GetStandings`,
  profile: (g: string) => `/profile/overview.aspx?id=${g}`,
  profileMatches: (g: string) => `/profile/matches.aspx?id=${g}`,
  rankingIndex: () => `/ranking/`,
  rankingByRid: (rid: number) => `/ranking/ranking.aspx?rid=${rid}`,
  rankingPlayerByRid: (rid: number, p: number) => `/ranking/player.aspx?rid=${rid}&player=${p}`,
  rankingPlayer: (rankingId: number, p: number) => `/ranking/player.aspx?id=${rankingId}&player=${p}`,
  rankingFind: (rankingId: number) => `/ranking/find.aspx?id=${rankingId}`,
  rankingSearch: () => `/ranking/find.aspx/GetRankingPlayer`,
  liveScorePage: (id: string) => `/visual-livescore/${id}`,
};

export interface Fetched<T> {
  data: T;
  res: FetchResult;
}

export class TsSource {
  constructor(
    public http: TsHttpClient,
    public baseUrl: string,
  ) {}

  abs(path: string) {
    return this.http.url(path);
  }

  private async page(path: string, priority: Priority = 1, minAgeMs?: number) {
    return this.http.get(path, { priority, minAgeMs });
  }

  async tournament(id: string, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.tournament(id), priority, minAgeMs);
    return { data: parseTournamentPage(res.body, id), res };
  }

  async tournamentPlayer(id: string, tsPlayerId: number, tz: string, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.tournamentPlayer(id, tsPlayerId), priority, minAgeMs);
    return { data: parseTournamentPlayerPage(res.body, { tournamentId: id, tsPlayerId, tz, baseUrl: this.baseUrl }), res };
  }

  async event(id: string, eventId: number, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.event(id, eventId), priority, minAgeMs);
    return { data: parseEventPage(res.body), res };
  }

  /**
   * Orden de juego del día. Usa la página clásica; si la fuente redirige a la interfaz nueva,
   * recurre a su fragmento AJAX (mismo contenido, otro formato).
   */
  async day(id: string, date: string, tz: string, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.day(id, date), priority, minAgeMs);
    const classic = /<table[^>]*class="[^"]*\bmatches\b/.test(res.body);
    const redirectedToNewUi = /\/tournament\/[0-9a-f-]{36}\/matches/i.test(res.finalUrl ?? "");
    if (!classic && (redirectedToNewUi || isNewUiMatches(res.body))) {
      const frag = await this.http.get(urls.dayNewUi(id, date), { priority, minAgeMs, headers: { "X-Requested-With": "XMLHttpRequest" } });
      return { data: parseNewUiDayMatches(frag.body, { tournamentId: id, date, tz }), res: frag, format: "nueva" as const };
    }
    return { data: parseDayMatchesPage(res.body, { tournamentId: id, date, tz, baseUrl: this.baseUrl }), res, format: classic ? ("clásica" as const) : ("vacía" as const) };
  }

  async ical(id: string, tsPlayerId: number, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.ical(id, tsPlayerId), priority, minAgeMs);
    return { data: parseIcal(res.body), res };
  }

  async standings(id: string, drawId: number, priority: Priority = 2) {
    const res = await this.http.get(urls.standings(id, drawId), { priority, headers: { "X-Requested-With": "XMLHttpRequest" } });
    return { data: parseStandingsClubs(res.body), res };
  }

  async profile(guid: string, priority: Priority = 1, minAgeMs?: number) {
    const res = await this.page(urls.profile(guid), priority, minAgeMs);
    return { data: parseProfileOverview(res.body, guid), res };
  }

  async profileMatches(
    guid: string,
    tz: string,
    isMe: (name: string, tournamentId: string, tsPlayerId?: number) => boolean,
    priority: Priority = 2,
    minAgeMs?: number,
  ) {
    const res = await this.page(urls.profileMatches(guid), priority, minAgeMs);
    return { data: parseProfileMatches(res.body, { tz, baseUrl: this.baseUrl, isMe }), res };
  }

  /** Lista de jugadores de un torneo (formato "Apellido, Nombre"). */
  async players(id: string, priority: Priority = 1) {
    const res = await this.page(urls.players(id), priority);
    const $ = load(res.body);
    const out: { tsPlayerId: number; name: string; listName: string }[] = [];
    $('a[href*="player.aspx"]').each((_, a) => {
      const href = $(a).attr("href") ?? "";
      const p = Number(queryParam(href, "player"));
      const listName = clean($(a).text());
      if (!p || !listName || out.some((o) => o.tsPlayerId === p)) return;
      const [last, first] = listName.split(",").map(clean);
      out.push({ tsPlayerId: p, listName, name: first ? `${first} ${last}` : listName });
    });
    return { data: out, res };
  }

  async rankingIndex() {
    const res = await this.page(urls.rankingIndex(), 2);
    return { data: parseRankingIndex(res.body), res };
  }

  async rankingInternalId(rid: number) {
    const res = await this.page(urls.rankingByRid(rid), 2);
    return { data: parseRankingInternalId(res.body), res };
  }

  async rankingPlayer(rankingId: number, rankingPlayerId: number, priority: Priority = 2) {
    const res = await this.page(urls.rankingPlayer(rankingId, rankingPlayerId), priority);
    return { data: parseRankingPlayerPage(res.body), res };
  }

  async rankingPlayerByRid(rid: number, rankingPlayerId: number, priority: Priority = 2) {
    const res = await this.page(urls.rankingPlayerByRid(rid, rankingPlayerId), priority);
    return { data: parseRankingPlayerPage(res.body), res };
  }

  /** Endpoint JSON público que usa el propio buscador del ranking (requiere la sesión de su página). */
  async searchRanking(rankingId: number, value: string) {
    await this.http.get(urls.rankingFind(rankingId), { priority: 2, minAgeMs: 10 * 60_000 });
    const res = await this.http.get(urls.rankingSearch(), {
      method: "POST",
      priority: 2,
      body: JSON.stringify({ LCID: 3082, RankingID: rankingId, Value: encodeURIComponent(value) }),
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", Referer: this.abs(urls.rankingFind(rankingId)) },
    });
    return { data: parseRankingSearchJson(JSON.parse(res.body)), res };
  }

  /** VClientID público que la página LiveScore entrega a cualquier visitante. */
  async liveScoreClientId(id: string): Promise<string | undefined> {
    try {
      const res = await this.page(urls.liveScorePage(id), 1, 6 * 3600_000);
      return res.body.match(/'VClientID'\s*:\s*'([^']+)'/)?.[1];
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return undefined;
      throw e;
    }
  }
}
