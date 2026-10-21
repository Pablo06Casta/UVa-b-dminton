import type { Element } from "domhandler";
import type { EntryStatus, MyEvent, RankingLine, TournamentInfo, TournamentLink } from "@/lib/domain/types";
import { clean, extractGuid, isGuid, queryParam } from "@/lib/util/text";
import { isoDate, parseClock, parseLongDate, tzForLocation } from "@/lib/util/time";
import { applyLiveTagRule, assertTsPage, load, ParseError, parseMatchRow, parsePlayerLink, type ParsedRow } from "./common";

const thValue = ($: ReturnType<typeof load>, scope: string, label: RegExp): string | undefined => {
  let out: string | undefined;
  $(scope)
    .find("tr")
    .each((_, tr) => {
      const th = clean($(tr).children("th").first().text());
      if (!out && label.test(th)) {
        const td = $(tr).children("td").first();
        td.find("br").replaceWith("\n");
        out = td.text().replace(/Route at\s*Google Maps/i, "").split("\n").map(clean).filter(Boolean).join(", ");
      }
    });
  return out || undefined;
};

/* ------------------------------------------------------------------ */
/* Página de torneo: /sport/tournament.aspx?id=GUID                    */
/* ------------------------------------------------------------------ */

export function parseTournamentPage(html: string, id: string): TournamentInfo {
  const $ = load(html);
  assertTsPage($, "torneo");
  const name = clean($("#divTournamentHeader .title h3").first().text());
  if (!name) throw new ParseError("tournament-name", "No se encontró el nombre del torneo.");

  const subtitle = $("#divTournamentHeader p.subtitle").first();
  const country = clean(subtitle.find(".printonly.flag").first().text()).replace(/[[\]]/g, "") || undefined;
  const subText = clean(subtitle.text());
  const lastUpdatedText = subText.match(/(?:Última actualización|Last update)[^:]*:\s*(.*?\d{1,2}:\d{2})/i)?.[1];
  const locText = clean(subText.replace(/^.*?\d{1,2}:\d{2}/, "").replace(/\[[A-Z]{3}\]/, ""));
  const locParts = locText.split(",").map(clean).filter(Boolean);
  const region = locParts.length >= 3 ? locParts[locParts.length - 1] : undefined;
  const city = locParts.length >= 2 ? locParts[locParts.length - (locParts.length >= 3 ? 2 : 1)] : undefined;
  const organizer = locParts.length >= 2 ? locParts.slice(0, locParts.length - (locParts.length >= 3 ? 2 : 1)).join(", ") : locParts[0];

  const venue = thValue($, '[id$="tblContactInformation"]', /^(Lugar|Venue|Location)/i);
  const address = thValue($, '[id$="tblContactInformation"]', /^(Dirección|Address)/i);

  const categories: string[] = [];
  $("table.tournamentevents a[href*='event.aspx']").each((_, a) => {
    const t = clean($(a).text());
    if (t) categories.push(t);
  });

  const entryOpen = thValue($, '[id$="tblOnlineEntry"]', /^(Apertura|Entry open|Opening)/i);
  const entryClose = thValue($, '[id$="tblOnlineEntry"]', /^(Fin Plazo Inscrip|Closing|Entry close)/i);
  const withdrawalDeadline = thValue($, '[id$="tblOnlineEntry"]', /^(Fin Plazo Bajas|Withdraw)/i);

  const days = new Set<string>();
  $("ul.tournamentcalendar a[href*='d=']").each((_, a) => {
    const d = queryParam($(a).attr("href") ?? "", "d")?.replace(/&amp;/g, "");
    const m = d?.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) days.add(isoDate(+m[1], +m[2], +m[3]));
  });
  // Respaldo: texto "Días de torneo"
  if (days.size === 0) {
    const h3 = $("h3").filter((_, e) => /Días de torneo|Tournament days/i.test($(e).text())).first();
    const p = clean(h3.next("p").text());
    for (const part of p.split(/hasta|until|-/i)) {
      const d = parseLongDate(part);
      if (d) days.add(d);
    }
  }
  const dayList = [...days].sort();
  const hasLiveScore = /winOpenLivescore|visual-livescore\//i.test(html);
  const level = clean($("#divTournamentHeader .title .tournamentlevel, #divTournamentHeader .title span.level").first().text()) || undefined;

  return {
    id: id.toUpperCase(),
    name,
    startDate: dayList[0],
    endDate: dayList[dayList.length - 1],
    days: dayList,
    venue,
    address,
    city,
    region,
    country: country ?? "ESP",
    organizer,
    tz: tzForLocation({ country, region, city, address }),
    hasLiveScore,
    lastUpdatedText,
    categories,
    entryOpen,
    entryClose,
    withdrawalDeadline,
    level,
  };
}

