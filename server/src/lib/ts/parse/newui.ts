/**
 * Parser de respaldo para la interfaz nueva de Tournament Software
 * (/tournament/{id}/Matches/MatchesInDay?date=YYYYMMDD). badminton.es usa hoy la interfaz clásica,
 * pero si migra la página de partidos, la sincronización sigue funcionando con este formato.
 */
import type { Element } from "domhandler";
import type { MatchStatus, PlayerRef } from "@/lib/domain/types";
import { clean, queryParam, splitSeed } from "@/lib/util/text";
import { localToUtcIso } from "@/lib/util/time";
import { classifyScore, LIVE_TAG_RE, load, matchKey, parseDuration, type ParsedRow } from "./common";

/** "9:00 AM", "14:05", "1. Starting at 10:00 AM" → "HH:MM" */
export function parseClock12(s: string): string | undefined {
  const m = s.match(/(\d{1,2}):(\d{2})\s*([AaPp]\.?\s?[Mm]\.?)?/);
  if (!m) return undefined;
  let h = +m[1];
  const ap = m[3]?.toLowerCase().replace(/[^ap]/g, "");
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || +m[2] > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function isNewUiMatches(html: string): boolean {
  return /class="match match--list|class="match-group"/.test(html);
}

export function parseNewUiDayMatches(html: string, ctx: { tournamentId: string; date: string; tz: string }): ParsedRow[] {
  const $ = load(html);
  const out: ParsedRow[] = [];
  $(".match.match--list, .match.match--grid").each((_, el) => {
    const m = $(el);
    const item = m.closest("li.match-group__item");
    const outer = m.parents("li.match-group__item").last();
    const groupHeader = clean(outer.find(".match-group__header").first().text());
    const sub = item.find(".match-group__subheader time").first();
    const subText = clean(item.find(".match-group__subheader").first().text());
    let plannedClock = parseClock12(sub.attr("datetime") ?? "") ?? parseClock12(subText);
    if (!plannedClock && /^\d{1,2}:\d{2}/.test(groupHeader)) plannedClock = parseClock12(groupHeader);

    const drawA = m.find('.match__header-title a[href*="draw.aspx"], .match__header-title a[href*="/draw/"]').first();
    const drawName = clean(drawA.text());
    const drawId = Number(queryParam(drawA.attr("href") ?? "", "draw") ?? (drawA.attr("href") ?? "").match(/\/draw\/(\d+)/i)?.[1]) || undefined;
    const round = clean(m.find(".match__header-title-item").eq(1).text()) || undefined;

    // Bloques laterales: "Now playing", "Duration: 33m | Pista", o solo la pista.
    const asides = m.find(".match__header-aside-block").toArray().map((b) => clean($(b).attr("title") ?? $(b).text()));
    const liveAside = asides.some((t) => LIVE_TAG_RE.test(t));
    const durAside = asides.find((t) => /Duraci[oó]n:|Duration:/i.test(t)) ?? "";
    const durationMin = parseDuration(durAside.match(/(?:Duraci[oó]n|Duration):\s*([^|]+)/i)?.[1] ?? "");
    const footerCourt = clean(m.find(".match__footer-list-item .nav-link__value").first().text());
    const asideCourt = durAside ? clean(durAside.split("|").slice(1).join("|")) : asides.find((t) => t && !LIVE_TAG_RE.test(t)) ?? "";
    const court = footerCourt || asideCourt || (/\D/.test(groupHeader) && !/^\d{1,2}:\d{2}/.test(groupHeader) ? groupHeader : undefined) || undefined;

    const rows = m.find(".match__row").toArray().slice(0, 2);
    const teams = rows.map((r: Element) => {
      const players: PlayerRef[] = [];
      $(r)
        .find('a[href*="player"]')
        .each((__, a) => {
          const { name, seed } = splitSeed($(a).find(".nav-link__value").text() || $(a).text());
          const id = Number($(a).attr("data-player-id") ?? queryParam($(a).attr("href") ?? "", "player")) || undefined;
          if (name) players.push({ tsPlayerId: id, name, seed });
        });
      const placeholder = players.length ? undefined : clean($(r).find(".match__row-title").text()) || "Por determinar";
      return { players, placeholder, won: $(r).hasClass("has-won") };
    });
    if (teams.length < 2) return;

    const sets: [number, number][] = [];
    m.find(".match__result ul.points").each((__, ul) => {
      const cells = $(ul).find("li.points__cell").toArray().map((li) => Number(clean($(li).text())));
      if (cells.length >= 2 && cells.every((n) => Number.isFinite(n))) sets.push([cells[0], cells[1]]);
    });
    const resultText = clean(m.find(".match__result, .match__status, .match__message").text());
    const liveMarker = liveAside || LIVE_TAG_RE.test(`${m.find(".match__status, .tag").text()}`) || /match--live|is-playing/.test(m.attr("class") ?? "");
    const winner = teams[0].won ? 1 : teams[1].won ? 2 : undefined;
    let status: MatchStatus = classifyScore(resultText, sets) ?? (liveMarker ? "on_court" : "scheduled");
    // Marcador con ganador marcado: terminado. Marcador sin ganador: se está jugando.
    if (status === "finished" && !winner) status = "on_court";
    const row: ParsedRow = {
      key: "",
      tournamentId: ctx.tournamentId,
      drawId,
      drawName,
      eventCode: drawName || undefined,
      round,
      date: ctx.date,
      plannedClock,
      plannedUtc: plannedClock ? localToUtcIso(ctx.date, plannedClock, ctx.tz) : undefined,
      team1: { players: teams[0].players, placeholder: teams[0].placeholder },
      team2: { players: teams[1].players, placeholder: teams[1].placeholder },
      winner,
      sets,
      scoreText: sets.length ? sets.map(([a, b]) => `${a}-${b}`).join(" ") : resultText || undefined,
      durationMin,
      court,
      status,
      orderIndex: out.length,
    };
    row.key = matchKey(row);
    if (!teams[0].players.length && !teams[1].players.length) row.key += `:r${out.length}`;
    out.push(row);
  });
  return out;
}
