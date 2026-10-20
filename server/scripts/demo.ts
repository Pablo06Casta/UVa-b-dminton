/**
 * Servidor de DEMOSTRACIÓN con datos sintéticos (nombres ficticios). No consulta badminton.es.
 *   npm run demo        → http://127.0.0.1:8787  (CORS abierto para pruebas)
 * Sirve para ver la web conectada a un servidor, con partidos en juego, próximos, resultados, cuadros y estimación.
 */
import http from 'node:http';
import webpush from 'web-push';
import { createApp, Hub } from '../src/api';
import { settings } from '../src/config';
import { openDb } from '../src/db';
import { SyncEngine } from '../src/engine';
import { createPlayer } from '../src/roster';
import { FakeSource, GUID, info, PROFILE, row, standing } from '../tests/helpers/fakes';

const keys = webpush.generateVAPIDKeys();
settings.corsOrigins = ['*'];
settings.adminToken = 'demo';
settings.officialReadEnabled = true;
settings.siteUrl = process.env.SITE_URL ?? 'http://127.0.0.1:4173';
settings.vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'https://club.example' };

const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const hhmm = (iso: string) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));

const db = openDb(':memory:');
const consent = { consentBy: 'Demostración', consentAt: '2026-10-01' };
createPlayer(db, { name: 'Ana Prueba', category: 'Absoluto', profile: PROFILE, public: true, ...consent });
createPlayer(db, { name: 'Luis Prueba', category: 'Absoluto', profile: 'BBBBBBBB-0000-0000-0000-000000000002', public: true, ...consent });
createPlayer(db, { name: 'Carla Prueba', category: 'Sub-19' }); // sin consentimiento: nunca se muestra

const src = new FakeSource();
src.infoData = info({ name: 'Torneo de demostración (datos ficticios)', startDate: today, endDate: today, days: [today], city: 'Valladolid', venue: 'Pabellón de pruebas' });
src.standingRows = [
  standing(['Ana Prueba'], [1], 'UNIVERSIDAD DE VALLADOLID'), standing(['Marta Rival'], [11], 'CLUB NORTE'),
  standing(['Luis Prueba'], [2], 'UNIVERSIDAD DE VALLADOLID'), standing(['Pedro Rival'], [12], 'CLUB SUR'),
  standing(['Carla Prueba'], [3], 'UNIVERSIDAD DE VALLADOLID'),
].map((s, i) => ({ ...s, rank: (i % 4) + 1, played: 2, won: i % 2, lost: 1 - (i % 2), matches: '1-1', games: '3-2', points: '90-80', pts: 2 }));
src.bracketRounds = [
  { title: 'Semifinales', matches: [
    { a: { names: ['Ana Prueba'], ids: [1], club: 'UNIVERSIDAD DE VALLADOLID', seed: '1' }, b: { names: ['Marta Rival'], ids: [11], club: 'CLUB NORTE' }, winner: 1, sets: [[21, 15], [21, 18]] },
    { a: { names: ['Pedro Rival'], ids: [12], club: 'CLUB SUR' }, b: { names: ['Iker Otro'], ids: [13], club: 'CLUB ESTE' }, sets: [], when: 'hoy 17:30' },
  ] },
  { title: 'Final', matches: [{ a: { names: ['Ana Prueba'], ids: [1], club: 'UNIVERSIDAD DE VALLADOLID' }, b: { names: [], ids: [], placeholder: 'Ganador semifinal 2' }, sets: [], when: 'hoy 19:00' }] },
];
src.drawList = [
  { drawId: 1, name: 'IM - Grupo A', base: 'IM', group: 'Grupo A', type: 'roundrobin' },
  { drawId: 2, name: 'IM', base: 'IM', type: 'knockout' },
];

// 60 partidos en 6 pistas: terminados, en juego y por jugar, con retraso respecto a lo programado.
const others = ['Otro Uno', 'Otro Dos', 'Otro Tres', 'Otro Cuatro'];
const rows = Array.from({ length: 60 }, (_, i) => {
  const court = String((i % 6) + 1);
  const slot = Math.floor(i / 6);
  const planned = at(-200 + slot * 30 + (i % 6));
  const done = i < 24;
  const liveNow = i >= 24 && i < 30;
  const mine = i === 7 ? [['Ana Prueba', 1]] : i === 26 ? [['Luis Prueba', 2]] : i === 38 ? [['Ana Prueba', 1], ['Luis Prueba', 2]] : i === 45 ? [['Luis Prueba', 2]] : i === 52 ? [['Ana Prueba', 1]] : [[others[i % 4], 100 + i]];
  const r = row({
    key: `demo-${i}`, court,
    names1: mine as [string, number][], names2: [[`Rival ${i}`, 300 + i]],
    status: done ? 'finished' : liveNow ? 'on_court' : 'scheduled',
    winner: done ? ((i % 3 ? 1 : 2) as 1 | 2) : undefined,
    sets: done ? [[21, 12 + (i % 8)], [21, 15 + (i % 5)]] : [],
    clock: hhmm(planned), date: today,
  });
  return { ...r, plannedUtc: planned, durationMin: done ? 22 + ((i * 7) % 25) : undefined, orderIndex: i, eventCode: i % 5 ? 'IM' : 'DM' } as typeof r;
});
src.dayRows = rows;

const engine = new SyncEngine(db, src, () => new Date(), { live: true, calendar: false });
for (let i = 0; i < 8; i++) await engine.tick(new Date(Date.now() + i * 1000));
// Un segundo ciclo confirma los cambios (la fuente real tarda dos lecturas en dar un cambio por bueno).
for (let i = 0; i < 6; i++) await engine.tick(new Date(Date.now() + 6 * 60_000 + i * 1000));

const hub = new Hub(db);
http.createServer(createApp(db, engine, hub)).listen(8787, '127.0.0.1', () => console.log('Servidor de demostración en http://127.0.0.1:8787 (GUID', GUID + ')'));
