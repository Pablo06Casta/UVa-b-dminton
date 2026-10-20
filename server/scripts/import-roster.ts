/**
 * Importa jugadores desde un CSV (columnas: nombre, categoria, perfil, menor). Todos quedan OCULTOS.
 *   npm run roster:import -- lista.csv [data/club.sqlite]
 */
import fs from 'node:fs';
import path from 'node:path';
import { settings } from '../src/config';
import { openDb } from '../src/db';
import { importPlayersCsv } from '../src/importCsv';

const [file, dbFile] = process.argv.slice(2);
if (!file) {
  console.error('Uso: npm run roster:import -- lista.csv [ruta/club.sqlite]');
  process.exit(1);
}
const db = openDb(dbFile ?? path.join(settings.dataDir, 'club.sqlite'));
const r = importPlayersCsv(db, fs.readFileSync(file, 'utf8'));
console.log(`Creados: ${r.created} · Ya existían: ${r.skipped} · Errores: ${r.errors.length}`);
for (const e of r.errors) console.log(`  línea ${e.line}: ${e.message}`);
console.log('Todos quedan ocultos. Registra el consentimiento en /admin antes de mostrarlos.');
