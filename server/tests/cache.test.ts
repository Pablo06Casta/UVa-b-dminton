import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, Hub } from '../src/api';
import { settings } from '../src/config';
import { cachedPublicState, buildPublicState, invalidatePublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import { memDb } from './helpers/fakes';

const db = memDb();
const server = http.createServer(createApp(db, undefined, new Hub(db)));
let base = '';
const admin = { Authorization: 'Bearer secreto-de-prueba', 'Content-Type': 'application/json' };

beforeAll(async () => {
  settings.adminToken = 'secreto-de-prueba';
  settings.publicCacheMs = 10_000;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  settings.publicCacheMs = 0;
  await new Promise<void>((r) => server.close(() => r()));
});

describe('estado público: caché y 304', () => {
  it('reutiliza el estado ya calculado y lo recalcula al invalidarlo', () => {
    invalidatePublicState(db);
    const a = cachedPublicState(db);
    expect(cachedPublicState(db)).toBe(a); // el mismo objeto: no se recalcula
    createPlayer(db, { name: 'Ana Prueba', public: true, consentBy: 'Ella', consentAt: '2026-10-01' });
    expect(cachedPublicState(db)).toBe(a); // aún dentro de la vigencia
    invalidatePublicState(db);
    expect(cachedPublicState(db).state.players.map((p) => p.name)).toEqual(['Ana Prueba']);
  });

  it('responde con ETag y, si no ha cambiado, 304 sin cuerpo', async () => {
    invalidatePublicState(db);
    const first = await fetch(base + '/api/public/state');
    const etag = first.headers.get('etag')!;
    expect(first.status).toBe(200);
    expect(etag).toMatch(/^"[0-9a-f]{12}"$/);
    await first.json();
    const again = await fetch(base + '/api/public/state', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
  });

  it('un cambio desde la administración se ve enseguida y cambia el ETag', async () => {
    const before = (await fetch(base + '/api/public/state')).headers.get('etag');
    const r = await fetch(base + '/api/admin/players', {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ name: 'Marta Prueba', public: true, consentBy: 'Ella', consentAt: '2026-10-02' }),
    });
    expect(r.status).toBeLessThan(300);
    const res = await fetch(base + '/api/public/state');
    const state = (await res.json()) as { players: { name: string }[] };
    expect(state.players.map((p) => p.name)).toContain('Marta Prueba');
    expect(res.headers.get('etag')).not.toBe(before);
  });
});

describe('rendimiento del estado público', () => {
  it('con 40 torneos, 3.000 partidos y 40×50 cuadros se construye en menos de 400 ms y se sirve de la caché en menos de 1 ms', () => {
    const big = memDb();
    for (let i = 0; i < 6; i++) createPlayer(big, { name: `Jugador${i} Apellido${i}`, public: true, consentBy: 'Club', consentAt: '2026-10-01' });
    const insT = big.prepare("insert into tournaments(guid, name, start_date, end_date, discovered_at, info_ok_at, draws_ok_at) values(?,?,?,?,?,?,?)");
    const link = big.prepare('insert into tournament_players(tournament_guid, player_id) values(?, ?)');
    const insM = big.prepare('insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values(?,?,?,?,?,?,?,?,?)');
    const insD = big.prepare("insert into draws(tournament_guid, draw_id, name, type, json, updated_at, has_club) values(?,?,?,?,?,?,?)");
    const standings = Array.from({ length: 4 }, (_, k) => ({ rank: k + 1, names: [`Nombre${k} Otro${k}`], ids: [k], club: 'CLUB', played: 3, won: 2, lost: 1, matches: '2-1', games: '4-2', points: '84-60', pts: 4 }));
    const rounds = [{ title: 'Ronda', matches: Array.from({ length: 16 }, () => ({ a: { names: ['A B'], ids: [1], club: 'X' }, b: { names: ['C D'], ids: [2], club: 'Y' }, winner: 1, sets: [[21, 10], [21, 12]] })) }];
    for (let t = 0; t < 40; t++) {
      const guid = `T${String(t).padStart(35, '0')}`;
      insT.run(guid, `Torneo ${t}`, '2026-10-24', '2026-10-24', '2026-10-01', '2026-10-20', '2026-10-20');
      for (let p = 1; p <= 6; p++) link.run(guid, p);
      for (let m = 0; m < 75; m++) {
        const stored = { key: `${guid}:${m}`, tournamentGuid: guid, date: '2026-10-24', plannedClock: '09:00', plannedUtc: '2026-10-24T07:00:00Z', drawName: 'IM', status: 'scheduled', sets: [], sides: [{ players: [{ name: 'Jugador0 Apellido0', uva: true, rosterId: 1 }] }, { players: [{ name: 'Rival', uva: false }] }] };
        insM.run(stored.key, guid, '2026-10-24', JSON.stringify(stored), 'h' + m, 'scheduled', 'x', 'x', 'x');
      }
      for (let d = 0; d < 50; d++) insD.run(guid, d, d % 5 === 0 ? 'IM' : `IM - Grupo ${d}`, d % 5 === 0 ? 'knockout' : 'roundrobin', JSON.stringify(d % 5 === 0 ? { rounds } : { standings, rounds }), 'x', 1);
    }
    const t0 = performance.now();
    const state = buildPublicState(big, new Date('2026-10-24T08:00:00Z'));
    const build = performance.now() - t0;
    expect(state.tournaments.length).toBe(40);
    expect(build).toBeLessThan(400);
    cachedPublicState(big);
    const t1 = performance.now();
    for (let i = 0; i < 1000; i++) cachedPublicState(big);
    expect((performance.now() - t1) / 1000).toBeLessThan(1);
  });
});
