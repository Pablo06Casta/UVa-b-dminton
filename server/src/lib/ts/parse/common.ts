import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { Match, MatchStatus, PlayerRef, Team } from "@/lib/domain/types";
import { clean, hashString, queryParam, splitSeed } from "@/lib/util/text";
import { localToUtcIso, parseDMY } from "@/lib/util/time";

export type CheerioRoot = cheerio.CheerioAPI;

export class ParseError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export function load(html: string): CheerioRoot {
  return cheerio.load(html);
}

/** Comprueba que la página es del sistema esperado y no un error, aviso de cookies o mantenimiento. */
export function assertTsPage($: CheerioRoot, what: string) {
  if ($("#content").length === 0 && $("main").length === 0) {
    throw new ParseError("no-content", `La página de ${what} no tiene el contenedor esperado (#content).`);
  }
  const title = clean($("title").text()).toLowerCase();
  if (title.includes("cookie") || title.includes("error") || title.includes("object moved")) {
    throw new ParseError("unexpected-page", `La página de ${what} parece un aviso o error: "${title}"`);
  }
}

export function parsePlayerLink(href: string | undefined): number | undefined {
  if (!href) return undefined;
  const v = queryParam(href, "player");
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
}

/** Equipo a partir de la tabla anidada de jugadores de una fila de partido. */
export function parseTeamTable($: CheerioRoot, table: Element): { team: Team; isWinner: boolean } {
  const players: PlayerRef[] = [];
  let strongCount = 0;
  $(table)
    .find("tr")
    .each((_, tr) => {
      const a = $(tr).find('a[href*="player.aspx"]').first();
      if (a.length === 0) return;
      const { name, seed } = splitSeed(a.text());
      if (!name) return;
      const flag = clean($(tr).find(".printonly.flag").first().text()).replace(/[[\]]/g, "") || undefined;
      if (a.closest("strong").length > 0) strongCount++;
      players.push({ tsPlayerId: parsePlayerLink(a.attr("href")), name, seed, country: flag });
    });
  return { team: { players }, isWinner: players.length > 0 && strongCount === players.length };
}

export function parseSets(scoreText: string): [number, number][] {
  const sets: [number, number][] = [];
  for (const m of scoreText.matchAll(/\b(\d{1,2})-(\d{1,2})\b/g)) sets.push([+m[1], +m[2]]);
  return sets;
}

/** "27m", "1h 5m", "1h" → minutos */
export function parseDuration(s: string): number | undefined {
  const t = clean(s).toLowerCase();
  const m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  return (m[1] ? +m[1] * 60 : 0) + (m[2] ? +m[2] : 0);
}

export function classifyScore(scoreText: string, sets: [number, number][]): MatchStatus | undefined {
  const t = scoreText.toLowerCase();
  // «Incomparecencia» = no presentado (observado en una ficha real de 2023): es un W.O., no un partido pendiente.
  if (/no hay partido|walkover|w\.o\.|w\/o|no match|walk over|incomparecencia|no presentad|no show/.test(t)) return "walkover";
  if (/retirad|retired|abandon|ret\.|descalific|disqualif/.test(t)) return "retired";
  if (sets.length > 0) return "finished";
  return undefined;
}

export interface RowContext {
  /** Posición de la fila: desambigua cruces sin jugadores definidos. */
  rowIndex?: number;
  tournamentId?: string;
  /** Fecha local por defecto (páginas de partidos por día). */
  date?: string;
  tz: string;
  baseUrl: string;
}

export interface ParsedRow extends Match {
  /** Contenido de la primera celda: algunos sistemas marcan aquí el estado en directo. */
  statusHint?: string;
  /** La fila lleva la etiqueta oficial de "en juego". */
  liveTag?: boolean;
}

export const LIVE_TAG_RE = /now playing|playing|jugando|jugándose|en juego|en curso|en pista|en directo|\blive\b/i;

