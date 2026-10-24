import { randomBytes } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { settings } from './config';
import { todayIn } from './dates';
import { type Db, nowIso } from './db';
import type { PublicMatch, PublicState, PublicTournament } from './publicView';
import { clip, clockOf, dayLabel, esc, FONT_FILES, fit, LOGO, upper } from './share';

/**
 * Captura del itinerario en vivo («Partidos por horas» de Directo) como imagen PNG: se genera sola 15 minutos antes de que empiece
 * cada torneo con jugadores del club y se envía por correo (con el enlace a la imagen guardada, que no cambia después).
 * Solo usa los datos públicos ya filtrados (jugadores con consentimiento); no lleva rivales.
 */
const TZ = 'Europe/Madrid';
const W = 1200;
const PAD = 28;
const HOUR_W = 100;
const CARD_X = PAD + HOUR_W;
const CARD_W = W - CARD_X - PAD;

const clockMin = (iso: string) => {
  const [h, m] = clockOf(iso)!.split(':').map(Number);
  return h * 60 + m;
};
/** Hora con la que se coloca cada partido: la estimada si aún no ha empezado; si no, la programada. */
const shownAt = (m: PublicMatch): string | undefined => (m.state === 'scheduled' ? m.estimatedStart ?? m.plannedStart : m.plannedStart ?? m.estimatedStart);

const STATUS = {
  scheduled: { text: 'PROGRAMADO', bg: '#dcebf7', fg: '#174a75', bar: '#2367a0', card: '#f5f7fa' },
  live: { text: 'EN JUEGO', bg: '#2f2c64', fg: '#ffffff', bar: '#e5383b', card: '#fdeeee' },
  finished: { text: 'FINALIZADO', bg: '#e6e9f0', fg: '#5b6a8a', bar: '#2f2c64', card: '#eef0fa' },
} as const;

function sets(score?: string): [string, string][] {
  if (!score || /^(W\.O\.|Retirada)/i.test(score)) return [];
  return score.split(/\s+/).flatMap((s) => (/^\d+-\d+$/.test(s) ? [s.split('-') as [string, string]] : []));
}

