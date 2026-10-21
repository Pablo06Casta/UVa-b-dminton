import { describe, expect, it } from 'vitest';
import { cardVersion, dateRange, findCard, metaOf, renderPng, shareHtmlPage, svgOf } from '../src/share';
import type { PublicMatch, PublicState, PublicTournament } from '../src/publicView';

const m = (over: Partial<PublicMatch> = {}): PublicMatch => ({ id: 'T1:d1:p1', event: 'IM · Final', players: ['Ana Prueba'], opponent: 'Rival Uno', state: 'finished', score: '21-10 21-12', outcome: 'win', court: '2', ...over });
const t = (over: Partial<PublicTournament> = {}): PublicTournament =>
  ({ id: 'T1', name: 'Torneo de Prueba & Cía', startDate: '2026-10-24', endDate: '2026-10-25', city: 'Valladolid', manual: false, uvaPlayers: ['Ana Prueba'], matches: [m()], draws: [], results: [{ event: 'IM', entrant: 'Ana Prueba', place: 1, text: 'Oro', done: true }], entries: [], stale: false, ...over }) as PublicTournament;
const state = (tt: PublicTournament): PublicState => ({ tournaments: [tt] }) as PublicState;

describe('tarjetas para compartir', () => {
  it('encuentra partidos y torneos por su identificador', () => {
    const s = state(t());
    expect(findCard(s, 'partido', 'T1:d1:p1')?.kind).toBe('partido');
    expect(findCard(s, 'torneo', 't1')?.kind).toBe('torneo');
    expect(findCard(s, 'partido', 'no')).toBeUndefined();
  });

  it('el SVG del partido lleva el «vs», el marcador y el rival (o «Rival» si no se publica), con el texto escapado', () => {
    const f = findCard(state(t()), 'partido', 'T1:d1:p1')!;
    const svg = svgOf(f, 'og');
    expect(svg).toContain('VS');
    expect(svg).toContain('21-10');
    expect(svg).toContain('21-12');
    expect(svg).toContain('RIVAL UNO');
    expect(svg).toContain('VICTORIA');
    const hidden = svgOf({ kind: 'partido', t: t(), m: m({ opponent: undefined }) }, 'og');
    expect(hidden).toContain('RIVAL');
    expect(hidden).not.toContain('RIVAL UNO');
    expect(svg).toContain('TORNEO DE PRUEBA &amp; CÍA');
  });

  it('genera PNG válidos en los tres formatos y reutiliza la caché', () => {
    const f = findCard(state(t()), 'resultados', 'T1')!;
    for (const [size, w, h] of [['og', 1200, 630], ['square', 1080, 1080], ['story', 1080, 1920]] as const) {
      const png = renderPng(f, size);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(w);
      expect(png.readUInt32BE(20)).toBe(h);
    }
    expect(renderPng(f, 'og')).toBe(renderPng(f, 'og'));
  });

  it('la versión de la imagen cambia cuando cambia el partido', () => {
    const a = cardVersion({ kind: 'partido', t: t(), m: m({ state: 'live', score: undefined, outcome: undefined }) });
    const b = cardVersion({ kind: 'partido', t: t(), m: m() });
    expect(a).not.toBe(b);
    expect(cardVersion({ kind: 'partido', t: t(), m: m() })).toBe(b);
  });

  it('títulos, descripciones y página con Open Graph', () => {
    const meta = metaOf({ kind: 'partido', t: t(), m: m() });
    expect(meta.title).toBe('Ana Prueba vs Rival Uno · Victoria 21-10 21-12');
    expect(metaOf({ kind: 'resultados', t: t() }).description).toContain('1 medalla');
    expect(dateRange('2026-10-24', '2026-10-25')).toBe('sáb 24 oct – dom 25 oct');
    const html = shareHtmlPage({ ...meta, image: 'https://x/og/partido/T1.png?v=1', target: 'https://web/directo' });
    expect(html).toContain('og:image');
    expect(html).toContain('summary_large_image');
    expect(html).toContain('url=https://web/directo');
  });
});

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll } from 'vitest';
import { createApp, Hub } from '../src/api';
import { settings } from '../src/config';
import { createPlayer } from '../src/roster';
import { memDb } from './helpers/fakes';

describe('rutas de compartir', () => {
  const db = memDb();
  const server = http.createServer(createApp(db, undefined, new Hub(db)));
  let base = '';
  const key = 'G1:d1:p1';
  beforeAll(async () => {
    settings.opponents = 'names';
    settings.siteUrl = 'https://web.example/club';
    const p = createPlayer(db, { name: 'Ana Prueba', public: true, consentBy: 'Ella', consentAt: '2026-10-01' });
    db.prepare('insert into tournaments(guid, name, start_date, end_date, city, discovered_at, info_ok_at) values(?,?,?,?,?,?,?)').run('G1', 'Torneo de Prueba', '2026-10-24', '2026-10-24', 'Valladolid', 'x', 'x');
    db.prepare('insert into tournament_players(tournament_guid, player_id) values(?,?)').run('G1', p.id);
    const stored = { key, tournamentGuid: 'G1', date: '2026-10-24', plannedClock: '09:00', plannedUtc: '2026-10-24T07:00:00Z', drawName: 'IM', eventCode: 'IM', status: 'finished', winner: 1, sets: [[21, 10], [21, 12]], sides: [{ players: [{ name: 'Ana Prueba', uva: true, rosterId: p.id }] }, { players: [{ name: 'Rival Uno', uva: false }] }] };
    db.prepare('insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values(?,?,?,?,?,?,?,?,?)').run(key, 'G1', '2026-10-24', JSON.stringify(stored), 'h', 'finished', 'x', 'x', 'x');
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('la página de compartir lleva la vista previa, la imagen con versión y la redirección a la web del club', async () => {
    const res = await fetch(`${base}/compartir/partido/${encodeURIComponent(key)}`, { headers: { 'x-forwarded-host': 'api.example', 'x-forwarded-proto': 'https' } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Ana Prueba vs Rival Uno');
    expect(html).toMatch(/og:image" content="https:\/\/api\.example\/og\/partido\/G1%3Ad1%3Ap1\.png\?v=[0-9a-f]{8}"/);
    expect(html).toContain('url=https://web.example/club/directo?partido=');
    // El enlace antiguo (sin tipo) sigue funcionando para partidos.
    expect((await fetch(`${base}/compartir/${encodeURIComponent(key)}`)).status).toBe(200);
    expect((await fetch(`${base}/compartir/torneo/G1`)).status).toBe(200);
    expect((await fetch(`${base}/compartir/partido/no-existe`)).status).toBe(404);
  });

  it('la imagen se sirve como PNG en cada formato', async () => {
    for (const [size, w] of [['og', 1200], ['square', 1080], ['story', 1080]] as const) {
      const r = await fetch(`${base}/og/partido/${encodeURIComponent(key)}.png?size=${size}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await r.arrayBuffer()).readUInt32BE(16)).toBe(w);
    }
    expect((await fetch(`${base}/og/torneo/G1.png`)).status).toBe(200);
    expect((await fetch(`${base}/og/resultados/G1.png`)).status).toBe(200);
    expect((await fetch(`${base}/og/partido/nada.png`)).status).toBe(404);
  });
});
