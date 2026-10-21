/**
 * Recoge datos ANÓNIMOS de torneos terminados para calibrar y probar la estimación: hora programada, pista, prueba, duración y estado.
 * No guarda nombres de personas. Una petición cada ≥ 2,5 s.
 *   npx tsx scripts/harvest-matches.ts salida.json GUID [GUID…]
 */
import fs from 'node:fs';
import { httpConfig } from '../src/config-http';
import { PoliteClient } from '../src/http';
import { OfficialLiveReaders } from '../src/officialReaders';

const [out, ...guids] = process.argv.slice(2);
if (!out || guids.length === 0) {
  console.error('Uso: npx tsx scripts/harvest-matches.ts salida.json GUID [GUID…]');
  process.exit(1);
}
const client = new PoliteClient({ baseUrl: httpConfig.baseUrl, minIntervalMs: httpConfig.minIntervalMs, timeoutMs: httpConfig.timeoutMs, userAgent: httpConfig.userAgent });
const r = new OfficialLiveReaders(client);
const hhmm = (c?: string) => (c ? Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5)) : undefined);

const days: unknown[] = [];
for (const [i, guid] of guids.entries()) {
  try {
    const t = await r.tournament(guid, 1);
    for (const date of t.days) {
      const rows = await r.day(guid, date, t.tz, 1);
      days.push({
        id: `T${i + 1}`,
        date,
        slots: rows.map((m, k) => ({
          order: k,
          event: m.eventCode,
          phase: /grupo|group/i.test(m.round ?? '') ? 'group' : 'ko',
          plannedMin: hhmm(m.plannedClock),
          court: m.court,
          durationMin: m.durationMin,
          status: m.status,
          doubles: m.team1.players.length > 1,
        })),
      });
      console.log(`T${i + 1} ${date}: ${rows.length} partidos`);
    }
  } catch (e) {
    console.error(`T${i + 1} falló:`, (e as Error).message);
  }
}
fs.writeFileSync(out, JSON.stringify({ source: 'badminton.es (datos anónimos de torneos terminados)', days }, null, 0));
console.log('guardado', out);
