/**
 * Comprobación mínima de los lectores contra badminton.es: lee la ficha, la lista de cuadros, la clasificación de un grupo y
 * un día de UN torneo (5 peticiones, una cada ≥ 2,5 s). Solo imprime recuentos y datos del torneo, nunca nombres de personas.
 *
 *   npx tsx scripts/check-live.ts <GUID-del-torneo>
 */
import { httpConfig } from '../src/config-http';
import { PoliteClient } from '../src/http';
import { OfficialLiveReaders } from '../src/officialReaders';

const guid = process.argv[2];
if (!guid || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guid)) {
  console.error('Uso: npx tsx scripts/check-live.ts <GUID-del-torneo>   (el identificador aparece en la dirección del torneo en badminton.es)');
  process.exit(1);
}

const client = new PoliteClient({ baseUrl: httpConfig.baseUrl, minIntervalMs: httpConfig.minIntervalMs, timeoutMs: httpConfig.timeoutMs, userAgent: httpConfig.userAgent });
client.onLog = (e) => console.log(`  GET ${e.url.replace(httpConfig.baseUrl, '')} -> ${e.status} (${e.bytes} B, ${e.ms} ms)`);
const r = new OfficialLiveReaders(client);

const t = await r.tournament(guid, 1);
console.log('torneo:', { name: t.name, city: t.city, venue: t.venue, days: t.days, tz: t.tz });
const draws = await r.draws(guid, 1);
console.log('cuadros:', draws.length, '· grupos:', draws.filter((d) => d.type === 'roundrobin').length, '· eliminatorias:', draws.filter((d) => d.type === 'knockout').length);
const group = draws.find((d) => d.type === 'roundrobin');
if (group) {
  const s = await r.standings(guid, group.drawId, 1);
  console.log('clasificación de un grupo:', s.length, 'filas · con club publicado:', s.filter((x) => x.club).length, '· con identificador de jugador:', s.filter((x) => x.ids.length).length);
}
if (t.days[0]) {
  const rows = await r.day(guid, t.days[0], t.tz, 1);
  const byStatus = rows.reduce<Record<string, number>>((a, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
  console.log(`partidos del ${t.days[0]}:`, rows.length, byStatus, '· con hora:', rows.filter((m) => m.plannedUtc).length, '· con pista:', rows.filter((m) => m.court).length);
}
console.log('peticiones realizadas en la última hora:', client.stats().requestsLastHour);
