import { DateTime } from "luxon";
import { normalizeName } from "./text";

export const DEFAULT_TZ = "Europe/Madrid";

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // Algunas páginas de Tournament Software salen en inglés
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "03/10/2026" → "2026-10-03" */
export function parseDMY(s: string): string | undefined {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  return isoDate(+m[3], +m[2], +m[1]);
}

/** "sábado, 24 de octubre de 2026" → "2026-10-24" (admite variantes en inglés). */
export function parseLongDate(s: string): string | undefined {
  const n = normalizeName(s);
  const es = n.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (es && MONTHS[es[2]]) return isoDate(+es[3], MONTHS[es[2]], +es[1]);
  const en = n.match(/([a-z]+) (\d{1,2}) (\d{4})/);
  if (en && MONTHS[en[1]]) return isoDate(+en[3], MONTHS[en[1]], +en[2]);
  return undefined;
}

/** Extrae "HH:MM" de un texto. */
export function parseClock(s: string): string | undefined {
  const m = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return undefined;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return undefined;
  return `${pad(h)}:${pad(mi)}`;
}

/** Hora local de la sede → instante UTC ISO. Devuelve undefined si la hora no existe (cambio DST). */
export function localToUtcIso(date: string, clock: string, tz: string): string | undefined {
  const dt = DateTime.fromISO(`${date}T${clock}`, { zone: tz });
  if (!dt.isValid) return undefined;
  return dt.toUTC().toISO({ suppressMilliseconds: true }) ?? undefined;
}

export function utcIsoToLocal(iso: string, tz: string): { date: string; clock: string } {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);
  return { date: dt.toISODate()!, clock: dt.toFormat("HH:mm") };
}

/** Fecha de hoy en una zona horaria concreta. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(tz).toISODate()!;
}

export function addDays(date: string, n: number): string {
  return DateTime.fromISO(date).plus({ days: n }).toISODate()!;
}

export function daysBetween(a: string, b: string): number {
  return Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), "days").days);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  for (let i = 0; i < 60 && d <= end; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** "2026-10-24" → "20261024" (formato de los enlaces de partidos por día). */
export function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

const CANARY_HINTS = [
  "canarias", "las palmas", "santa cruz de tenerife", "tenerife", "gran canaria", "lanzarote",
  "fuerteventura", "la palma", "la gomera", "el hierro", "arrecife", "puerto del rosario",
  "telde", "la laguna", "san cristobal de la laguna", "adeje", "arona", "puerto de la cruz",
];

const COUNTRY_TZ: Record<string, string> = {
  ESP: "Europe/Madrid", POR: "Europe/Lisbon", FRA: "Europe/Paris", AND: "Europe/Andorra",
  ITA: "Europe/Rome", GER: "Europe/Berlin", NED: "Europe/Amsterdam", BEL: "Europe/Brussels",
  ENG: "Europe/London", GBR: "Europe/London", SCO: "Europe/London", WAL: "Europe/London",
  IRL: "Europe/Dublin", SUI: "Europe/Zurich", AUT: "Europe/Vienna", DEN: "Europe/Copenhagen",
  SWE: "Europe/Stockholm", NOR: "Europe/Oslo", FIN: "Europe/Helsinki", POL: "Europe/Warsaw",
  CZE: "Europe/Prague", SVK: "Europe/Bratislava", HUN: "Europe/Budapest", SLO: "Europe/Ljubljana",
  CRO: "Europe/Zagreb", BUL: "Europe/Sofia", ROU: "Europe/Bucharest", GRE: "Europe/Athens",
  TUR: "Europe/Istanbul", UKR: "Europe/Kyiv", LUX: "Europe/Luxembourg", EST: "Europe/Tallinn",
  LAT: "Europe/Riga", LTU: "Europe/Vilnius", ISL: "Atlantic/Reykjavik", MAR: "Africa/Casablanca",
  MEX: "America/Mexico_City", PER: "America/Lima", COL: "America/Bogota", BRA: "America/Sao_Paulo",
  ARG: "America/Argentina/Buenos_Aires", CHI: "America/Santiago", DOM: "America/Santo_Domingo",
  GUA: "America/Guatemala", CUB: "America/Havana", USA: "America/New_York", CAN: "America/Toronto",
};

/**
 * Zona horaria de la sede. España peninsular y Baleares → Europe/Madrid, Canarias → Atlantic/Canary,
 * resto de países por código ISO-3 del COI usado en Tournament Software.
 */
export function tzForLocation(loc: { country?: string; region?: string; city?: string; address?: string }): string {
  const country = (loc.country ?? "ESP").toUpperCase();
  if (country === "ESP") {
    const hay = normalizeName([loc.region, loc.city, loc.address].filter(Boolean).join(" "));
    if (CANARY_HINTS.some((h) => hay.includes(h))) return "Atlantic/Canary";
    return DEFAULT_TZ;
  }
  return COUNTRY_TZ[country] ?? DEFAULT_TZ;
}

/** Formato corto HH:MM:SS en Madrid para registros. */
export function clockSeconds(iso: string, tz = DEFAULT_TZ): string {
  return DateTime.fromISO(iso).setZone(tz).toFormat("HH:mm:ss");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / 60000;
}
