/** Cuadros del torneo: lista de cuadros, clasificación de grupos y cuadro de eliminatorias (interfaz nueva de la web oficial). */
import { clean, splitSeed } from "@/lib/util/text";
import { parseDMY } from "@/lib/util/time";
import { load } from "./common";

export interface DrawInfo {
  drawId: number;
  /** Nombre oficial: «IM», «IM - Grupo A», «IM A1». */
  name: string;
  /** Prueba a la que pertenece: «IM». */
  base: string;
  /** «Grupo A» si es un grupo de una prueba con fase de grupos. */
  group?: string;
  size?: number;
  type: "knockout" | "roundrobin";
  stage?: string;
}

/** /sport/draws.aspx: todos los cuadros del torneo. */
export function parseDrawsList(html: string): DrawInfo[] {
  const $ = load(html);
  const out: DrawInfo[] = [];
  $("table tr").each((_, tr) => {
    const a = $(tr).find('a[href*="draw="]').first();
    const id = Number((a.attr("href") ?? "").match(/draw=(\d+)/)?.[1]);
    if (!id) return;
    const cells = $(tr).children("td").map((_, td) => clean($(td).text())).get();
    const name = clean(a.text()) || cells[0];
    const type = /elimin|knock/i.test(cells[2] ?? "") ? "knockout" : "roundrobin";
    const g = name.match(/^(.*?)\s+-\s+(Grupo|Group)\s+(\S+)$/i);
    out.push({ drawId: id, name, base: g ? g[1] : name, group: g ? `Grupo ${g[3]}` : undefined, size: Number(cells[1]) || undefined, type, stage: cells[3] || undefined });
  });
  return out;
}

export interface Entrant {
  names: string[];
  /** Identificadores del torneo (player.aspx?player=N), uno por jugador. */
  ids: number[];
  /** Cabeza de serie y marcas: «1», «1, Q». */
  seed?: string;
  club?: string;
  bye?: boolean;
  /** Plaza aún por decidir: «Grupo A #1». */
  placeholder?: string;
}

export interface BracketMatch {
  a: Entrant;
  b: Entrant;
  winner?: 1 | 2;
  sets: [number, number][];
  /** Hora publicada («sá. 24/10/2026 15:30»), si la hay. */
  when?: string;
  whenIso?: string;
  court?: string;
  /** W.O., retirada… */
  note?: string;
}

export interface BracketRound {
  title: string;
  matches: BracketMatch[];
}

const ROUND_ES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^final$/i, () => "Final"],
  [/^semi[- ]?final/i, () => "Semifinales"],
  [/^quarter[- ]?final/i, () => "Cuartos de final"],
  [/^round of (\d+)/i, (m) => `Octavos (${m[1]})`],
  [/^round (\d+)/i, (m) => `Ronda ${m[1]}`],
];
export const roundTitle = (t: string) => {
  const s = clean(t);
  for (const [re, f] of ROUND_ES) {
    const m = s.match(re);
    if (m) return f(m);
  }
  return s;
};

function entrant($: ReturnType<typeof load>, row: ReturnType<ReturnType<typeof load>>): Entrant {
  const names: string[] = [];
  const ids: number[] = [];
  let seed: string | undefined;
  let text = "";
  row.find(".match__row-title-value-content").each((_, el) => {
    const a = $(el).find("a").first();
    const raw = clean($(el).text());
    if (a.length) {
      const s = splitSeed(clean(a.find(".nav-link__value").text() || a.text()));
      names.push(s.name);
      seed = seed ?? s.seed;
      const id = Number(a.attr("data-player-id"));
      if (id) ids.push(id);
    } else if (raw) text = text ? `${text} / ${raw}` : raw;
  });
  const club = clean(row.find(".match__row-entrant-info-club").first().text()) || undefined;
  if (names.length) return { names, ids, seed, club };
  if (/^bye$/i.test(text)) return { names: [], ids: [], bye: true };
  return { names: [], ids: [], placeholder: text || undefined };
}