/* ------------------------------------------------------------------ */
/* Ficha del jugador en un torneo: /sport/player.aspx?id=GUID&player=N */
/* ------------------------------------------------------------------ */

export interface TournamentPlayerPage {
  tournamentId: string;
  tsPlayerId: number;
  displayName: string;
  profileGuid?: string;
  rankingPlayerIds: { rid: number; player: number; label: string }[];
  events: Omit<MyEvent, "entryStatus">[];
  matches: ParsedRow[];
  tournaments: TournamentLink[];
  icalUrl?: string;
}

export function parseTournamentPlayerPage(
  html: string,
  ctx: { tournamentId: string; tsPlayerId: number; tz: string; baseUrl: string },
): TournamentPlayerPage {
  const $ = load(html);
  assertTsPage($, "jugador del torneo");
  const sub = $(".subtitle h2").first().clone();
  sub.find("a").remove();
  const displayName = clean(sub.text());
  if (!displayName) throw new ParseError("player-name", "No se encontró el nombre del jugador en la ficha del torneo.");

  const profHref = $('a[href*="profile/default.aspx?id="]').first().attr("href");
  const profileGuid = profHref ? extractGuid(profHref) : undefined;

  const rankingPlayerIds: TournamentPlayerPage["rankingPlayerIds"] = [];
  $('a[href*="ranking/player.aspx"]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const rid = Number(queryParam(href, "rid"));
    const player = Number(queryParam(href, "player"));
    if (rid && player) rankingPlayerIds.push({ rid, player, label: clean($(a).text()) });
  });

  const matches: ParsedRow[] = [];
  $("table.matches.player")
    .first()
    .children("tbody")
    .children("tr")
    .each((_, tr) => {
      const m = parseMatchRow($, tr as Element, { tournamentId: ctx.tournamentId, tz: ctx.tz, baseUrl: ctx.baseUrl });
      if (!m) return;
      const inT1 = m.team1.players.some((p) => p.tsPlayerId === ctx.tsPlayerId);
      const inT2 = m.team2.players.some((p) => p.tsPlayerId === ctx.tsPlayerId);
      m.mySide = inT1 ? 1 : inT2 ? 2 : undefined;
      matches.push(m);
    });

  const events: TournamentPlayerPage["events"] = [];
  $("table.ruler").each((_, table) => {
    if ($(table).hasClass("matches")) return;
    $(table)
      .find("tbody > tr")
      .each((__, tr) => {
        const tds = $(tr).children("td");
        const ev = tds.eq(0).find('a[href*="event.aspx"]').first();
        if (!ev.length) return;
        events.push({
          eventId: Number(queryParam(ev.attr("href") ?? "", "event")) || undefined,
          name: clean(ev.text()),
          seed: clean(tds.eq(1).text()) || undefined,
          partner: clean(tds.eq(2).text()) || undefined,
        });
      });
  });

  const tournaments: TournamentLink[] = [];
  $(".tabbedtournamentlist table[id*='tblTournaments_']").each((_, table) => {
    const year = Number(($(table).attr("id") ?? "").match(/_(\d{4})$/)?.[1]);
    const isOlder = /Anteriores|Older/i.test(
      $(table).closest(".tabbedtournamentlist").find(`a[href="#tblTournaments_${year}"]`).text(),
    );
    $(table)
      .find("tr")
      .each((__, tr) => {
        const a = $(tr).find('a[href*="player.aspx"]').first();
        const href = a.attr("href") ?? "";
        const tid = queryParam(href, "id");
        const pid = parsePlayerLink(href);
        if (!tid || !isGuid(tid) || !pid) return;
        const dates = clean($(tr).find("td.dates").text());
        const dm = dates.match(/(\d{2})\/(\d{2})\D+(\d{2})\/(\d{2})/);
        let startDate: string | undefined;
        let endDate: string | undefined;
        if (dm && year && !isOlder) {
          startDate = isoDate(year, +dm[2], +dm[1]);
          const endYear = +dm[4] < +dm[2] || (+dm[4] === +dm[2] && +dm[3] < +dm[1]) ? year + 1 : year;
          endDate = isoDate(endYear, +dm[4], +dm[3]);
        }
        tournaments.push({ tournamentId: tid.toUpperCase(), tsPlayerId: pid, name: clean(a.text()), startDate, endDate });
      });
  });

  const ical = $('a[href*="matchcalendarhandler"][href*="typeID=10"]').first().attr("href");

  return {
    tournamentId: ctx.tournamentId,
    tsPlayerId: ctx.tsPlayerId,
    displayName,
    profileGuid,
    rankingPlayerIds,
    events,
    matches,
    tournaments,
    icalUrl: ical,
  };
}

