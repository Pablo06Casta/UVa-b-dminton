import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp, Hub } from '../src/api';
import { applyChronicles, draftChronicles, factsOf, validateChronicle } from '../src/chronicle';
import { settings } from '../src/config';
import type { PublicNews } from '../src/news';
import type { PublicState, PublicTournament } from '../src/publicView';
import { memDb } from './helpers/fakes';

const GUID = '11111111-2222-3333-4444-555555555555';
const T = {
  id: GUID, name: 'TOP Máster Absoluto', startDate: '2026-10-24', endDate: '2026-10-25', city: 'Villanueva de la Vera', uvaPlayers: ['Ana Prueba'], matches: [], draws: [], entries: [], stale: false, manual: false,
  record: { won: 7, lost: 2, gold: 1, silver: 0, bronze: 1 },
  results: [{ event: 'IM', entrant: 'Ana Prueba', place: 1, text: 'Oro', score: '21-15 21-17', done: true }, { event: 'DM', entrant: 'Ana Prueba / Luis Prueba', place: 3, text: 'Bronce', done: true }],
} as unknown as PublicTournament;
const state = { tournaments: [T] } as unknown as PublicState;
const NOW = new Date('2026-10-26T10:00:00+01:00');

const good = { title: 'Oro y bronce para la UVa en el TOP Máster Absoluto', summary: 'El club cierra el torneo con 1 oro y 1 bronce.', paragraphs: ['Ana Prueba ganó la final individual masculina por 21-15 21-17.', 'El balance fue de 7 victorias y 2 derrotas.'] };

function fakeFetch(chronicle: unknown, calls: { url: string; body: string }[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (String(url).includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(chronicle) }] }), { status: 200 });
    return new Response('{"success":"true"}', { status: 200 });
  }) as unknown as typeof fetch;
}

afterEach(() => { settings.chronicle.apiKey = ''; settings.chronicle.email = ''; settings.chronicle.baseUrl = ''; });
const enable = () => { settings.chronicle.apiKey = 'k'; settings.chronicle.email = 'jefe@example.com'; settings.chronicle.baseUrl = 'https://srv.example'; };

describe('validación del texto de la IA', () => {
  it('acepta un texto cuyas cifras salen de los datos y rechaza cifras inventadas o formatos erróneos', () => {
    const facts = factsOf(T);
    expect(validateChronicle(good, facts)).toBeTruthy();
    expect(validateChronicle({ ...good, summary: 'Ganaron 12 partidos.' }, facts)).toBeUndefined(); // 12 no está en los datos
    expect(validateChronicle({ title: 'x' }, facts)).toBeUndefined();
    expect(validateChronicle({ ...good, paragraphs: [] }, facts)).toBeUndefined();
  });

  it('a la IA solo se le dan datos públicos: sin rivales', () => {
    expect(JSON.stringify(factsOf(T))).not.toMatch(/rival|opponent/i);
  });
});

describe('borradores y aprobación', () => {
  it('sin clave no se hace nada', async () => {
    const calls: { url: string; body: string }[] = [];
    expect(await draftChronicles(memDb(), state, NOW, { fetchImpl: fakeFetch(good, calls) })).toBe(0);
    expect(calls).toEqual([]);
  });

  it('crea un borrador por torneo terminado, lo envía por correo con el enlace y no lo repite', async () => {
    enable();
    const db = memDb();
    const calls: { url: string; body: string }[] = [];
    expect(await draftChronicles(db, state, NOW, { fetchImpl: fakeFetch(good, calls) })).toBe(1);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['api.anthropic.com', 'formsubmit.co']);
    expect(calls[1].body).toContain(`https://srv.example/aprobar-cronica/${GUID}?code=`);
    expect(calls[1].body).toContain('No se publica hasta que la apruebes');
    expect(await draftChronicles(db, state, NOW, { fetchImpl: fakeFetch(good, calls) })).toBe(0);
    expect(calls).toHaveLength(2);
    expect(applyChronicles(db, [{ tournamentGuid: GUID, title: 'plantilla' } as PublicNews])[0].title).toBe('plantilla'); // borrador: aún no se publica
  });

  it('un torneo sin terminar no genera crónica, y un texto no válido de la IA se anota sin enviar correo', async () => {
    enable();
    const calls: { url: string; body: string }[] = [];
    expect(await draftChronicles(memDb(), { tournaments: [{ ...T, endDate: '2026-12-25' }] } as unknown as PublicState, NOW, { fetchImpl: fakeFetch(good, calls) })).toBe(0);
    const db = memDb();
    expect(await draftChronicles(db, state, NOW, { fetchImpl: fakeFetch({ title: 'a', summary: 'b', paragraphs: ['Ganaron 99 partidos'] }, calls) })).toBe(0);
    expect(calls.filter((c) => c.url.includes('formsubmit'))).toEqual([]);
    expect(await draftChronicles(db, state, NOW, { fetchImpl: fakeFetch(good, calls) })).toBe(0); // no insiste
  });
});

describe('página de aprobación', () => {
  const db = memDb();
  const server = http.createServer(createApp(db, undefined, new Hub(db)));
  let base = '';
  let code = '';
  beforeAll(async () => {
    enable();
    const calls: { url: string; body: string }[] = [];
    await draftChronicles(db, state, NOW, { fetchImpl: fakeFetch(good, calls) });
    code = /code=([0-9a-f]{32})/.exec(calls[1].body)![1];
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }));

  it('sin el código correcto no se ve ni se puede decidir', async () => {
    expect((await fetch(`${base}/aprobar-cronica/${GUID}?code=mal`)).status).toBe(404);
    const r = await fetch(`${base}/aprobar-cronica/${GUID}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=publish&code=mal' });
    expect(r.status).toBe(404);
    expect(applyChronicles(db, [{ tournamentGuid: GUID, title: 'plantilla' } as PublicNews])[0].title).toBe('plantilla');
  });

  it('con el código se ve el borrador y, al publicar, sustituye el texto de la noticia', async () => {
    const page = await fetch(`${base}/aprobar-cronica/${GUID}?code=${code}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Oro y bronce para la UVa');
    const r = await fetch(`${base}/aprobar-cronica/${GUID}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `action=publish&code=${code}` });
    expect(r.status).toBe(200);
    const [n] = applyChronicles(db, [{ tournamentGuid: GUID, title: 'plantilla', summary: 's' } as PublicNews]);
    expect(n).toMatchObject({ title: good.title, summary: good.summary, body: good.paragraphs });
  });
});
