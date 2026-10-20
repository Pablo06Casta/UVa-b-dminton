import type { Db } from './db';
import { createPlayer, ValidationError } from './roster';
import { normalizeName } from './text';

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
type Col = 'name' | 'category' | 'profile' | 'minor' | 'consentBy' | 'consentAt' | 'guardian' | 'public';
const COLUMNS: Record<string, Col> = {
  nombre: 'name', nombreyapellidos: 'name', jugador: 'name', name: 'name',
  categoria: 'category', category: 'category',
  perfil: 'profile', enlace: 'profile', profile: 'profile', perfiloficial: 'profile',
  menor: 'minor', minor: 'minor', esmenor: 'minor',
  consentimiento: 'consentBy', consintio: 'consentBy', quienconsintio: 'consentBy',
  fechaconsentimiento: 'consentAt', fecha: 'consentAt',
  familia: 'guardian', consentimientofamilia: 'guardian',
  publico: 'public', mostrar: 'public',
};
const yes = (v: string) => /^(s|si|sí|1|true|x|yes|y)$/i.test(v.trim());

/**
 * Importa la lista de jugadores del club desde un CSV con columnas `nombre`, `categoria`, `perfil` y `menor`.
 * Sin más columnas, todos se crean OCULTOS: hay que registrar su consentimiento (y el de la familia, si son menores) antes de
 * publicarlos. Con las columnas opcionales `consentimiento` (quién), `fecha` (AAAA-MM-DD), `familia` y `publico`, se registra
 * el consentimiento que el club declara y se publica a quien así se indique. Las reglas de consentimiento se aplican igual.
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
    const get = (c: Col) => cells[header.indexOf(c)]?.trim() ?? '';
    const name = get('name');
    try {
      if (existing.has(normalizeName(name))) {
        result.skipped++;
        return;
      }
      createPlayer(db, {
        name,
        category: get('category') || null,
        profile: get('profile') || null,
        isMinor: yes(get('minor')),
        consentBy: get('consentBy') || null,
        consentAt: get('consentAt') || null,
        guardianConsent: yes(get('guardian')),
        public: yes(get('public')),
      });
      existing.add(normalizeName(name));
      result.created++;
    } catch (e) {
      result.errors.push({ line: lineNo, message: e instanceof ValidationError ? e.message : 'No se ha podido guardar.' });
    }
  });
  return result;
}