/* ------------------------------------------------------------------ */
/* Página de categoría: /sport/event.aspx?id=GUID&event=N              */
/* ------------------------------------------------------------------ */

export interface EventEntry {
  tsPlayerIds: number[];
  names: string[];
  status: EntryStatus;
  label: string;
  seed?: string;
}

export function entryStatusFromLabel(label: string, cls = ""): EntryStatus {
  const s = `${label} ${cls}`.toLowerCase();
  if (/elt9999|exclu|excluid|no admitid/.test(s)) return "excluded";
  if (/elt9998|reserv/.test(s)) return "reserve";
  if (/withdr|retirad|baja/.test(s)) return "excluded";
  if (/elt1\b|elt2\b|main ?draw|cuadro principal|qualif|previa|admitid|accepted/.test(s)) return "confirmed";
  return "unknown";
}

export function parseEventPage(html: string): { name: string; entries: EventEntry[]; draws: { drawId: number; name: string; size?: number; type?: string }[] } {
  const $ = load(html);
  assertTsPage($, "categoría");
  const name = clean($("#content h3").first().text());
  const draws: { drawId: number; name: string; size?: number; type?: string }[] = [];
  const entries: EventEntry[] = [];
  $("table.ruler").each((_, table) => {
    $(table)
      .find("tbody > tr")
      .each((__, tr) => {
        const tds = $(tr).children("td");
        const drawA = tds.eq(0).find('a[href*="draw.aspx"]').first();
        if (drawA.length) {
          draws.push({
            drawId: Number(queryParam(drawA.attr("href") ?? "", "draw")),
            name: clean(drawA.text()),
            size: Number(clean(tds.eq(1).text())) || undefined,
            type: clean(tds.eq(2).text()) || undefined,
          });
          return;
        }
        const statusTd = tds.eq(0);
        const cls = statusTd.attr("class") ?? "";
        const playerLinks = $(tr).find('a[href*="player.aspx"]');
        if (!playerLinks.length || !/elt\d+/.test(cls)) return;
        const label = clean(statusTd.text());
        entries.push({
          tsPlayerIds: playerLinks.toArray().map((a) => parsePlayerLink($(a).attr("href"))).filter((x): x is number => !!x),
          names: playerLinks.toArray().map((a) => clean($(a).text().replace(/\[[A-Z]{3}\]/g, ""))),
          status: entryStatusFromLabel(label, cls),
          label,
          seed: clean(tds.last().text()) || undefined,
        });
      });
  });
  return { name, entries, draws };
}

