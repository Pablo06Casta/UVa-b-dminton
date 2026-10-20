import type { Db } from './db';
import { createPlayer, ValidationError } from './roster';
import { normalizeName } from '@/lib/util/text';

export interface ImportResult {
  created: number;
  /** Ya existían (mismo nombre): no se tocan. */
  skipped: number;
  errors: { line: number; message: string }[];
}

/** Divide una línea CSV respetando comillas. Admite «,» y «;» (Excel en español exporta con «;»). */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const key = (h: string) => normalizeName(h).replace(/\s+/g, '');
const COLUMNS: Record<string, 'name' | 'category' | 'profile' | 'minor'> = {
  nombre: 'name', nombreyapellidos: 'name', jugador: 'name', name: 'name',
  categoria: 'category', category: 'category',
  perfil: 'profile', enlace: 'profile', profile: 'profile', perfiloficial: 'profile',
  menor: 'minor', minor: 'minor', esmenor: 'minor',
};
const yes = (v: string) => /^(s|si|sí|1|true|x|yes|y)$/i.test(v.trim());

/**
 * Importa la lista de jugadores del club desde un CSV con columnas `nombre`, `categoria`, `perfil` y `menor`.
 * Todos se crean OCULTOS: hay que registrar su consentimiento (y el de la familia, si son menores) antes de publicarlos.
 */
export function importPlayersCsv(db: Db, text: string): ImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  if (lines.length === 0) return result;

  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitLine(lines[0], sep).map((h) => COLUMNS[key(h)]);
  if (!header.includes('name')) {
    result.errors.push({ line: 1, message: 'Falta la columna «nombre» en la primera fila.' });
    return result;
  }

  const existing = new Set((db.prepare('select name_norm from players').all() as unknown as { name_norm: string }[]).map((r) => r.name_norm));
  lines.slice(1).forEach((line, idx) => {
    const lineNo = idx + 2;
    const cells = splitLine(line, sep);
    const get = (c: 'name' | 'category' | 'profile' | 'minor') => cells[header.indexOf(c)]?.trim() ?? '';
    const name = get('name');
    try {
      if (existing.has(normalizeName(name))) {
        result.skipped++;
        return;
      }
      createPlayer(db, { name, category: get('category') || null, profile: get('profile') || null, isMinor: yes(get('minor')) });
      existing.add(normalizeName(name));
      result.created++;
    } catch (e) {
      result.errors.push({ line: lineNo, message: e instanceof ValidationError ? e.message : 'No se ha podido guardar.' });
    }
  });
  return result;
}
