import http from 'node:http';
import path from 'node:path';
import { createApp, Hub } from './api';
import { settings } from './config';
import { openDb } from './db';
import { SyncEngine } from './engine';
import { notifyUpcoming, realSender } from './push';
import { RealSource } from './source';
import { httpConfig } from './config-http';

const db = openDb(path.join(settings.dataDir, 'club.sqlite'));
const hub = new Hub(db);

const source = new RealSource();
if (settings.officialReadEnabled && !source.hasLiveReaders) {
  console.error('OFFICIAL_READ_ENABLED=true, pero los lectores de las páginas de torneo no están implementados: la lectura en directo no se activa.');
}
const features = { live: settings.officialReadEnabled && source.hasLiveReaders, calendar: settings.calendarRefreshEnabled };
let engine: SyncEngine | undefined;
if (features.live || features.calendar) {
  source.http.onLog = (e) =>
    db.prepare('insert into fetch_log(at, url, status, ms, bytes, changed, error) values(?,?,?,?,?,?,?)').run(e.at, e.url, e.status, e.ms, e.bytes, +e.changed, e.error ?? null);
  engine = new SyncEngine(db, source, () => new Date(), features);
}
console.log(
  features.live
    ? 'Lectura EN DIRECTO de badminton.es ACTIVADA (≥2,5 s entre peticiones). Asegúrate de contar con autorización.'
    : 'Lectura en directo DESACTIVADA (OFFICIAL_READ_ENABLED no es "true"): sin partidos ni cuadros automáticos.',
);
console.log(features.calendar ? `Calendario oficial: se actualiza cada ${settings.calendarHours} h (rutas permitidas por robots.txt).` : 'Calendario oficial: actualización desactivada.');
if (!settings.adminToken) console.warn('ADMIN_TOKEN sin definir: el panel de administración está desactivado.');

const sender = realSender();
console.log(sender ? 'Avisos push: activados.' : 'Avisos push: desactivados (faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT).');

const server = http.createServer(createApp(db, engine, hub));
server.listen(settings.port, () => console.log(`Servidor del club en http://localhost:${settings.port}`));

let stopping = false;
const loop = async () => {
  if (stopping) return;
  try {
    if (engine && (await engine.tick())) {
      hub.check();
      if (sender) await notifyUpcoming(db, new Date(), sender);
    }
  } catch (e) {
    console.error('tick', e);
  }
  setTimeout(loop, settings.tickMs);
};
if (engine) loop();

setInterval(() => hub.heartbeat(), 25_000).unref();
setInterval(() => engine?.prune(), 24 * 3600_000).unref();
// Los avisos dependen de la hora: se comprueban cada minuto con lo ya guardado (sin pedir nada a badminton.es).
if (sender) setInterval(() => void notifyUpcoming(db, new Date(), sender).catch((e) => console.error('push', e)), 60_000).unref();

const shutdown = () => {
  stopping = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
