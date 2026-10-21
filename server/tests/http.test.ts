import { describe, expect, it } from 'vitest';
import { HttpError, PoliteClient, SourceUnavailableError } from '../src/http';

/** Reloj y espera simulados: las pruebas no esperan de verdad. */
function setup(responses: (() => Response | Promise<Response>)[], opts: { minIntervalMs?: number } = {}) {
  let t = 1_000_000;
  const calls: { url: string; at: number; init?: RequestInit }[] = [];
  let i = 0;
  const client = new PoliteClient({
    baseUrl: 'https://example.test',
    minIntervalMs: opts.minIntervalMs ?? 2500,
    userAgent: 'prueba',
    now: () => t,
    sleep: async (ms) => void (t += ms),
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), at: t, init });
      const r = responses[Math.min(i++, responses.length - 1)];
      return r();
    }) as typeof fetch,
  });
  return { client, calls, advance: (ms: number) => void (t += ms) };
}
const ok = (body = 'ok', headers: Record<string, string> = {}) => () => new Response(body, { status: 200, headers });
const status = (code: number, headers: Record<string, string> = {}) => () => new Response('', { status: code, headers });

describe('cliente HTTP prudente', () => {
  it('separa las peticiones al menos el intervalo mínimo', async () => {
    const { client, calls } = setup([ok()]);
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(calls).toHaveLength(3);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(2500);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(2500);
  });

  it('atiende primero la prioridad más urgente', async () => {
    const { client, calls } = setup([ok()]);
    const order: string[] = [];
    await Promise.all([
      client.get('/primera', { priority: 2 }).then(() => order.push('primera')),
      client.get('/segundo-plano', { priority: 2 }).then(() => order.push('segundo-plano')),
      client.get('/urgente', { priority: 0 }).then(() => order.push('urgente')),
    ]);
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['primera', 'urgente', 'segundo-plano']); // la primera ya estaba en marcha
    expect(order[1]).toBe('urgente');
  });

  it('une las peticiones idénticas simultáneas en una sola', async () => {
    const { client, calls } = setup([ok()]);
    await Promise.all([client.get('/x'), client.get('/x'), client.get('/x')]);
    expect(calls).toHaveLength(1);
  });

  it('usa la caché si es más reciente que minAgeMs, y detecta cambios por huella', async () => {
    const { client, calls, advance } = setup([ok('uno'), ok('uno'), ok('dos')]);
    const a = await client.get('/x');
    expect(a.changed).toBe(true);
    const b = await client.get('/x', { minAgeMs: 60_000 });
    expect(b.fromCache).toBe(true);
    expect(calls).toHaveLength(1);
    advance(120_000);
    expect((await client.get('/x', { minAgeMs: 60_000 })).changed).toBe(false); // mismo contenido
    expect((await client.get('/x')).changed).toBe(true); // contenido distinto
  });

  it('reintenta con espera ante 503 y respeta Retry-After', async () => {
    const { client, calls } = setup([status(503, { 'retry-after': '4' }), ok('bien')]);
    const r = await client.get('/x');
    expect(r.body).toBe('bien');
    expect(calls).toHaveLength(2);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(4000);
  });

  it('un 404 no se reintenta', async () => {
    const { client, calls } = setup([status(404), ok()]);
    await expect(client.get('/x')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it('tras fallos repetidos corta durante un tiempo y no vuelve a llamar', async () => {
    const { client, calls, advance } = setup([status(500)]);
    for (let i = 0; i < 5; i++) await client.get('/x' + i).catch(() => undefined);
    const before = calls.length;
    await expect(client.get('/otra')).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(calls.length).toBe(before);
    expect(client.stats().circuitOpenUntil).not.toBeNull();
    advance(6 * 60_000);
    await expect(client.get('/otra')).rejects.not.toBeInstanceOf(SourceUnavailableError); // vuelve a intentarlo
  });

  it('conserva las cookies de sesión', async () => {
    const { client, calls } = setup([() => new Response('a', { headers: { 'set-cookie': 'sesion=abc; Path=/' } }), ok()]);
    await client.get('/uno');
    await client.get('/dos');
    expect((calls[1].init?.headers as Record<string, string>).Cookie).toBe('sesion=abc');
  });

  it('se identifica con su User-Agent', async () => {
    const { client, calls } = setup([ok()]);
    await client.get('/x');
    expect((calls[0].init?.headers as Record<string, string>)['User-Agent']).toBe('prueba');
  });
});

describe('caché acotada', () => {
  it('no crece sin límite: descarta las copias más antiguas al pasar de unos 24 MB', async () => {
    const big = 'x'.repeat(5_000_000);
    const { client } = setup([ok(big)]);
    for (let i = 0; i < 8; i++) await client.get(`/p${i}`);
    // las primeras ya no están en caché (una petición con antigüedad mínima vuelve a la red)
    const first = await client.get('/p0', { minAgeMs: 3_600_000 });
    expect(first.fromCache).toBe(false);
    const last = await client.get('/p7', { minAgeMs: 3_600_000 });
    expect(last.fromCache).toBe(true);
  });
});