export function itinerarySvg(t: PublicTournament, date: string, now: Date): string {
  const list = t.matches
    .filter((m) => m.date === date && shownAt(m))
    .sort((a, b) => shownAt(a)!.localeCompare(shownAt(b)!));
  const nowMin = clockMin(now.toISOString());
  const isToday = todayIn(TZ, now) === date;
  let y = 0;
  let body = '';
  const text = (x: number, yy: number, s: string, size: number, fill: string, weight = 700, extra = '') => `<text x="${x}" y="${yy}" font-weight="${weight}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;

  // Cabecera
  body += `<image href="${LOGO}" x="${PAD}" y="${PAD}" width="84" height="84"/>`;
  body += text(PAD + 104, PAD + 38, 'CLUB BÁDMINTON · UNIVERSIDAD DE VALLADOLID', 28, '#2367a0', 800, 'letter-spacing="3"');
  const title = upper(t.name);
  body += text(PAD + 104, PAD + 84, clip(title, W - PAD * 2 - 110, fit(title, W - PAD * 2 - 110, 46, 32)), fit(title, W - PAD * 2 - 110, 46, 32), '#14132f', 800);
  y = PAD + 84 + 56;
  body += text(PAD, y, 'PARTIDOS POR HORAS', 46, '#14132f', 800);
  const pillX = PAD + 'PARTIDOS POR HORAS'.length * 19.9 + 22;
  body += `<polygon points="${pillX + 8},${y - 34} ${pillX + 64},${y - 34} ${pillX + 56},${y - 6} ${pillX},${y - 6}" fill="#2367a0"/>${text(pillX + 32, y - 13, String(list.length), 26, '#fff', 800, 'text-anchor="middle"')}`;
  y += 34;
  body += text(PAD, y, 'Cada partido está colocado a su hora estimada; si aún no hay estimación, a la programada.', 22, '#566072', 400);
  y += 46;
  const dayText = upper(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)));
  body += text(PAD, y, dayText, 32, '#14132f', 800, 'letter-spacing="1"');
  if (isToday) {
    const tx = PAD + dayText.length * 15 + 24;
    body += `<polygon points="${tx + 10},${y - 28} ${tx + 84},${y - 28} ${tx + 74},${y} ${tx},${y}" fill="#e5383b"/>${text(tx + 42, y - 7, 'HOY', 22, '#fff', 800, 'text-anchor="middle" letter-spacing="2"')}`;
  }
  y += 22;

  if (list.length === 0) {
    body += text(PAD, y + 40, 'Aún no hay partidos con hora publicada para este día.', 28, '#566072', 400);
    y += 90;
  }

  let lastHour = -1;
  let nowDrawn = !isToday || list.length === 0;
  const nowLine = (yy: number) => `<line x1="${PAD + 4}" x2="${W - PAD}" y1="${yy}" y2="${yy}" stroke="#e5383b" stroke-width="3"/><circle cx="${PAD + 4}" cy="${yy}" r="6" fill="#e5383b"/><rect x="${W - PAD - 86}" y="${yy - 17}" width="86" height="34" rx="17" fill="#e5383b"/>${text(W - PAD - 43, yy + 8, clockOf(now.toISOString())!, 24, '#fff', 800, 'text-anchor="middle"')}`;

  for (const m of list) {
    const at = shownAt(m)!;
    const min = clockMin(at);
    if (!nowDrawn && min > nowMin) {
      body += nowLine(y + 6);
      y += 18;
      nowDrawn = true;
    }
    const st = STATUS[m.state];
    const done = m.state === 'finished';
    const ss = done ? sets(m.score) : [];
    const h = done ? (ss.length || m.score ? 124 : 96) : 92;
    const hour = Math.floor(min / 60);
    if (hour !== lastHour) {
      body += text(PAD, y + 36, `${String(hour).padStart(2, '0')}:00`, 32, '#14132f', 800);
      lastHour = hour;
    }
    const estimated = m.state === 'scheduled' && !!m.estimatedStart;
    body += `<rect x="${CARD_X}" y="${y}" width="${CARD_W}" height="${h}" fill="${st.card}"/><rect x="${CARD_X}" y="${y}" width="7" height="${h}" fill="${st.bar}"/>`;
    if (estimated) body += `<rect x="${CARD_X + 24}" y="${y + 12}" width="44" height="24" rx="3" fill="#dcebf7"/>${text(CARD_X + 46, y + 30, 'EST', 18, '#174a75', 800, 'text-anchor="middle" letter-spacing="1"')}`;
    body += text(CARD_X + 24, y + (estimated ? 70 : 52), clockOf(at)!, 44, '#2f2c64', 800);
    const nx = CARD_X + 150;
    const names = m.players.join(' / ');
    const nameSize = fit(names, CARD_W - 150 - 220, 32, 22);
    body += text(nx, y + 40, clip(names, CARD_W - 150 - 220, nameSize), nameSize, '#14132f', 800);
    body += text(nx, y + 72, clip([m.event, m.court ? `Pista ${m.court}` : ''].filter(Boolean).join(' · '), CARD_W - 150 - 220, 22), 22, '#566072', 400);
    // Etiqueta de estado a la derecha
    const cw = st.text.length * 13 + 36;
    body += `<polygon points="${CARD_X + CARD_W - cw - 14 + 10},${y + 14} ${CARD_X + CARD_W - 14},${y + 14} ${CARD_X + CARD_W - 24},${y + 14 + 32} ${CARD_X + CARD_W - cw - 14},${y + 14 + 32}" fill="${st.bg}"/>${text(CARD_X + CARD_W - 14 - cw / 2 - 2, y + 37, st.text, 22, st.fg, 800, 'text-anchor="middle" letter-spacing="2"')}`;
    if (done && (m.score || m.outcome)) {
      const word = m.outcome === 'win' ? 'VICTORIA' : m.outcome === 'loss' ? 'DERROTA' : 'FINALIZADO';
      body += text(nx, y + 108, word, 22, m.outcome === 'win' ? '#1f9d55' : m.outcome === 'loss' ? '#c0392b' : '#5b6a8a', 800, 'letter-spacing="3"');
      let bx = nx + 130;
      if (ss.length) {
        for (const [a, b] of ss) {
          body += `<rect x="${bx}" y="${y + 84}" width="48" height="34" fill="#2f2c64"/>${text(bx + 24, y + 110, a, 28, '#fff', 800, 'text-anchor="middle"')}`;
          body += `<rect x="${bx + 52}" y="${y + 84}" width="48" height="34" fill="none" stroke="#2f2c64" stroke-width="2"/>${text(bx + 76, y + 110, b, 28, '#2f2c64', 800, 'text-anchor="middle"')}`;
          bx += 116;
        }
      } else if (m.score) body += text(bx, y + 108, m.score, 26, '#2f2c64', 800);
    }
    y += h + 10;
  }
  if (!nowDrawn) {
    body += nowLine(y + 4);
    y += 20;
  }

  const stamp = `Captura del ${clockOf(now.toISOString())} · ${`${(settings.siteUrl || 'https://badmiton-uva.github.io/UVa-b-dminton').replace(/^https?:\/\//, '')}/directo`}`;
  y += 28;
  body += text(PAD, y, stamp, 22, '#566072', 400);
  const H = y + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Barlow Condensed"><rect width="${W}" height="${H}" fill="#ffffff"/><rect width="${W}" height="8" fill="#2f2c64"/>${body}</svg>`;
}