/* ------------------------------------------------------------------ */
/* Orden de juego del día: /sport/matches.aspx?id=GUID&d=YYYYMMDD      */
/* y partidos de una pista: /sport/court.aspx?id=GUID&crtid=N          */
/* ------------------------------------------------------------------ */

export function parseDayMatchesPage(html: string, ctx: { tournamentId: string; date: string; tz: string; baseUrl: string }): ParsedRow[] {
  const $ = load(html);
  assertTsPage($, "partidos del día");
  const table = $("table.matches").first();
  if (!table.length) {
    // Día sin partidos publicados: la página existe pero no tiene tabla.
    return [];
  }
  const out: ParsedRow[] = [];
  table
    .children("tbody")
    .children("tr")
    .each((_, tr) => {
      const m = parseMatchRow($, tr as Element, { tournamentId: ctx.tournamentId, date: ctx.date, tz: ctx.tz, baseUrl: ctx.baseUrl, rowIndex: out.length });
      if (m) {
        m.orderIndex = out.length;
        out.push(m);
      }
    });
  return applyLiveTagRule(out);
}

export function parseCourtsList(html: string): { courtId: number; name: string }[] {
  const $ = load(html);
  const seen = new Map<number, string>();
  $('a[href*="court.aspx"]').each((_, a) => {
    const id = Number(queryParam($(a).attr("href") ?? "", "crtid"));
    if (id && !seen.has(id)) seen.set(id, clean($(a).text()));
  });
  return [...seen].map(([courtId, name]) => ({ courtId, name }));
}

/* ------------------------------------------------------------------ */
/* Perfil del jugador: /profile/overview.aspx y /profile/matches.aspx  */
/* ------------------------------------------------------------------ */

export interface ProfileOverview {
  profileGuid: string;
  name: string;
  currentlyPlaying: { tournamentId: string; name: string; location?: string }[];
  recentTournamentIds: string[];
}

export function parseProfileOverview(html: string, profileGuid: string): ProfileOverview {
  const $ = load(html);
  assertTsPage($, "perfil");
  const h3 = $(".profileheader .title h3").first();
  const name = clean(h3.attr("title") ?? h3.text().replace(/\[[A-Z]{3}\]/, ""));
  if (!name) throw new ParseError("profile-name", "No se encontró el nombre en el perfil.");
  const currentlyPlaying: ProfileOverview["currentlyPlaying"] = [];
  $(".currentlyplaying tbody tr").each((_, tr) => {
    const a = $(tr).find('a[href*="tournament.aspx"]').first();
    const id = extractGuid(a.attr("href") ?? "");
    if (!id) return;
    const loc = $(tr).children("td").eq(1).clone();
    loc.find(".printonly").remove();
    currentlyPlaying.push({ tournamentId: id, name: clean(a.text()), location: clean(loc.text()) || undefined });
  });
  const recent = new Set<string>();
  $(".recentmatches th a[href*='tournament.aspx']").each((_, a) => {
    const id = extractGuid($(a).attr("href") ?? "");
    if (id) recent.add(id);
  });
  return { profileGuid, name, currentlyPlaying, recentTournamentIds: [...recent] };
}

export interface ProfileMatch extends ParsedRow {
  tournamentName: string;
}

