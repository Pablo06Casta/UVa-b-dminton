/** Normaliza texto para comparar nombres: sin acentos, minúsculas, espacios simples. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens de un nombre normalizado, ignorando partículas frecuentes. */
export function nameTokens(s: string): string[] {
  const stop = new Set(["de", "del", "la", "las", "los", "y", "i"]);
  return normalizeName(s)
    .split(" ")
    .filter((t) => t && !stop.has(t));
}

/** Coincidencia exacta de nombre completo (mismos tokens, en cualquier orden). */
export function sameFullName(a: string, b: string): boolean {
  const ta = nameTokens(a).sort();
  const tb = nameTokens(b).sort();
  return ta.length > 0 && ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}

/** ¿Todos los tokens de `short` aparecen en `full`? ("Ana Pérez" ⊂ "Ana María Pérez Gil") */
export function nameIsSubset(short: string, full: string): boolean {
  const f = new Set(nameTokens(full));
  const s = nameTokens(short);
  return s.length > 0 && s.every((t) => f.has(t));
}

/** Limpia espacios y entidades ya decodificadas. */
export function clean(s: string | undefined | null): string {
  return (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Quita el sufijo de cabeza de serie "[1]" y devuelve ambos. */
export function splitSeed(name: string): { name: string; seed?: string } {
  const m = clean(name).match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (m) return { name: m[1].trim(), seed: m[2].trim() };
  return { name: clean(name) };
}

export function hashString(s: string): string {
  // FNV-1a 32 bits: suficiente para detectar cambios de contenido.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractGuid(s: string): string | undefined {
  const m = s.match(GUID_RE);
  return m ? m[0].toUpperCase() : undefined;
}

export function isGuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Lee un parámetro de una URL relativa o absoluta. */
export function queryParam(href: string, name: string): string | undefined {
  const m = href.match(new RegExp(`[?&]${name}=([^&#]+)`, "i"));
  return m ? decodeURIComponent(m[1]) : undefined;
}
