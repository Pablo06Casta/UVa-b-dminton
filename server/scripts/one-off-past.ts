/** Lectura puntual de UN torneo ya terminado (copia de la base de datos), para ver resultados reales. Uso: tsx scripts/one-off-past.ts <club.sqlite> <GUID> <YYYY-MM-DD fin+1> */
import { openDb } from '../src/db';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { httpConfig } from '../src/config-http';
import { PoliteClient } from '../src/http';
import { OfficialLiveReaders } from '../src/officialReaders';
import { RealSource } from '../src/source';

const [file, guid, day] = process.argv.slice(2);
settings.officialReadEnabled = true;
const db = openDb(file);
db.prepare('update tournaments set hidden = 1 where guid <> ?').run(guid);
const client = new PoliteClient({ baseUrl: httpConfig.baseUrl, minIntervalMs: httpConfig.minIntervalMs, timeoutMs: httpConfig.timeoutMs, userAgent: httpConfig.userAgent });
const engine = new SyncEngine(db, new RealSource(client, new OfficialLiveReaders(client)), () => new Date(`${day}T10:00:00+02:00`), { live: true, calendar: false });
for (let i = 0; i < 120; i++) {
  const k = await engine.tick(new Date(new Date(`${day}T10:00:00+02:00`).getTime() + i * 60_000));
  if (k) console.log(k.slice(0, 40));
  if (!k && i > 5) break;
}
console.log('partidos de la UVa guardados:', db.prepare('select count(*) n from matches').get());
