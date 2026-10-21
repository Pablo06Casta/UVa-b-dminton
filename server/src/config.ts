import path from 'node:path';

const num = (v: string | undefined, d: number) => (v && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const min = (name: string, d: number) => num(process.env[name], d) * 60_000;

export type OpponentPolicy = 'none' | 'names';

/** Ajustes del servidor. Todo se puede cambiar con variables de entorno (ver .env.example). */
export const settings = {
  port: num(process.env.PORT, 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  /** Token de administración. Sin él, el panel y la API de administración quedan desactivados. */
  adminToken: process.env.ADMIN_TOKEN ?? '',
  /** Orígenes autorizados a leer la API pública (la web del club). `*` solo para pruebas. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),

  /**
   * Lectura automática de badminton.es. DESACTIVADA por defecto: las rutas con inscritos, cuadros, partidos y
   * perfiles están excluidas por su robots.txt. Actívala solo con autorización de la FESBA / Federación de
   * Castilla y León (ver README, «Autorización»).
   */
  officialReadEnabled: process.env.OFFICIAL_READ_ENABLED === 'true',
  tickMs: num(process.env.TICK_MS, 5000),

  /** Frecuencias de lectura por fase del torneo (minutos). */
  intervals: {
    /** Cada cuánto se vuelven a leer TODOS los cuadros de un torneo (entre medias, solo donde juega alguien del club). */
    drawsFull: min('DRAWS_FULL_MINUTES', 360),
    discovery: min('DISCOVERY_MINUTES', 20),
    before: { info: min('BEFORE_INFO_MINUTES', 60), draws: min('BEFORE_DRAWS_MINUTES', 60), day: min('BEFORE_DAY_MINUTES', 60) },
    imminent: { info: min('IMMINENT_INFO_MINUTES', 20), draws: min('IMMINENT_DRAWS_MINUTES', 20), day: min('IMMINENT_DAY_MINUTES', 20) },
    live: { info: min('LIVE_INFO_MINUTES', 20), draws: min('LIVE_DRAWS_MINUTES', 10), day: min('LIVE_DAY_MINUTES', 15) },
    recent: { info: min('RECENT_INFO_MINUTES', 720), draws: min('RECENT_DRAWS_MINUTES', 60), day: min('RECENT_DAY_MINUTES', 180) },
  },
  /** Páginas del ranking oficial con los jugadores del club (separadas por comas). De ahí se construye la lista del club. */
  rankingUrls: (process.env.RANKING_URLS ?? [
    'https://www.badminton.es/ranking/category.aspx?id=54365&category=5939&ogid=9FC486AA-1B7C-4D65-9E14-3C75412D4773',
    'https://www.badminton.es/ranking/category.aspx?id=54365&category=5940&ogid=9FC486AA-1B7C-4D65-9E14-3C75412D4773',
    'https://www.badminton.es/ranking/category.aspx?id=54365&category=5789&ogid=9FC486AA-1B7C-4D65-9E14-3C75412D4773',
  ].join(',')).split(',').map((u) => u.trim()).filter(Boolean),
  /** Torneos que no se leen ni se muestran: se excluyen por nombre (expresión regular, sin distinguir mayúsculas). */
  excludedTournaments: new RegExp(process.env.EXCLUDED_TOURNAMENTS ?? 'liga\\s+nacional', 'i'),
  /** Torneos absolutos del calendario oficial que empiezan en los próximos N días se leen una vez para ver quién del club juega (0 = desactivado). */
  followCalendarDays: num('FOLLOW_CALENDAR_DAYS', 30),
  followRefreshMinutes: min('FOLLOW_REFRESH_MINUTES', 360),
  autoRosterHours: num('AUTO_ROSTER_HOURS', 24),
  /** «declared»: los jugadores del club encontrados quedan visibles (consentimiento declarado por la administración). «hidden»: ocultos hasta registrar su consentimiento. */
  autoRosterConsent: (process.env.AUTO_ROSTER_CONSENT === 'declared' ? 'declared' : 'hidden') as 'declared' | 'hidden',
  /** Personas del club que NO deben publicarse (sin consentimiento), separadas por «;». Se ocultan siempre, aunque ya estén en la lista. */
  hiddenPlayers: (process.env.HIDDEN_PLAYERS ?? 'Clara Campos').split(';').map((x) => x.trim()).filter(Boolean),
  /** Cuánto se reutiliza el estado público ya calculado (ms). Se descarta antes si cambia algo. 0 = sin caché. */
  publicCacheMs: num(process.env.PUBLIC_CACHE_MS, process.env.VITEST ? 0 : 10_000),
  /** Pasado este tiempo sin una lectura correcta, los datos se marcan como antiguos. */
  staleAfterMs: min('STALE_MINUTES', 45),
  /** Lecturas idénticas necesarias para confirmar un cambio de hora, pista o resultado. */
  confirmReads: 2,

  /** Dirección pública de la web del club (para los enlaces de avisos y de «compartir»). */
  siteUrl: (process.env.SITE_URL ?? '').replace(/\/$/, ''),
  /** Calendario oficial de torneos absolutos (rutas permitidas por robots.txt). Cada 6 h por defecto. */
  calendarRefreshEnabled: process.env.CALENDAR_REFRESH_ENABLED !== 'false',
  calendarHours: num(process.env.CALENDAR_HOURS, 6),
  /** Cómo se muestran en los cuadros las personas que no son jugadores públicos del club: iniciales, nombre o nada. */
  drawNames: (process.env.PUBLIC_DRAW_NAMES ?? 'initials') as 'initials' | 'full' | 'off',
  /** Avisos push (VAPID). Sin claves, los avisos quedan desactivados. */
  vapid: { publicKey: process.env.VAPID_PUBLIC_KEY ?? '', privateKey: process.env.VAPID_PRIVATE_KEY ?? '', subject: process.env.VAPID_SUBJECT ?? '' },
  defaultMatchMin: process.env.DEFAULT_MATCH_MINUTES ? num(process.env.DEFAULT_MATCH_MINUTES, 0) || undefined : undefined,
  changeoverMin: num(process.env.CHANGEOVER_MINUTES, 3),
  /** Qué se publica de los rivales: nada o su nombre. Por defecto, nada (datos de terceros, posibles menores). */
  opponents: (process.env.PUBLIC_OPPONENTS ?? 'none') as OpponentPolicy,
  /** Limita las consultas a la API pública por IP y minuto. */
  publicRatePerMinute: num(process.env.PUBLIC_RATE_PER_MINUTE, 120),
  /** Días que se conservan las entradas del registro de cambios. */
  changeLogDays: num(process.env.CHANGE_LOG_DAYS, 90),
};

/** Texto del club tal y como aparece en clasificaciones y cuadros. */
export const CLUB_PATTERN = new RegExp(process.env.CLUB_PATTERN ?? 'universidad\\s+de\\s+valladolid|\\buva\\b|univ\\.?\\s+valladolid', 'i');