/** Cuadro (eliminatorias o rondas de un grupo): fragmento GetDrawContent. */
export function parseBracket(html: string): BracketRound[] {
  const $ = load(html);
  const titles = $(".bracket .subheading").map((_, e) => roundTitle($(e).text())).get();
  const rounds: BracketRound[] = [];
  $(".bracket .bracket-round__item").each((i, r) => {
    const matches: BracketMatch[] = [];
    $(r)
      .find(".match")
      .each((_, m) => {
        const mm = $(m);
        if (mm.hasClass("is-invisible")) return;
        const rows = mm.find(".match__row");
        if (rows.length < 2) return;
        const a = entrant($, rows.eq(0));
        const b = entrant($, rows.eq(1));
        const winner = rows.eq(0).hasClass("has-won") ? 1 : rows.eq(1).hasClass("has-won") ? 2 : undefined;
        const sets: [number, number][] = [];
        mm.find(".match__result ul.points").each((_, ul) => {
          const cells = $(ul).find("li").map((_, li) => Number(clean($(li).text()))).get();
          if (cells.length === 2 && cells.every((x) => Number.isFinite(x))) sets.push([cells[0], cells[1]]);
        });
        const foot = mm.find(".match__footer-list-item").map((_, e) => clean($(e).text())).get().filter(Boolean);
        const when = foot.find((f) => /\d{1,2}:\d{2}/.test(f));
        const dm = when?.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}):(\d{2})/);
        const court = foot.find((f) => f !== when && /pista|court/i.test(f));
        const real = (e: Entrant) => e.names.length > 0;
        const note = winner && !sets.length && real(a) && real(b) ? "W.O." : undefined;
        matches.push({ a, b, winner, sets, when, whenIso: dm && parseDMY(dm[1]) ? `${parseDMY(dm[1])}T${dm[2].padStart(2, "0")}:${dm[3]}` : undefined, court, note });
      });
    if (matches.length) rounds.push({ title: titles[i] ?? `Ronda ${i + 1}`, matches });
  });
  return rounds;
}

export interface StandingRow {
  rank: number;
  names: string[];
  ids: number[];
  club?: string;
  region?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  /** Partidos a favor-en contra («2-0»), juegos y puntos. */
  matches: string;
  games: string;
  points: string;
  /** Puntos de clasificación. */
  pts: number;
  form: string[];
}

/** Clasificación de un grupo: fragmento GetStandings. */
export function parseStandingTable(html: string): StandingRow[] {
  const $ = load(html);
  const out: StandingRow[] = [];
  $("tbody > tr").each((_, tr) => {
    const td = $(tr).children("td");
    if (td.length < 9) return;
    const anchors = $(tr).find('a[href*="/Player/"], a[href*="/player/"]');
    const names = anchors.map((_, a) => clean($(a).find(".nav-link__value").text() || $(a).text())).get().filter(Boolean);
    if (!names.length) return;
    const ids = anchors.map((_, a) => Number(($(a).attr("href") ?? "").match(/player\/(\d+)/i)?.[1])).get().filter(Boolean);
    const n = (i: number) => Number(clean(td.eq(i).text())) || 0;
    out.push({
      rank: Number(clean(td.eq(0).text())) || out.length + 1,
      names,
      ids,
      club: clean($(tr).find(".entrant-info-club").first().attr("title") ?? $(tr).find(".entrant-info-club").first().text()) || undefined,
      region: clean($(tr).find(".entrant-info-state").first().attr("title") ?? $(tr).find(".entrant-info-state").first().text()) || undefined,
      played: n(2),
      won: n(3),
      drawn: n(4),
      lost: n(5),
      matches: clean(td.eq(6).text()),
      games: clean(td.eq(7).text()),
      points: clean(td.eq(8).text()),
      pts: n(9),
      form: clean(td.eq(10).text()).split(" ").filter(Boolean),
    });
  });
  return out;
}

/** Cuántos de cada grupo pasan al cuadro, según las plazas «Grupo A #1» publicadas en las eliminatorias. */
export function qualifiersPerGroup(rounds: BracketRound[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rounds)
    for (const m of r.matches)
      for (const e of [m.a, m.b]) {
        const g = e.placeholder?.match(/^(.*?)\s*#(\d+)$/);
        if (g) out[g[1].trim()] = Math.max(out[g[1].trim()] ?? 0, Number(g[2]));
      }
  return out;
}
