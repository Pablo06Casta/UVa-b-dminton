import type { Db } from './db';
import { settings } from './config';
import type { StoredMatch } from './uva';

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'di', 'van', 'von']);

/** «Pablo Martín Castañeda» → «Pablo Martín»; «Ana de la Torre Gil» → «Ana de la Torre»; admite «Apellido, Nombre». */
export function nameAndFirstSurname(full: string): string {
  const raw = full.trim();
  const [a, b] = raw.split(',').map((x) => x.trim());
  const tokens = (b ? `${b} ${a}` : raw).split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return tokens.join(' ');
  const out = [tokens[0]];
  let i = 1;
  while (i < tokens.length - 1 && PARTICLES.has(tokens[i].toLowerCase())) out.push(tokens[i++]);
  out.push(tokens[i]);
  return out.join(' ');
}

/** Pruebas o torneos de categorías de menores («Sub-13», «Sub 17», «infantil»…): ahí los rivales pueden ser menores y no se nombran. */
export const hasYouthCategories = (name: string) => /\bsub[\s-]?\d{2}\b|infantil|juvenil|alev[ií]n|benjam[ií]n|cadete/i.test(name);

/**
 * Rivales de los partidos de un torneo para la imagen de «compartir torneo» (nombre y primer apellido), por clave de partido.
 * Solo sale en la imagen, no en la API pública. Con SHARE_RIVAL_NAMES=off queda vacío; no se nombra a rivales de pruebas de menores
 * (por el nombre de la prueba o del cuadro) ni, salvo SHARE_RIVAL_YOUTH=true, en torneos cuyo nombre no deja ver la prueba (solo torneos de menores).
 */
/**
 * ¿Se puede nombrar al rival de este partido? No en pruebas de menores (por el nombre de la prueba o del cuadro) ni, salvo
 * SHARE_RIVAL_YOUTH=true, en torneos de menores cuyo nombre no deja ver la prueba. Con SHARE_RIVAL_NAMES=off, nunca.
 */
export function rivalVisible(tournamentName: string | undefined, drawName: string | undefined, eventCode: string | undefined): boolean {
  if (!settings.shareRivalNames) return false;
  // Un torneo con varias categorías («Sub-13, Sub-17 y Absoluto») solo se bloquea en las pruebas que se identifican como de menores.
  if (!settings.shareRivalYouth && tournamentName && hasYouthCategories(tournamentName) && !/absolut|sénior|senior|\bn[1-9]\b/i.test(tournamentName)) return false;
  return settings.shareRivalYouth || !hasYouthCategories(`${drawName ?? ''} ${eventCode ?? ''}`);
}

export function rivalNamesFor(db: Db, tournamentGuid: string, tournamentName: string): Record<string, string> {
  if (!settings.shareRivalNames) return {};
  // Un torneo con varias categorías («Sub-13, Sub-17 y Absoluto») solo se bloquea en las pruebas que se identifican como de menores.
  const wholeYouth = !settings.shareRivalYouth && hasYouthCategories(tournamentName) && !/absolut|sénior|senior|\bn[1-9]\b/i.test(tournamentName);
  if (wholeYouth) return {};
  const out: Record<string, string> = {};
  for (const r of db.prepare('select json from matches where tournament_guid = ?').all(tournamentGuid) as unknown as { json: string }[]) {
    const m = JSON.parse(r.json) as StoredMatch;
    if (!settings.shareRivalYouth && hasYouthCategories(`${m.drawName} ${m.eventCode ?? ''}`)) continue;
    const uvaOn = m.sides.map((s) => s.players.some((p) => p.uva));
    if (uvaOn[0] === uvaOn[1]) continue; // ninguno o los dos lados son del club: no hay «rival» que nombrar
    const other = m.sides[uvaOn[0] ? 1 : 0].players.filter((p) => !p.uva).map((p) => nameAndFirstSurname(p.name));
    if (other.length) out[m.key] = other.join(' / ');
  }
  return out;
}
