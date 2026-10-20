import { createHash } from 'node:crypto';

/** Minúsculas, sin acentos ni signos, espacios simples. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'dos']);

/** Palabras significativas de un nombre (sin partículas como «de» o «del»). */
export const nameTokens = (s: string): string[] =>
  normalizeName(s)
    .split(' ')
    .filter((t) => t && !PARTICLES.has(t));

/** Mismo nombre completo con las mismas palabras, en cualquier orden («Pérez Ana» = «Ana Pérez»). */
export function sameFullName(a: string, b: string): boolean {
  const ta = nameTokens(a).sort();
  const tb = nameTokens(b).sort();
  return ta.length > 0 && ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}

/** Colapsa espacios y recorta. */
export const clean = (s: string | undefined | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const extractGuid = (s: string): string | undefined => s.match(GUID)?.[0];

export const hashString = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 16);