/** "9:35", "18:35", "5:05 PM" → "HH:MM" (la interfaz en inglés usa 12 horas). */
export function parseClock12h(s: string): string | undefined {
  const m = s.match(/(\d{1,2}):(\d{2})(?:\s*([AaPp])\.?\s?[Mm]\.?)?/);
  if (!m) return undefined;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || +m[2] > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Si la página marca los partidos en juego con etiqueta, una pista asignada sin etiqueta ni resultado no
 * está en juego. Se marca `courtNoTag` y live.ts decide qué es: en directo se ha observado que es un partido
 * ya terminado a falta de introducir el resultado (la etiqueta pasa al siguiente partido de esa pista).
 */
export function applyLiveTagRule<T extends ParsedRow>(rows: T[], tagMode?: boolean): T[] {
  const usesTags = tagMode ?? rows.some((r) => r.liveTag);
  if (!usesTags) return rows;
  for (const r of rows) {
    if (r.status === "on_court" && !r.liveTag) {
      r.status = "scheduled";
      r.courtNoTag = true;
    }
  }
  return rows;
}

function eventAndRound(drawName: string): { eventCode?: string; round?: string } {
  const parts = drawName.split(/\s+-\s+/);
  if (parts.length >= 2) return { eventCode: parts[0].trim(), round: parts.slice(1).join(" - ").trim() };
  const m = drawName.match(/^([A-Z]{2}(?:[- ]?[\w]+)?)\s+(.+)$/);
  if (m) return { eventCode: m[1], round: m[2] };
  return { eventCode: drawName || undefined };
}

/**
 * Clave estable e igual en todas las páginas (ficha del jugador, orden del día, pista):
 * torneo + cuadro + jugadores. El ID oficial no aparece en todas las páginas, por eso no se usa como clave.
 */
export function matchKey(m: Pick<Match, "tournamentId" | "matchId" | "drawId" | "drawName" | "team1" | "team2" | "date" | "plannedClock">): string {
  const ids = [...m.team1.players, ...m.team2.players]
    .map((p) => (p.tsPlayerId ? `p${p.tsPlayerId}` : p.name.toLowerCase()))
    .sort()
    .join(",");
  const draw = m.drawId ? `d${m.drawId}` : `n${m.drawName.toLowerCase()}`;
  if (ids) return `${m.tournamentId}:${draw}:${ids}`;
  if (m.matchId) return `${m.tournamentId}:m${m.matchId}`;
  return `${m.tournamentId}:${draw}:${m.date ?? ""}T${m.plannedClock ?? ""}:${hashString(JSON.stringify(m.team1) + JSON.stringify(m.team2))}`;
}

/** Clave para el historial: independiente de la página de origen (el perfil no enlaza cuadros). */
export function historyKey(m: Pick<Match, "tournamentId" | "date" | "plannedClock" | "team1" | "team2">): string {
  const names = [...m.team1.players, ...m.team2.players].map((p) => p.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()).sort().join(",");
  return `${m.tournamentId}:${m.date ?? ""}T${m.plannedClock ?? ""}:${names}`;
}

/**
 * Interpreta una fila de partido de las tablas clásicas de Tournament Software
 * (ficha de jugador, partidos del día, pista, perfil). No depende de la posición de columnas.
 */
export function parseMatchRow($: CheerioRoot, tr: Element, ctx: RowContext): ParsedRow | undefined {
  const tds = $(tr).children("td").toArray();
  if (tds.length < 3) return undefined;
  const planned = $(tr).children("td.plannedtime").first();
  const teamTables = tds.map((td) => $(td).children("table").first()).filter((t) => t.length > 0);
  let placeholders: [string, string] | undefined;
  if (teamTables.length < 2) {
    // Cruce con plazas por decidir: "Grupo D #1 - Grupo F #1". Ocupa pista, así que se conserva.
    if (planned.length === 0) return undefined;
    const sep = tds.findIndex((td) => clean($(td).text()) === "-" && $(td).children("table").length === 0);
    if (sep <= 0 || sep >= tds.length - 1) return undefined;
    const left = clean($(tds[sep - 1]).text());
    const right = clean($(tds[sep + 1]).text());
    // Rondas finales sin jugadores aún: también ocupan pista si tienen cuadro asignado.
    if (!left && !right && $(tr).find('a[href*="draw.aspx"]').length === 0) return undefined;
    placeholders = [left || "Por determinar", right || "Por determinar"];
  }

  const plannedText = clean(planned.text());
  const date = parseDMY(plannedText) ?? ctx.date;
  const plannedClock = parseClock12h(plannedText);

  const drawA = $(tr).find('a[href*="draw.aspx"]').first();
  const drawName = clean(drawA.text());
  const drawId = drawA.length ? Number(queryParam(drawA.attr("href") ?? "", "draw")) || undefined : undefined;

  const t1 = placeholders ? { team: { players: [], placeholder: placeholders[0] }, isWinner: false } : parseTeamTable($, teamTables[0][0] as Element);
  const t2 = placeholders ? { team: { players: [], placeholder: placeholders[1] }, isWinner: false } : parseTeamTable($, teamTables[1][0] as Element);

  const scoreEl = $(tr).find("span.score").first();
  const scoreText = clean(scoreEl.text());
  const sets = parseSets(scoreText);

  let durationMin: number | undefined;
  let court: string | undefined;
  let courtId: number | undefined;
  for (const td of tds) {
    const txt = clean($(td).text());
    if (durationMin === undefined && /^\d+\s*h|^\d+\s*m$/i.test(txt)) durationMin = parseDuration(txt);
  }
  const courtA = $(tr).find('a[href*="court.aspx"]').first();
  if (courtA.length) {
    court = clean(courtA.text()) || undefined;
    courtId = Number(queryParam(courtA.attr("href") ?? "", "crtid")) || undefined;
  }

  let matchId: number | undefined;
  const cal = $(tr).find('a[href*="matchcalendarhandler"]').first();
  if (cal.length && queryParam(cal.attr("href") ?? "", "typeID") === "2") matchId = Number(queryParam(cal.attr("href") ?? "", "id")) || undefined;
  const ml = $(tr).find('a[href*="match.aspx"]').first();
  if (!matchId && ml.length) matchId = Number(queryParam(ml.attr("href") ?? "", "match")) || undefined;

  let winner: 1 | 2 | undefined;
  if (t1.isWinner && !t2.isWinner) winner = 1;
  else if (t2.isWinner && !t1.isWinner) winner = 2;

  // Etiqueta oficial de partido en juego ("Now playing" / "En juego"): evidencia explícita.
  const liveTag = $(tr)
    .find("span.tag")
    .toArray()
    .some((t) => LIVE_TAG_RE.test(clean($(t).text())));
  const status: MatchStatus = classifyScore(scoreText, sets) ?? (liveTag || court ? "on_court" : "scheduled");
  const firstTd = $(tds[0]);
  const statusHint = clean(firstTd.attr("class") + " " + firstTd.text() + " " + (firstTd.find("img").attr("title") ?? "")) || undefined;

  const { eventCode, round } = eventAndRound(drawName);
  const tournamentId = ctx.tournamentId ?? "";
  const m: ParsedRow = {
    key: "",
    tournamentId,
    matchId,
    drawId,
    drawName,
    eventCode,
    round,
    date,
    plannedClock,
    plannedUtc: date && plannedClock ? localToUtcIso(date, plannedClock, ctx.tz) : undefined,
    team1: t1.team,
    team2: t2.team,
    winner,
    sets,
    scoreText: scoreText || undefined,
    durationMin,
    court,
    courtId,
    status,
    liveTag,
    statusHint: statusHint && statusHint !== "undefined" ? statusHint.replace(/^undefined\s*/, "") || undefined : undefined,
  };
  m.key = matchKey(m);
  if (placeholders && ctx.rowIndex !== undefined) m.key += `:r${ctx.rowIndex}`;
  return m;
}

export function absoluteUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl + "/sport/").toString();
  } catch {
    return href;
  }
}