export function renderItinerary(t: PublicTournament, date: string, now: Date): Buffer {
  return new Resvg(itinerarySvg(t, date, now), { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();
}

/* ------------------------------ Envío 15 min antes ------------------------------ */

export interface ItineraryDeps {
  fetchImpl?: typeof fetch;
}

/** Hora del primer partido del día (de todo el torneo si hay orden de juego; si no, el primero del club). */
function firstStart(db: Db, t: PublicTournament, date: string): number | undefined {
  const row = db.prepare('select min(planned_utc) p from slots where tournament_guid = ? and date = ? and planned_utc is not null').get(t.id, date) as unknown as { p: string | null };
  const club = t.matches.filter((m) => m.date === date && m.plannedStart).map((m) => m.plannedStart!).sort()[0];
  const first = row.p ?? club;
  return first ? Date.parse(first) : undefined;
}

export function captureUrl(id: string) {
  return `${settings.itinerary.baseUrl}/captura/${id}.png`;
}

/**
 * Cada minuto: si falta ≤ `minutesBefore` para el primer partido del día de un torneo con jugadores del club (y no han pasado más de
 * 30 minutos), guarda la captura y la envía por correo. Una sola vez por torneo y día. Devuelve cuántas envió.
 */
export async function sendDueItineraries(db: Db, state: PublicState, now: Date, deps: ItineraryDeps = {}): Promise<number> {
  const c = settings.itinerary;
  if (!c.email || !c.baseUrl) return 0;
  const date = todayIn(TZ, now);
  let sent = 0;
  for (const t of state.tournaments) {
    if (!t.matches.some((m) => m.date === date)) continue;
    const first = firstStart(db, t, date);
    if (first === undefined) continue;
    const untilMs = first - now.getTime();
    if (untilMs > c.minutesBefore * 60_000 || untilMs < -30 * 60_000) continue;
    const key = `${t.id}|${date}`;
    if (db.prepare('select 1 from captures where day_key = ?').get(key)) continue;
    const png = renderItinerary(t, date, now);
    const id = randomBytes(12).toString('hex');
    const link = captureUrl(id);
    const when = clockOf(new Date(first).toISOString());
    const site = settings.siteUrl || 'https://badmiton-uva.github.io/UVa-b-dminton';
    const msg = `Itinerario en vivo de ${t.name} (${dayLabel(date)}): el primer partido empieza a las ${when}. La captura se ha tomado ${Math.max(0, Math.round(untilMs / 60_000))} min antes.\n\nIMAGEN (ábrela o guárdala): ${link}\n\nVer en directo: ${site}/directo`;
    const res = await (deps.fetchImpl ?? fetch)(`https://formsubmit.co/ajax/${c.email}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', origin: new URL(site).origin, referer: `${site}/contacto` },
      body: JSON.stringify({ nombre: 'Itinerario', apellidos: 'En vivo', email: c.email, mensaje: msg, _subject: 'HISTORIAS RRSS DIRECTO TORNEOS JORNADA', _template: 'table', _captcha: 'false' }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Correo del itinerario: HTTP ${res.status}`); // sin guardar: se reintenta el minuto siguiente dentro de la ventana
    db.prepare('insert into captures(id, day_key, tournament_guid, created_at, png) values(?,?,?,?,?)').run(id, key, t.id, nowIso(), png);
    sent++;
  }
  return sent;
}

export function captureImage(db: Db, id: string): Buffer | undefined {
  if (!/^[0-9a-f]{24}$/.test(id)) return undefined;
  const row = db.prepare('select png from captures where id = ?').get(id) as unknown as { png: Uint8Array } | undefined;
  return row ? Buffer.from(row.png) : undefined;
}
