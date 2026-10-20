import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, Hub } from '../src/api';
import { settings } from '../src/config';
import { memDb } from './helpers/fakes';

const db = memDb();
const hub = new Hub(db);
const server = http.createServer(createApp(db, undefined, hub));
let base = '';
const admin = { Authorization: 'Bearer secreto-de-prueba', 'Content-Type': 'application/json' };
const call = (path: string, init: RequestInit = {}) => fetch(base + path, init);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as any;

beforeAll(async () => {
  settings.adminToken = 'secreto-de-prueba';
  settings.corsOrigins = ['https://club.example'];
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('API', () => {
  it('health y estado público vacío', async () => {
    expect((await json(await call('/api/health'))).ok).toBe(true);
    const s = await json(await call('/api/public/state'));
    expect(s.tournaments).toEqual([]);
  });

  it('CORS solo para los orígenes autorizados', async () => {
    const ok = await call('/api/public/state', { headers: { Origin: 'https://club.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://club.example');
    const no = await call('/api/public/state', { headers: { Origin: 'https://otro.example' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('la administración exige el token', async () => {
    expect((await call('/api/admin/players')).status).toBe(401);
    expect((await call('/api/admin/players', { headers: { Authorization: 'Bearer malo' } })).status).toBe(401);
    expect((await call('/api/admin/players', { headers: admin })).status).toBe(200);
  });

  it('sin ADMIN_TOKEN la administración queda desactivada', async () => {
    settings.adminToken = '';
    expect((await call('/api/admin/players', { headers: admin })).status).toBe(403);
    settings.adminToken = 'secreto-de-prueba';
  });

  it('alta, consentimiento y borrado de un jugador', async () => {
    const bad = await call('/api/admin/players', { method: 'POST', headers: admin, body: JSON.stringify({ name: 'Ana Prueba', public: true }) });
    expect(bad.status).toBe(400);
    const created = await call('/api/admin/players', { method: 'POST', headers: admin, body: JSON.stringify({ name: 'Ana Prueba' }) });
    expect(created.status).toBe(201);
    const p = await json(created);
    expect(p.public).toBe(false);
    const upd = await call(`/api/admin/players/${p.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ public: true, consentBy: 'Ella', consentAt: '2026-10-01' }) });
    expect((await json(upd)).public).toBe(true);
    expect((await call(`/api/admin/players/${p.id}`, { method: 'DELETE', headers: admin })).status).toBe(200);
    expect((await call(`/api/admin/players/${p.id}`, { method: 'DELETE', headers: admin })).status).toBe(404);
  });

  it('la API pública no expone la lista de jugadores', async () => {
    expect((await call('/api/public/players')).status).toBe(404);
  });

  it('el flujo SSE saluda con la versión actual', async () => {
    const ctrl = new AbortController();
    const res = await call('/api/public/stream', { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: hello');
    ctrl.abort();
  });

  it('el panel de administración se sirve y no se indexa', async () => {
    const r = await call('/admin');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('noindex');
  });
});
