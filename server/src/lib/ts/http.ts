import { config } from "@/lib/config";
import { hashString } from "@/lib/util/text";

export type Priority = 0 | 1 | 2; // 0 = directo, 1 = normal, 2 = segundo plano

export interface FetchResult {
  url: string;
  /** URL final tras redirecciones. */
  finalUrl?: string;
  status: number;
  body: string;
  hash: string;
  /** El contenido cambió respecto a la última descarga de esta URL. */
  changed: boolean;
  /** Servido desde caché sin tocar la red (por antigüedad mínima o 304). */
  fromCache: boolean;
  fetchedAt: string;
  bytes: number;
  ms: number;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = "HttpError";
  }
}

export class SourceUnavailableError extends Error {
  constructor(
    message: string,
    public retryAt?: number,
  ) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

interface CacheEntry {
  body: string;
  hash: string;
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
}

export interface RequestOptions {
  /** No volver a pedir la URL si la copia en caché tiene menos de esta antigüedad. */
  minAgeMs?: number;
  priority?: Priority;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  /** "manual" para conservar cookies que llegan en una redirección (p. ej. aviso de cookies). */
  redirect?: "follow" | "manual";
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

type Job = { priority: Priority; seq: number; run: () => Promise<void> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente HTTP prudente para la fuente oficial:
 * - una petición cada `minIntervalMs` como máximo, con cola por prioridades;
 * - deduplicación de peticiones simultáneas a la misma URL;
 * - caché con hash de contenido y peticiones condicionales si el servidor las admite;
 * - reintentos con backoff exponencial y circuit breaker ante fallos repetidos.
 */
export class TsHttpClient {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<FetchResult>>();
  private queue: Job[] = [];
  private seq = 0;
  private pumping = false;
  private lastRequestAt = 0;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private circuitOpenings = 0;
  private recent: number[] = [];
  /** Cookies de sesión por host, como haría un navegador (el buscador del ranking las necesita). */
  private cookies = new Map<string, Map<string, string>>();
  public onLog?: (e: FetchLogEntry) => void;

  constructor(
    private opts: {
      baseUrl: string;
      minIntervalMs: number;
      timeoutMs: number;
      userAgent: string;
      fetchImpl?: typeof fetch;
      maxCacheEntries?: number;
    },
  ) {}

  url(pathOrUrl: string): string {
    return pathOrUrl.startsWith("http") ? pathOrUrl : `${this.opts.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }

  stats() {
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < 3600_000);
    return {
      requestsLastHour: this.recent.length,
      consecutiveFailures: this.consecutiveFailures,
      circuitOpenUntil: this.circuitOpenUntil > now ? new Date(this.circuitOpenUntil).toISOString() : null,
      queued: this.queue.length,
    };
  }

  peek(pathOrUrl: string): CacheEntry | undefined {
    return this.cache.get(this.url(pathOrUrl));
  }

  async get(pathOrUrl: string, o: RequestOptions = {}): Promise<FetchResult> {
    const url = this.url(pathOrUrl);
    const key = `${o.method ?? "GET"} ${url} ${o.body ?? ""}`;
    const cached = this.cache.get(key);
    if (cached && o.minAgeMs && Date.now() - cached.fetchedAt < o.minAgeMs) {
      return { url, status: 200, body: cached.body, hash: cached.hash, changed: false, fromCache: true, fetchedAt: new Date(cached.fetchedAt).toISOString(), bytes: 0, ms: 0 };
    }
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = this.enqueue(o.priority ?? 1, () => this.doFetch(url, key, o)).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private enqueue<T>(priority: Priority, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ priority, seq: this.seq++, run: () => fn().then(resolve, reject) as Promise<void> });
      this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      void this.pump();
    });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const wait = this.lastRequestAt + this.opts.minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        const job = this.queue.shift()!;
        this.lastRequestAt = Date.now();
        // Se espera a que termine para no solapar peticiones contra la fuente.
        await job.run();
      }
    } finally {
      this.pumping = false;
    }
  }

  private async doFetch(url: string, key: string, o: RequestOptions): Promise<FetchResult> {
    if (Date.now() < this.circuitOpenUntil) {
      throw new SourceUnavailableError("La fuente oficial no responde; pausa temporal de consultas.", this.circuitOpenUntil);
    }
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const cached = this.cache.get(key);
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(20_000, 1500 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
        await sleep(backoff);
      }
      const t0 = Date.now();
      try {
        const headers: Record<string, string> = {
          "User-Agent": this.opts.userAgent,
          "Accept-Language": "es-ES,es;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/json,text/calendar;q=0.9,*/*;q=0.8",
          ...o.headers,
        };
        const host = new URL(url).host;
        const jar = this.cookies.get(host);
        if (jar?.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
        if (cached?.etag) headers["If-None-Match"] = cached.etag;
        if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
        const res = await fetchImpl(url, {
          method: o.method ?? "GET",
          body: o.body,
          headers,
          redirect: o.redirect ?? "follow",
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        this.recent.push(Date.now());
        this.storeCookies(host, res.headers);
        const ms = Date.now() - t0;
        if (res.status === 304 && cached) {
          cached.fetchedAt = Date.now();
          this.success();
          this.onLog?.({ at: new Date().toISOString(), url, status: 304, ms, bytes: 0, changed: false });
          return { url, status: 304, body: cached.body, hash: cached.hash, changed: false, fromCache: true, fetchedAt: new Date().toISOString(), bytes: 0, ms };
        }
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("retry-after"));
          lastErr = new HttpError(res.status, url);
          this.onLog?.({ at: new Date().toISOString(), url, status: res.status, ms, bytes: 0, changed: false, error: `HTTP ${res.status}` });
          if (ra > 0) await sleep(Math.min(ra, 120) * 1000);
          continue;
        }
        if (o.redirect === "manual" && res.status >= 300 && res.status < 400) {
          this.success();
          this.onLog?.({ at: new Date().toISOString(), url, status: res.status, ms, bytes: 0, changed: false });
          return { url, finalUrl: res.headers.get("location") ?? url, status: res.status, body: "", hash: "", changed: false, fromCache: false, fetchedAt: new Date().toISOString(), bytes: 0, ms };
        }
        if (!res.ok) {
          this.onLog?.({ at: new Date().toISOString(), url, status: res.status, ms, bytes: 0, changed: false, error: `HTTP ${res.status}` });
          // 4xx no se reintenta, pero tampoco indica caída de la fuente.
          this.success();
          throw new HttpError(res.status, url);
        }
        const body = await res.text();
        const hash = hashString(body);
        const changed = !cached || cached.hash !== hash;
        this.store(key, { body, hash, fetchedAt: Date.now(), etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined });
        this.success();
        this.onLog?.({ at: new Date().toISOString(), url, status: res.status, ms, bytes: body.length, changed });
        return { url, finalUrl: res.url || url, status: res.status, body, hash, changed, fromCache: false, fetchedAt: new Date().toISOString(), bytes: body.length, ms };
      } catch (e) {
        if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
        lastErr = e;
        if (!(e instanceof HttpError)) {
          this.onLog?.({ at: new Date().toISOString(), url, status: 0, ms: Date.now() - t0, bytes: 0, changed: false, error: String((e as Error)?.message ?? e) });
        }
      }
    }
    this.failure();
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private storeCookies(host: string, h: Headers) {
    const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
    if (!list.length) return;
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    for (const c of list) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0/i.test(a)) || attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split("=")[1]) < Date.now());
      if (expired || !value) jar.delete(name);
      else jar.set(name, value);
    }
    this.cookies.set(host, jar);
  }

  private store(key: string, e: CacheEntry) {
    this.cache.delete(key);
    this.cache.set(key, e);
    const max = this.opts.maxCacheEntries ?? 300;
    while (this.cache.size > max) this.cache.delete(this.cache.keys().next().value!);
  }

  private success() {
    this.consecutiveFailures = 0;
    this.circuitOpenings = 0;
  }

  private failure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 3) {
      const mins = Math.min(30, 2 ** this.circuitOpenings);
      this.circuitOpenings++;
      this.circuitOpenUntil = Date.now() + mins * 60_000;
      this.consecutiveFailures = 0;
    }
  }
}

export function tsClient(): TsHttpClient {
  const g = globalThis as unknown as { __tsClient?: TsHttpClient };
  if (!g.__tsClient) {
    g.__tsClient = new TsHttpClient({
      baseUrl: config.baseUrl,
      minIntervalMs: config.minRequestIntervalMs,
      timeoutMs: config.requestTimeoutMs,
      userAgent: config.userAgent,
    });
  }
  return g.__tsClient;
}
