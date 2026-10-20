const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

/** Ajustes del cliente HTTP hacia badminton.es. */
export const httpConfig = {
  baseUrl: (process.env.SOURCE_BASE_URL ?? 'https://www.badminton.es').replace(/\/$/, ''),
  userAgent:
    process.env.SCRAPER_USER_AGENT ?? 'Mozilla/5.0 (compatible; ClubBadmintonUVa/0.1; web publica del club; lectura espaciada de una lista cerrada)',
  /** Separación mínima entre peticiones: nunca por debajo de 2,5 s. */
  minIntervalMs: Math.max(2500, num(process.env.MIN_REQUEST_INTERVAL_MS, 2500)),
  timeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 20000),
};
