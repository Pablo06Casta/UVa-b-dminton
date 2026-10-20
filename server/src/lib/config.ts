const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

/** Configuración mínima del cliente HTTP prudente (el resto de ajustes del servidor está en ../config.ts). */
export const config = {
  baseUrl: (process.env.TS_BASE_URL ?? "https://www.badminton.es").replace(/\/$/, ""),
  userAgent:
    process.env.SCRAPER_USER_AGENT ??
    "Mozilla/5.0 (compatible; ClubBadmintonUVa/0.1; web publica del club; lectura espaciada de una lista cerrada de torneos)",
  /** Separación mínima entre dos peticiones cualesquiera a la fuente. Nunca por debajo de 2,5 s. */
  minRequestIntervalMs: Math.max(2500, num(process.env.MIN_REQUEST_INTERVAL_MS, 2500)),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 20000),
};