/** Partidos del perfil (últimos ~100), agrupados por torneo. `isMe` decide qué lado es el jugador. */
export function parseProfileMatches(
  html: string,
  ctx: { tz: string; baseUrl: string; isMe: (name: string, tournamentId: string, tsPlayerId?: number) => boolean },
): ProfileMatch[] {
  const $ = load(html);
  assertTsPage($, "partidos del perfil");
  const out: ProfileMatch[] = [];
  let tournamentId = "";
  let tournamentName = "";
  $("table.matches")
    .first()
    .children("tbody")
    .children("tr")
    .each((_, tr) => {
      const th = $(tr).children("th").first();
      if (th.length) {
        const a = th.find('a[href*="tournament.aspx"]').first();
        tournamentId = extractGuid(a.attr("href") ?? "") ?? "";
        tournamentName = clean(a.text());
        return;
      }
      const m = parseMatchRow($, tr as Element, { tournamentId, tz: ctx.tz, baseUrl: ctx.baseUrl });
      if (!m || !tournamentId) return;
      const in1 = m.team1.players.some((p) => ctx.isMe(p.name, tournamentId, p.tsPlayerId));
      const in2 = m.team2.players.some((p) => ctx.isMe(p.name, tournamentId, p.tsPlayerId));
      m.mySide = in1 && !in2 ? 1 : in2 && !in1 ? 2 : undefined;
      out.push({ ...m, tournamentName });
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Ranking: ficha /ranking/player.aspx y búsqueda JSON                 */
/* ------------------------------------------------------------------ */

export interface RankingResult {
  tournamentId: string;
  tournamentName: string;
  event: string;
  week?: string;
  /** Resultado oficial: "1", "2", "3/4", "5/8", "17/32"… */
  result: string;
  points?: number;
}

export interface RankingPlayerPage {
  rankingName: string;
  rankingWeek?: string;
  name: string;
  license?: string;
  profileGuid?: string;
  lines: RankingLine[];
  /** Fase alcanzada en cada torneo puntuable, según el ranking oficial. */
  results: RankingResult[];
}

/** "3/4" → "Semifinal", "5/8" → "Cuartos de final"… */
export function phaseLabel(result: string): string {
  const r = result.trim();
  if (r === "1") return "Campeón";
  if (r === "2") return "Finalista";
  const m = r.match(/^(\d+)\/(\d+)$/);
  if (!m) return r;
  const n = Number(m[2]);
  if (n === 4) return "Semifinal";
  if (n === 8) return "Cuartos de final";
  if (n === 16) return "Octavos de final";
  if (n === 32) return "Dieciseisavos";
  return `Ronda de ${n}`;
}

export function parseRankingPlayerPage(html: string): RankingPlayerPage {
  const $ = load(html);
  assertTsPage($, "ranking");
  const header = $("#organizationmenu .header h3").first();
  const rankingWeek = clean(header.find(".rankingdate").text()).replace(/[()]/g, "") || undefined;
  header.find(".rankingdate").remove();
  const rankingName = clean(header.text());
  const caption = $("table.ruler caption").first();
  const capText = clean(caption.text());
  const m = capText.match(/(?:Resultados de|Results of)\s+(.*?)\s*\((\w+)\)\s*$/i);
  const profileGuid = extractGuid(caption.find('a[href*="profile"]').attr("href") ?? "");
  const lines: RankingLine[] = [];
  $("table.ruler")
    .first()
    .find("tbody tr")
    .each((_, tr) => {
      const tds = $(tr).children("td");
      const cat = tds.eq(0).find('a[href*="category.aspx"]').first();
      if (!cat.length) return;
      const pos = Number(clean(tds.eq(1).text()));
      if (!pos) return;
      lines.push({
        ranking: rankingName,
        category: clean(cat.text()),
        position: pos,
        points: Number(clean($(tr).find("td.rankingpoints").text()).replace(/\./g, "").replace(",", ".")) || undefined,
      });
    });
  const results: RankingResult[] = [];
  $("table.ruler")
    .slice(1)
    .find("tbody tr")
    .each((_, tr) => {
      const tds = $(tr).children("td");
      const ev = tds.eq(1).find('a[href*="event.aspx"]').first();
      const tid = extractGuid(ev.attr("href") ?? "");
      const result = clean(tds.eq(3).text());
      if (!tid || !result) return;
      results.push({
        tournamentId: tid,
        tournamentName: clean(tds.eq(0).text()),
        event: clean(ev.text()),
        week: clean(tds.eq(2).text()) || undefined,
        result,
        points: Number(clean(tds.eq(4).text()).replace(/\./g, "").replace(",", ".")) || undefined,
      });
    });
  return { rankingName, rankingWeek, name: m?.[1] ?? "", license: m?.[2], profileGuid, lines, results };
}

export interface RankingSearchHit {
  rankingPlayerId: number;
  name: string;
  license?: string;
}

export function parseRankingSearchJson(json: unknown): RankingSearchHit[] {
  const d = (json as { d?: unknown })?.d;
  if (!Array.isArray(d)) throw new ParseError("ranking-search", "Respuesta de búsqueda de ranking inesperada.");
  return d
    .map((x: { ID?: string; Value?: string; ExtraInfo?: string }) => ({
      rankingPlayerId: Number(x.ID),
      name: clean(x.Value ?? ""),
      license: clean(x.ExtraInfo ?? "") || undefined,
    }))
    .filter((x) => x.rankingPlayerId > 0 && x.name);
}

/** Índice /ranking/: rid de cada ranking publicado. */
export function parseRankingIndex(html: string): { rid: number; name: string }[] {
  const $ = load(html);
  const out: { rid: number; name: string }[] = [];
  $('a[href*="ranking.aspx?rid="]').each((_, a) => {
    const rid = Number(queryParam($(a).attr("href") ?? "", "rid"));
    if (rid && !out.some((o) => o.rid === rid)) out.push({ rid, name: clean($(a).text()) });
  });
  return out;
}

/** Desde /ranking/ranking.aspx?rid=N, el id interno usado por find.aspx. */
export function parseRankingInternalId(html: string): number | undefined {
  const m = html.match(/find\.aspx\?id=(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/* ------------------------------------------------------------------ */
/* iCalendar oficial del jugador (matchcalendarhandler.ashx)          */
/* ------------------------------------------------------------------ */

export interface IcalMatch {
  matchId: number;
  startUtc: string;
  summary: string;
  description: string;
}

export function parseIcal(text: string): IcalMatch[] {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new ParseError("ical", "El calendario oficial no tiene formato iCalendar.");
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: IcalMatch[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => block.match(new RegExp(`^${k}(?:;[^:]*)?:(.*)$`, "m"))?.[1]?.trim() ?? "";
    const dt = get("DTSTART");
    const m = dt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const url = get("URL");
    const matchId = Number(queryParam(url, "match") ?? get("UID").match(/-(\d+)@/)?.[1]);
    if (!m || !matchId) continue;
    out.push({
      matchId,
      startUtc: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
      summary: get("SUMMARY").replace(/\\,/g, ","),
      description: get("DESCRIPTION").replace(/\\n/g, "\n").replace(/\\,/g, ","),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Clasificación de grupo (interfaz nueva): club de cada jugador       */
/* ------------------------------------------------------------------ */

export function parseStandingsClubs(html: string): { name: string; tsPlayerId?: number; club?: string; region?: string }[] {
  const $ = load(html);
  const out: { name: string; tsPlayerId?: number; club?: string; region?: string }[] = [];
  $("tbody > tr").each((_, tr) => {
    const a = $(tr).find('a[href*="/Player/"], a[href*="/player/"]').first();
    const name = clean(a.find(".nav-link__value").text() || a.text());
    if (!name) return;
    const tsPlayerId = Number((a.attr("href") ?? "").match(/\/player\/(\d+)/i)?.[1]) || undefined;
    const club = clean($(tr).find(".entrant-info-club").first().attr("title") ?? "") || undefined;
    const region = clean($(tr).find(".entrant-info-state").first().attr("title") ?? "") || undefined;
    out.push({ name, tsPlayerId, club, region });
  });
  return out;
}

export { parseClock };
