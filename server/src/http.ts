import { hashString } from './text';

export type Priority = 0 | 1 | 2; // 0 = jornada en curso, 1 = normal, 2 = segundo plano

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = 'HttpError';
  }
}

/** La fuente falla de forma repetida: se hace una pausa antes de volver a intentarlo. */
export class SourceUnavailableError extends Error {
  constructor(
    message: string,
    public retryAt?: number,
  ) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

export interface FetchResult {
  url: string;
  /** Dirección final tras las redirecciones (la fuente redirige algunas páginas clásicas a la interfaz nueva). */
  finalUrl?: string;
  status: number;
  body: string;
  hash: string;
  /** El contenido cambió respecto a la última descarga de esta dirección. */
  changed: boolean;
  fromCache: boolean;
  fetchedAt: string;
  bytes: number;
  ms: number;
}

export interface RequestOptions {
  priority?: Priority;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** No volver a pedir si la copia en caché es más reciente que esto. */
  minAgeMs?: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Separación mínima entre dos peticiones cualesquiera. */
  minIntervalMs: number;
  timeoutMs?: number;
  userAgent: string;
  fetchImpl?: typeof fetch;
  /** Para pruebas. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchLogEntry {
  at: string;
  url: string;
  status: number;
  ms: number;
  bytes: number;
  changed: boolean;
  error?: string;
}

interface CacheEntry {
  body: string;
  hash: string;
  fetchedAt: number;
}

interface Job {
  priority: Priority;
  seq: number;
  run: () => Promise<void>;
}

const MAX_ATTEMPTS = 3;
const BREAKER_THRESHOLD = 5;
const MAX_CACHE_BYTES = 24_000_000;

/**
 * Cliente HTTP prudente:
 *  - una sola petición cada `minIntervalMs`, con cola por prioridades;
 *  - peticiones idénticas simultáneas se unen en una;
 *  - caché con huella del contenido (para detectar cambios) y antigüedad mínima configurable;
 *  - reintentos con espera creciente ante 429/5xx/red, respetando `Retry-After`;
 *  - corte temporal («circuit breaker») tras fallos repetidos.
 */
export class PoliteClient {
  private queue: Job[] = [];
  private seq = 0;
  private pumping = false;
  private lastAt = 0;
  private cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  private inflight = new Map<string, Promise<FetchResult>>();
  private cookies = new Map<string, Map<string, string>>();
  private failures = 0;
  private openUntil = 0;
  private openings = 0;
  private recent: number[] = [];
  onLog?: (e: FetchLogEntry) => void;

  constructor(private o: HttpClientOptions) {}

  private sleep = (ms: number) => (this.o.sleep ?? ((n: number) => new Promise<void>((r) => setTimeout(r, n))))(ms);
  private now = () => (this.o.now ?? Date.now)();

  url(path: string) {
    return path.startsWith('http') ? path : `${this.o.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  stats() {
    const t = this.now();
    this.recent = this.recent.filter((x) => t - x < 3_600_000);
    return { requestsLastHour: this.recent.length, consecutiveFailures: this.failures, circuitOpenUntil: this.openUntil > t ? new Date(this.openUntil).toISOString() : null, queued: this.queue.length };
  }

  get(path: string, o: RequestOptions = {}): Promise<FetchResult> {
    const url = this.url(path);
    const key = `${o.method ?? 'GET'} ${url} ${o.body ?? ''}`;
    const cached = this.cache.get(key);
    if (cached && o.minAgeMs && this.now() - cached.fetchedAt < o.minAgeMs) {
      return Promise.resolve({ url, status: 200, body: cached.body, hash: cached.hash, changed: false, fromCache: true, fetchedAt: new Date(cached.fetchedAt).toISOString(), bytes: 0, ms: 0 });
    }
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = new Promise<FetchResult>((resolve, reject) => {
      this.queue.push({
        priority: o.priority ?? 1,
        seq: this.seq++,
        run: () => this.doFetch(url, key, o).then(resolve, reject),
      });
      void this.pump();
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
        const job = this.queue.shift()!;
        const wait = this.lastAt + this.o.minIntervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
        this.lastAt = this.now();
        await job.run();
      }
    } finally {
      this.pumping = false;
    }
  }

  private async doFetch(url: string, key: string, o: RequestOptions): Promise<FetchResult> {
    if (this.now() < this.openUntil) throw new SourceUnavailableError('La fuente no responde: pausa temporal de consultas.', this.openUntil);
    const fetchImpl = this.o.fetchImpl ?? fetch;
    const prev = this.cache.get(key);
    let last: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(20_000, 1500 * 2 ** (attempt - 1)));
      const t0 = this.now();
      try {
        const host = new URL(url).host;
        const jar = this.cookies.get(host);
        const res = await fetchImpl(url, {
          method: o.method ?? 'GET',
          body: o.body,
          headers: {
            'User-Agent': this.o.userAgent,
            'Accept-Language': 'es-ES,es;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            ...(jar?.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
            ...o.headers,
          },
          signal: AbortSignal.timeout(this.o.timeoutMs ?? 20_000),
        });
        this.recent.push(this.now());
        this.storeCookies(host, res.headers);
        const ms = this.now() - t0;

        if (res.status === 429 || res.status >= 500) {
          last = new HttpError(res.status, url);
          this.log({ at: new Date().toISOString(), url, status: res.status, ms, bytes: 0, changed: false, error: `HTTP ${res.status}` });
          const retryAfter = Number(res.headers.get('retry-after'));
          if (retryAfter > 0) await this.sleep(Math.min(retryAfter, 120) * 1000);
          continue;
        }
        const body = await res.text();
        if (res.status >= 400) {
          this.log({ at: new Date().toISOString(), url, status: res.status, ms, bytes: body.length, changed: false, error: `HTTP ${res.status}` });
          throw new HttpError(res.status, url); // 4xx (salvo 429): no se reintenta
        }
        const hash = hashString(body);
        const changed = !prev || prev.hash !== hash;
        this.remember(key, { body, hash, fetchedAt: this.now() });
        this.failures = 0;
        this.openings = 0;
        this.log({ at: new Date().toISOString(), url, status: res.status, ms, bytes: body.length, changed });
        return { url, finalUrl: res.url || url, status: res.status, body, hash, changed, fromCache: false, fetchedAt: new Date().toISOString(), bytes: body.length, ms };
      } catch (e) {
        if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
        last = e;
      }
    }

    this.failures++;
    if (this.failures >= BREAKER_THRESHOLD) {
      this.openings++;
      this.openUntil = this.now() + Math.min(30 * 60_000, 5 * 60_000 * 2 ** (this.openings - 1));
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  /** Guarda la copia más reciente de cada dirección, sin pasar de ~24 MB en total (se descartan las más antiguas). */
  private remember(key: string, e: CacheEntry) {
    this.cache.delete(key);
    this.cache.set(key, e);
    this.cacheBytes = 0;
    for (const v of this.cache.values()) this.cacheBytes += v.body.length;
    for (const k of this.cache.keys()) {
      if (this.cacheBytes <= MAX_CACHE_BYTES || this.cache.size <= 1) break;
      this.cacheBytes -= this.cache.get(k)!.body.length;
      this.cache.delete(k);
    }
  }

  private storeCookies(host: string, headers: Headers) {
    const list = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    if (list.length === 0) return;
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    for (const c of list) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    this.cookies.set(host, jar);
  }

  private log(e: FetchLogEntry) {
    this.onLog?.(e);
  }
}
