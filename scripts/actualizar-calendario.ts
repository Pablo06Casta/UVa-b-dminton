/**
 * Actualiza el calendario oficial de torneos ABSOLUTOS (nacionales y territoriales) desde badminton.es.
 *
 *   npm run calendario:actualizar
 *
 * Solo consulta rutas que el robots.txt de badminton.es NO excluye (calendario FESBA y buscador de torneos), con una
 * petición cada ≥ 2,5 s y parada inmediata ante 429/5xx. Usa los lectores del servidor (server/src).
 * Con el servidor en marcha no hace falta: él actualiza el calendario cada 6 h.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { transformCalendar } from '../server/src/calendar';
import { RealSource } from '../server/src/source';

const source = new RealSource();
source.http.onLog = (e) => console.log(e.status, e.url);
const { fesba, finder } = await source.calendar(2);
if (fesba.length === 0 && finder.length === 0) throw new Error('La fuente devolvió 0 filas: no se sobrescribe el calendario.');

const checkedAt = new Date().toISOString();
mkdirSync('data/badminton-es', { recursive: true });
writeFileSync('data/badminton-es/fesba-calendario.json', JSON.stringify({ meta: { fuente: 'https://www.badminton.es', extraidoEl: checkedAt }, filas: fesba }, null, 2));
writeFileSync('data/badminton-es/buscador-torneos.json', JSON.stringify({ meta: { fuente: 'https://www.badminton.es', extraidoEl: checkedAt }, filas: finder }, null, 2));
const out = transformCalendar(fesba, finder, checkedAt);
writeFileSync('src/data/calendario-oficial.json', JSON.stringify(out, null, 2) + '\n');
console.log(`FESBA ${fesba.length} · buscador ${finder.length} → ${out.tournaments.length} torneos absolutos`);
