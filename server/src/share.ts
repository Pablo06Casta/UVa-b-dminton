import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { eventName } from './news';
import type { PublicMatch, PublicState, PublicTournament } from './publicView';

/**
 * Tarjetas para compartir (partido, torneo, resultados) como imagen PNG y como página con etiquetas Open Graph.
 * Todo sale de los datos públicos ya filtrados (jugadores con consentimiento). Rivales: en el partido, solo si PUBLIC_OPPONENTS=names;
 * en la imagen del torneo, con nombre y primer apellido (ver `shareRivals.ts`), salvo SHARE_RIVAL_NAMES=off o categorías de menores.
 */
export type CardKind = 'partido' | 'torneo' | 'resultados';
export type CardSize = 'og' | 'square' | 'story';

export const SIZES: Record<CardSize, { w: number; h: number }> = { og: { w: 1200, h: 630 }, square: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 } };

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts');
export const FONT_FILES = ['BarlowCondensed_700Bold.ttf', 'BarlowCondensed_800ExtraBold.ttf'].map((f) => path.join(FONT_DIR, f));

/** Logotipo oficial de la UVa (el mismo de la web), incrustado en las tarjetas. */
export const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'logo-uva.png')).toString('base64')}`;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const upper = (s: string) => s.toLocaleUpperCase('es-ES');

/** Tamaño de letra para que `text` quepa en `maxW` (ancho medio de la tipografía condensada ≈ 0,44 em en mayúsculas). */
export const fit = (text: string, maxW: number, max: number, min = 26) => Math.max(min, Math.min(max, Math.floor(maxW / (Math.max(1, text.length) * 0.46))));
export const clip = (text: string, maxW: number, size: number) => {
  const n = Math.floor(maxW / (size * 0.46));
  return text.length > n ? `${text.slice(0, Math.max(1, n - 1)).trimEnd()}…` : text;
};
export const wrap = (text: string, maxChars: number, lines = 2): string[] => {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const rest = out.slice(lines - 1).join(' ');
    return [...out.slice(0, lines - 1), rest.length > maxChars ? `${rest.slice(0, maxChars - 1).trimEnd()}…` : rest];
  }
  return out;
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function dayLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export const clockOf = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : undefined);
export const dateRange = (a?: string, b?: string) => (a && b && a !== b ? `${dayLabel(a)} – ${dayLabel(b)}` : dayLabel(a));

type Chip = { text: string; color: string; fg?: string };

/* ----------------------------- Fondo y marco ----------------------------- */

function frame(w: number, h: number, chip: Chip | undefined, body: string): string {
  const vertical = h > w * 0.8;
  const tile = vertical ? 96 : 76;
  const pad = vertical ? 64 : 56;
  const nameSize = vertical ? 48 : 38;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Barlow Condensed">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14132f"/><stop offset="1" stop-color="#2f2c64"/></linearGradient>
  <pattern id="court" width="${Math.round(w * 0.9)}" height="${Math.round(w * 0.45)}" patternUnits="userSpaceOnUse">
    <g fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"><rect x="20" y="20" width="${Math.round(w * 0.9) - 40}" height="${Math.round(w * 0.45) - 40}"/><path d="M20 ${Math.round(w * 0.06)}H${Math.round(w * 0.9) - 20}M${Math.round(w * 0.45)} 20V${Math.round(w * 0.45) - 20}"/></g>
  </pattern>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<rect x="${w * 0.35}" y="${h * 0.45}" width="${w * 0.8}" height="${h * 0.7}" fill="url(#court)" transform="rotate(-8 ${w * 0.7} ${h * 0.8})"/>
<polygon points="${w * 0.66},0 ${w * 0.8},0 ${w * 0.56},${h} ${w * 0.42},${h}" fill="#2367a0" fill-opacity=".14"/>
<polygon points="${w - 64},0 ${w - 30},0 ${w - 118},${h} ${w - 152},${h}" fill="#f2c230" fill-opacity=".9"/>
<rect x="0" y="${h - 14}" width="${w}" height="14" fill="#f2c230"/>
<g transform="translate(${pad} ${pad})">
  <clipPath id="logo"><rect width="${tile}" height="${tile}" rx="8"/></clipPath>
  <image href="${LOGO}" width="${tile}" height="${tile}" clip-path="url(#logo)"/>
  <rect width="${tile}" height="${tile}" rx="8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>
  <text x="${tile + 20}" y="${tile * 0.48}" font-weight="800" font-size="${nameSize}" fill="#fff" letter-spacing="1.5">CLUB BÁDMINTON</text>
  <text x="${tile + 20}" y="${tile * 0.88}" font-weight="700" font-size="${nameSize * 0.55}" fill="#c4dcf3" letter-spacing="4">UNIVERSIDAD DE VALLADOLID</text>
</g>
${chip ? chipSvg(w - pad, pad + (vertical ? 20 : 8), chip, vertical ? 1.25 : 1) : ''}
${body}
</svg>`;
}

/** Etiqueta inclinada (paralelogramo) alineada a la derecha en x. */
function chipSvg(xRight: number, y: number, c: Chip, k = 1): string {
  const size = 34 * k;
  const wTxt = c.text.length * size * 0.5 + 40 * k;
  const h = size * 1.5;
  const x = xRight - wTxt;
  return `<g transform="translate(${x} ${y})"><polygon points="${14 * k},0 ${wTxt},0 ${wTxt - 14 * k},${h} 0,${h}" fill="${c.color}"/><text x="${wTxt / 2}" y="${h * 0.72}" text-anchor="middle" font-weight="800" font-size="${size}" letter-spacing="3" fill="${c.fg ?? '#fff'}">${esc(c.text)}</text></g>`;
}

/* ------------------------------- Partido -------------------------------- */

const CHIP = { live: { text: 'EN JUEGO', color: '#e5383b' }, next: { text: 'PRÓXIMO PARTIDO', color: '#2367a0' }, done: { text: 'FINALIZADO', color: '#5b6a8a' }, win: { text: 'VICTORIA', color: '#1f9d55' }, loss: { text: 'DERROTA', color: '#c0392b' }, tour: { text: 'TORNEO', color: '#2367a0' }, res: { text: 'RESULTADOS', color: '#f2c230', fg: '#1a1400' } } as const;

export function matchSvg(t: PublicTournament, m: PublicMatch, size: CardSize): string {
  const { w, h } = SIZES[size];
  const vertical = size !== 'og';
  const us = m.players.join(' / ') || 'Club UVa';
  const them = m.opponent ?? 'Rival';
  const chip: Chip = m.state === 'live' ? CHIP.live : m.state === 'finished' ? (m.outcome === 'win' ? CHIP.win : m.outcome === 'loss' ? CHIP.loss : CHIP.done) : CHIP.next;
  const sets = (m.score ?? '').split(/\s+/).filter(Boolean);
  const when = m.state === 'finished' ? '' : upper([dayLabel(m.date), m.estimatedStart ? `${clockOf(m.estimatedStart)} EST` : m.time].filter(Boolean).join('  ·  '));
  const meta = [m.event ? eventName(m.event.split(' · ')[0]) : '', m.court ? `Pista ${m.court}` : ''].filter(Boolean).join('  ·  ');
  const tname = clip(upper(t.name), w - 112, 34);
  let body: string;
  if (!vertical) {
    const nameMax = 440;
    const a = upper(us);
    const b = upper(them);
    const sa = fit(a, nameMax, 78, 40);
    const sb = fit(b, nameMax, 78, 40);
    const bigText = m.state === 'finished' ? (sets.length ? sets.join('   ') : '—') : when || 'POR CONFIRMAR';
    const bigSize = m.state === 'finished' ? fit(bigText, w - 160, 120, 60) : fit(bigText, w - 160, 84, 44);
    body = `
<text x="${w / 2 - 92}" y="270" text-anchor="end" font-weight="800" font-size="${sa}" fill="#fff">${esc(clip(a, nameMax, sa))}</text>
<g transform="translate(${w / 2} 232)"><polygon points="-52,-44 62,-44 44,36 -70,36" fill="#f2c230"/><text x="-4" y="14" text-anchor="middle" font-weight="800" font-size="56" fill="#1a1400">VS</text></g>
<text x="${w / 2 + 92}" y="270" font-weight="800" font-size="${sb}" fill="${m.opponent ? '#fff' : '#c4dcf3'}">${esc(clip(b, nameMax, sb))}</text>
<text x="${w / 2}" y="${m.state === 'finished' ? 410 : 400}" text-anchor="middle" font-weight="800" font-size="${bigSize}" fill="${m.state === 'finished' ? '#f2c230' : '#fff'}" letter-spacing="2">${esc(bigText)}</text>
<text x="${w / 2}" y="470" text-anchor="middle" font-weight="700" font-size="34" fill="#c4dcf3" letter-spacing="3">${esc(upper(meta))}</text>
<text x="56" y="${h - 48}" font-weight="700" font-size="34" fill="#fff" letter-spacing="2">${esc(tname)}</text>`;
  } else {
    const cx = w / 2;
    const top = size === 'story' ? 560 : 330;
    const gap = size === 'story' ? 1 : 0.8;
    const nameMax = w - 140;
    const a = upper(us);
    const b = upper(them);
    const sa = fit(a, nameMax, 110, 48);
    const sb = fit(b, nameMax, 110, 48);
    const bigText = m.state === 'finished' ? (sets.length ? sets.join('  ') : '—') : when || 'POR CONFIRMAR';
    const bigSize = fit(bigText, w - 120, m.state === 'finished' ? 130 : 90, 50);
    body = `
<text x="${cx}" y="${top}" text-anchor="middle" font-weight="800" font-size="${sa}" fill="#fff">${esc(clip(a, nameMax, sa))}</text>
<g transform="translate(${cx} ${top + 120 * gap})"><polygon points="-64,-52 76,-52 54,44 -86,44" fill="#f2c230"/><text x="-5" y="18" text-anchor="middle" font-weight="800" font-size="68" fill="#1a1400">VS</text></g>
<text x="${cx}" y="${top + 290 * gap}" text-anchor="middle" font-weight="800" font-size="${sb}" fill="${m.opponent ? '#fff' : '#c4dcf3'}">${esc(clip(b, nameMax, sb))}</text>
<text x="${cx}" y="${top + 470 * gap}" text-anchor="middle" font-weight="800" font-size="${bigSize}" fill="${m.state === 'finished' ? '#f2c230' : '#fff'}" letter-spacing="2">${esc(bigText)}</text>
<text x="${cx}" y="${top + 560 * gap}" text-anchor="middle" font-weight="700" font-size="40" fill="#c4dcf3" letter-spacing="3">${esc(clip(upper(meta), w - 120, 40))}</text>
<text x="${cx}" y="${h - 70}" text-anchor="middle" font-weight="700" font-size="36" fill="#fff" letter-spacing="2">${esc(clip(upper(t.name), w - 260, 36))}</text>`;
  }
  return frame(w, h, chip, body);
}

/* ----------------------------- Torneo y resultados ----------------------------- */

const MEDAL_COLOR = { 1: '#f2c230', 2: '#dfe5ee', 3: '#e39a58' } as const;
const MEDAL_WORD = { 1: 'ORO', 2: 'PLATA', 3: 'BRONCE' } as const;

function titleBlock(t: PublicTournament, w: number, x: number, y: number, vertical: boolean): { svg: string; bottom: number } {
  const size = vertical ? 84 : 58;
  const lines = wrap(upper(t.name), Math.floor((w - 2 * x) / (size * 0.44)), vertical ? 3 : 2);
  const svg = lines.map((l, i) => `<text x="${x}" y="${y + i * size * 0.95}" font-weight="800" font-size="${size}" fill="#fff">${esc(l)}</text>`).join('');
  const sub = [dateRange(t.startDate, t.endDate), t.city].filter(Boolean).join('  ·  ');
  const sy = y + lines.length * size * 0.95 + 10;
  return { svg: svg + `<text x="${x}" y="${sy}" font-weight="700" font-size="${vertical ? 40 : 32}" fill="#c4dcf3" letter-spacing="3">${esc(upper(sub))}</text>`, bottom: sy };
}


/* ------------------------- Podio (resultados con medallas) ------------------------- */

/** Pelota de bádminton (volante) dibujada con formas simples, centrada en (0,0) y apuntando a la izquierda. */
const SHUTTLE = `<g><ellipse cx="0" cy="0" rx="34" ry="30" fill="#f4f1e8" stroke="#cfd6e2" stroke-width="2"/><path d="M30 -22 L150 -60 L150 60 L30 22 Z" fill="#fbfbf7" stroke="#cfd6e2" stroke-width="2"/><path d="M60 -30V30M90 -42V42M120 -52V52" stroke="#cfd6e2" stroke-width="3"/><rect x="26" y="-30" width="10" height="60" fill="#1f7a4d"/></g>`;

/** Fondo de pabellón: azul noche con luces desenfocadas, red al fondo y suelo azul con líneas de pista. Se dibuja en 1080×1350. */
const COURT_BG = `<defs>
  <linearGradient id="bgNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset=".45" stop-color="#172a5a"/><stop offset="1" stop-color="#0d1a3d"/></linearGradient>
  <linearGradient id="bgFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5ba5"/><stop offset="1" stop-color="#16346c"/></linearGradient>
  <filter id="blurL" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="blurS" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
  <pattern id="netMesh" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M0 0L26 26M26 0L0 26" stroke="#9fb6e8" stroke-opacity=".28" stroke-width="2"/></pattern>
</defs>
<rect width="1080" height="1350" fill="url(#bgNight)"/>
<g filter="url(#blurL)"><rect x="620" y="40" width="360" height="70" fill="#dbe6ff" fill-opacity=".55"/><rect x="60" y="120" width="260" height="46" fill="#9db6f5" fill-opacity=".25"/><rect x="760" y="300" width="300" height="60" fill="#b9ccff" fill-opacity=".28"/><rect x="-40" y="420" width="260" height="400" fill="#3c64b8" fill-opacity=".3"/></g>
<g filter="url(#blurS)"><rect x="0" y="440" width="1080" height="150" fill="url(#netMesh)"/><rect x="0" y="436" width="1080" height="12" fill="#e9efff" fill-opacity=".55"/><rect x="0" y="446" width="14" height="420" fill="#0a1226"/><rect x="1060" y="446" width="20" height="420" fill="#0a1226"/></g>
<path d="M0 840H1080V1350H0Z" fill="url(#bgFloor)"/>
<g stroke="#fff" stroke-opacity=".5" stroke-width="5" filter="url(#blurS)"><path d="M-100 1010L1180 930M-100 1230L1180 1150M120 840L-260 1350M700 840L1080 1350"/></g>
<rect width="1080" height="1350" fill="#06102b" fill-opacity=".38"/>`;

const PANEL = {
  1: { grad: ['#f6d65c', '#d9a514'], word: 'ORO', ink: '#1a1400', ring: '#f2c230' },
  2: { grad: ['#eef1f6', '#b9c1ce'], word: 'PLATA', ink: '#14203f', ring: '#dfe5ee' },
  3: { grad: ['#e9a56d', '#b87142'], word: 'BRONCE', ink: '#2b1405', ring: '#e39a58' },
} as const;

/** Medalla pequeña (cinta + disco) centrada en (cx, cy). */
const medalIcon = (cx: number, cy: number, r: number, fill: string, ink: string, ribbon = false) =>
  `<g>${ribbon ? `<polygon points="${cx - r * 0.8},${cy - r * 0.95} ${cx - r * 0.15},${cy - r * 0.95} ${cx + r * 0.2},${cy} ${cx - r * 0.6},${cy}" fill="#2f4ea5"/><polygon points="${cx + r * 0.8},${cy - r * 0.95} ${cx + r * 0.15},${cy - r * 0.95} ${cx - r * 0.2},${cy} ${cx + r * 0.6},${cy}" fill="#1f356f"/>` : ''}<circle cx="${cx}" cy="${cy + r * 0.3}" r="${r}" fill="${fill}" stroke="${ink}" stroke-opacity=".5" stroke-width="2"/><circle cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.62}" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="2"/></g>`;

const INITIALS = /^(?:\p{Lu}\.\s?)+$/u;

/**
 * Tarjeta «Medallas confirmadas»: fondo de pabellón, titular, un panel por tipo de medalla con la prueba, quién y el marcador de la final,
 * y el total. Se dibuja en 1080×1350 y se escala (centrada) para cuadrado o vertical. Si hay muchas medallas, las filas se comprimen
 * y, si aun así no caben, se resume el resto («+N medallas más»).
 */
export function podiumSvg(t: PublicTournament, size: CardSize): string {
  const { w, h } = SIZES[size];
  const k = Math.min(w / 1080, h / 1350);
  const ox = (w - 1080 * k) / 2;
  const oy = (h - 1350 * k) / 2;
  const medals = t.results.filter((r) => r.place);
  const club = new Set(t.uvaPlayers.map((n) => n.toLowerCase()));

  // Filas: quién gana (personas del club) y, si la pareja es de otro club, «con …» en una segunda línea.
  interface Row { place: 1 | 2 | 3; event: string; lines: string[]; with?: string; detail?: string }
  const rows: Row[] = medals.sort((a, b) => a.place! - b.place!).map((r) => {
    const parts = r.entrant.split(/\s+\/\s+/);
    const own = club.size ? parts.filter((p) => club.has(p.toLowerCase())) : parts.filter((p) => !INITIALS.test(p) && !/^Jugador\/a UVa$/i.test(p));
    const other = parts.filter((p) => !own.includes(p) && !/^Jugador\/a UVa$/i.test(p));
    const lines = own.length ? own : parts;
    return {
      place: r.place!,
      event: r.event.toUpperCase(),
      lines,
      with: own.length && other.length ? other.join(' / ') : undefined,
      detail: r.score ? `${r.place === 3 ? 'Semifinal' : 'Final'}:  ${r.score.replace(/\s+/g, '  ·  ')}` : r.place === 3 ? 'Semifinal' : undefined,
    };
  });

  // Reparto de altura: cabecera de cada panel 70, filas de 64 (80 si son dos líneas), huecos de 22.
  const rowH = (r: Row, f: number) => (r.lines.length > 1 || r.with ? 84 : 62) * f;
  const top = 530;
  const bottom = 1200;
  const avail = bottom - top;
  const need = (list: Row[], f: number) => {
    const places = [...new Set(list.map((r) => r.place))];
    return places.length * (70 + 22) + list.reduce((a, r) => a + rowH(r, f), 0) - 22;
  };
  let shown = rows;
  let f = 1;
  while (need(shown, f) > avail && f > 0.7) f -= 0.05;
  while (need(shown, f) > avail && shown.length > 1) shown = shown.slice(0, -1);
  const hidden = rows.length - shown.length;

  let y = top;
  let panels = '';
  for (const place of [1, 2, 3] as const) {
    const list = shown.filter((r) => r.place === place);
    if (!list.length) continue;
    const c = PANEL[place];
    const total = rows.filter((r) => r.place === place).length;
    const bodyH = list.reduce((a, r) => a + rowH(r, f), 0);
    panels += `<g><linearGradient id="g${place}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.grad[0]}"/><stop offset="1" stop-color="${c.grad[1]}"/></linearGradient>
<rect x="94" y="${y}" width="892" height="${70 + bodyH}" rx="14" fill="#101c43" fill-opacity=".92" stroke="${c.ring}" stroke-opacity=".7" stroke-width="2"/>
<path d="M94 ${y + 14}a14 14 0 0 1 14 -14H972a14 14 0 0 1 14 14V${y + 70}H94Z" fill="url(#g${place})"/>
${medalIcon(152, y + 24, 19, c.ring, c.ink, true)}
<text x="206" y="${y + 51}" font-weight="800" font-size="50" fill="${c.ink}">${c.word}</text>
<text x="962" y="${y + 47}" text-anchor="end" font-weight="800" font-size="30" fill="${c.ink}">${total} ${total === 1 ? 'MEDALLA' : 'MEDALLAS'}</text>`;
    let ry = y + 70;
    list.forEach((r, i) => {
      const hh = rowH(r, f);
      const cy = ry + hh / 2;
      if (i > 0) panels += `<line x1="120" x2="960" y1="${ry}" y2="${ry}" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>`;
      panels += medalIcon(152, cy - 8, 16, c.ring, c.ink);
      panels += `<text x="204" y="${cy + 9}" font-weight="800" font-size="30" fill="#fff">${esc(upper(r.event))}</text><line x1="268" x2="268" y1="${cy - 24}" y2="${cy + 24}" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>`;
      const many = r.lines.length > 1;
      const names = r.lines.map((l, j) => ({ text: many ? (j < r.lines.length - 1 ? `${l} /` : l) : l, size: many || r.with ? 28 : 32 }));
      const rows2 = names.length + (r.with ? 1 : 0);
      let ny = cy - (rows2 - 1) * 14 + 8;
      for (const n of names) {
        panels += `<text x="290" y="${ny}" font-weight="700" font-size="${n.size}" fill="#fff">${esc(clip(n.text, 360, n.size))}</text>`;
        ny += 28;
      }
      if (r.with) panels += `<text x="290" y="${ny}" font-weight="700" font-size="22" fill="#b9c8ee">${esc(clip(`(con ${r.with})`, 360, 22))}</text>`;
      if (r.detail) {
        panels += `<line x1="662" x2="662" y1="${cy - 24}" y2="${cy + 24}" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>`;
        const lines = wrap(r.detail, 34, 2);
        const dy = lines.length > 1 ? 12 : 0;
        lines.forEach((l, j) => (panels += `<text x="678" y="${cy + 8 - dy + j * 24}" font-weight="700" font-size="23" fill="#fff">${esc(l)}</text>`));
      }
      ry += hh;
    });
    panels += '</g>';
    y += 70 + bodyH + 22;
  }

  const count = (p: number) => medals.filter((r) => r.place === p).length;
  const label = [[1, 'ORO', 'OROS', '#f2c230'], [2, 'PLATA', 'PLATA', '#dfe5ee'], [3, 'BRONCE', 'BRONCE', '#e39a58']] as const;
  const tally = label.filter(([p]) => count(p) > 0).map(([p, one, many, col]) => `<tspan fill="${col}">${count(p)} ${count(p) === 1 ? one : many}</tspan>`).join('<tspan fill="#fff">  ·  </tspan>');
  const place = t.name;
  const cover = Math.max(w / 1080, h / 1350);
  const bg = `<g transform="translate(${(w - 1080 * cover) / 2} ${(h - 1350 * cover) / 2}) scale(${cover})">${COURT_BG}</g>`;
  const body = `<g transform="translate(64 56)"><clipPath id="logoClip"><rect width="112" height="112"/></clipPath><image href="${LOGO}" width="112" height="112" clip-path="url(#logoClip)"/><rect width="112" height="112" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></g>
<rect x="206" y="60" width="3" height="108" fill="#fff" fill-opacity=".5"/>
<text x="234" y="94" font-weight="800" font-size="38" fill="#fff">CLUB</text><text x="234" y="138" font-weight="800" font-size="38" fill="#fff">BÁDMINTON</text><text x="234" y="178" font-weight="800" font-size="38" fill="#fff">UVA</text>
<text x="540" y="338" text-anchor="middle" font-weight="800" font-size="196" fill="#fff">MEDALLAS</text>
<text x="540" y="456" text-anchor="middle" font-weight="800" font-size="148" fill="#c9d4f7">${t.results.every((r) => !r.place || r.done) && t.progress?.done ? 'CONSEGUIDAS' : 'CONFIRMADAS'}</text>
<text x="540" y="502" text-anchor="middle" font-weight="700" font-size="27" letter-spacing="9" fill="#e6ecff">RESULTADOS DEL CLUB BÁDMINTON UVA</text>
<line x1="400" x2="680" y1="514" y2="514" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>
${panels}
<rect x="94" y="1222" width="892" height="92" rx="12" fill="#0d1a3d" fill-opacity=".92" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>
<text x="130" y="1290" font-weight="800" font-size="100" fill="#fff">${medals.length}</text>
<text x="${130 + String(medals.length).length * 52 + 24}" y="1285" font-weight="800" font-size="52" fill="#fff">${medals.length === 1 ? 'MEDALLA' : 'MEDALLAS'}</text>
<line x1="470" x2="470" y1="1238" y2="1298" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
<text x="496" y="1280" font-weight="800" font-size="40">${tally}</text>
<text x="94" y="1340" font-weight="700" font-size="24" fill="#e6ecff">${esc(clip(`${hidden > 0 ? `+${hidden} ${hidden === 1 ? 'MEDALLA MÁS' : 'MEDALLAS MÁS'} · ` : ''}#ClubBadmintonUVa · ${upper(place)}`, 760, 24))}</text>
<g transform="translate(980 1262) rotate(-14) scale(1.1)">${SHUTTLE}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Barlow Condensed"><rect width="${w}" height="${h}" fill="#0b1330"/>${bg}<g transform="translate(${ox} ${oy}) scale(${k})">${body}</g></svg>`;
}

export function tournamentSvg(t: PublicTournament, size: CardSize, kind: 'torneo' | 'resultados', rivals: Record<string, string> = {}): string {
  if (kind === 'resultados' && size !== 'og' && t.results.some((r) => r.place)) return podiumSvg(t, size);
  const { w, h } = SIZES[size];
  const vertical = size !== 'og';
  const x = vertical ? 64 : 56;
  const top = vertical ? (size === 'story' ? 330 : 240) : 150;
  const head = titleBlock(t, w, x, top + (vertical ? 60 : 40), vertical);
  const medals = t.results.filter((r) => r.place);
  const rowSize = vertical ? 46 : 32;
  const rowGap = vertical ? 78 : 46;
  let y = head.bottom + (vertical ? 80 : 50);
  const rowsFit = (extra = 0) => Math.max(1, Math.floor((h - 70 - y - extra) / rowGap));
  let rows = '';
  let chip: Chip;

  if (kind === 'resultados') {
    chip = CHIP.res;
    const tally = ([1, 2, 3] as const).map((p) => ({ p, n: medals.filter((r) => r.place === p).length })).filter((d) => d.n > 0);
    let tx = x;
    for (const d of tally) {
      const label = `${d.n} ${MEDAL_WORD[d.p]}`;
      const cw = label.length * (vertical ? 28 : 22) + 56;
      rows += `<g transform="translate(${tx} ${y - rowSize})"><polygon points="12,0 ${cw},0 ${cw - 12},${rowSize * 1.4} 0,${rowSize * 1.4}" fill="${MEDAL_COLOR[d.p]}"/><text x="${cw / 2}" y="${rowSize * 1.05}" text-anchor="middle" font-weight="800" font-size="${rowSize}" fill="#1a1400" letter-spacing="2">${label}</text></g>`;
      tx += cw + 16;
    }
    y += tally.length ? rowGap * 0.9 : 0;
    const list = [...medals, ...t.results.filter((r) => !r.place)].slice(0, rowsFit());
    for (const r of list) {
      const colour = r.place ? MEDAL_COLOR[r.place] : '#c4dcf3';
      const word = r.place ? MEDAL_WORD[r.place] : '·';
      const label = `${r.entrant}  ·  ${r.event}${r.place ? '' : `: ${r.text}`}`;
      rows += `<rect x="${x}" y="${y - rowSize * 0.9}" width="8" height="${rowSize * 1.1}" fill="${colour}"/><text x="${x + 24}" y="${y}" font-weight="800" font-size="${rowSize}" fill="${colour}" letter-spacing="2">${word}</text><text x="${x + 24 + (vertical ? 190 : 150)}" y="${y}" font-weight="700" font-size="${rowSize}" fill="#fff">${esc(clip(upper(label), w - x * 2 - (vertical ? 210 : 170), rowSize))}</text>`;
      y += rowGap;
    }
    if (!list.length) rows += `<text x="${x}" y="${y}" font-weight="700" font-size="${rowSize}" fill="#c4dcf3">AÚN SIN RESULTADOS</text>`;
  } else {
    const startOf = (m: PublicMatch) => m.estimatedStart ?? m.plannedStart ?? `${m.date ?? '9999-99-99'}T${m.time ?? '99:99'}`;
    const live = t.matches.some((m) => m.state === 'live');
    const done = t.matches.length > 0 && t.matches.every((m) => m.state === 'finished');
    chip = live ? CHIP.live : done ? CHIP.done : CHIP.tour;
    // Jornada que se enseña: la del primer partido pendiente (o en juego); si ya terminó todo, la última.
    const ordered = [...t.matches].sort((a, b) => startOf(a).localeCompare(startOf(b)));
    const day = (ordered.find((m) => m.state !== 'finished') ?? ordered.at(-1))?.date;
    const dayMatches = ordered.filter((m) => m.date === day);
    if (dayMatches.length) {
      // Filas propias de esta tarjeta: más compactas para que quepa la jornada entera (en vertical, dos líneas: nuestros jugadores y «vs» el rival).
      const tall = size === 'story';
      const rs = tall ? 40 : size === 'square' ? 34 : 26;
      const rg = tall ? 118 : size === 'square' ? 58 : 32;
      rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rowSize * 0.85}" fill="#f2c230" letter-spacing="4">PARTIDOS DE LA JORNADA</text>`;
      y += rg * (tall ? 0.75 : 1);
      const room = (extra = 0) => Math.max(1, Math.floor((h - 70 - y - extra) / rg));
      const shown = dayMatches.length > room() ? room(rg * 0.8) : dayMatches.length;
      const resX = w - (vertical ? 200 : 190); // la franja amarilla ocupa el borde derecho
      const labelX = x + (tall ? 190 : size === 'square' ? 150 : 120);
      for (const m of dayMatches.slice(0, shown)) {
        const when = m.state === 'live' ? 'AHORA' : (m.estimatedStart ? clockOf(m.estimatedStart) : m.time) ?? '--:--';
        const rival = upper(rivals[m.id] ?? m.opponent ?? 'Rival');
        const us = upper(m.players.join(' / '));
        const timeColor = m.state === 'live' ? '#ff6b6b' : m.state === 'finished' ? '#8fa3c7' : '#f2c230';
        const nameColor = m.state === 'finished' ? '#dfe8f6' : '#fff';
        const result = m.state === 'finished' ? `${m.outcome === 'win' ? 'V ' : m.outcome === 'loss' ? 'D ' : ''}${m.score ?? ''}`.trim() : m.estimatedStart && m.state === 'scheduled' ? 'EST.' : '';
        const resColor = m.outcome === 'win' ? '#5ee08f' : m.outcome === 'loss' ? '#ff8a80' : '#c4dcf3';
        const maxW = resX - labelX - 16;
        rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rs}" fill="${timeColor}">${esc(when)}</text>`;
        if (tall) {
          rows += `<text x="${labelX}" y="${y}" font-weight="700" font-size="${rs}" fill="${nameColor}">${esc(clip(us, maxW, rs))}</text><text x="${labelX}" y="${y + rs * 0.95}" font-weight="700" font-size="${rs * 0.85}" fill="#8fc2ee">vs ${esc(clip(rival, maxW - 60, rs * 0.85))}</text>`;
        } else {
          rows += `<text x="${labelX}" y="${y}" font-weight="700" font-size="${rs}" fill="${nameColor}">${esc(clip(`${us} VS ${rival}`, maxW, rs))}</text>`;
        }
        if (result) rows += `<text x="${resX}" y="${y}" text-anchor="end" font-weight="800" font-size="${rs * 0.9}" fill="${resColor}">${esc(upper(result))}</text>`;
        y += rg;
      }
      if (dayMatches.length > shown) rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rs * 0.85}" fill="#c4dcf3" letter-spacing="3">+${dayMatches.length - shown} PARTIDOS MÁS EN LA WEB</text>`;
    } else if (t.entries.length) {
      // Víspera del torneo, aún sin orden de juego: quién juega y en qué pruebas (nivel y cabeza de serie).
      const byPlayer = new Map<string, string[]>();
      for (const e of t.entries.filter((e) => e.status !== 'excluded')) {
        const label = `${e.event.replace('-', ' ')}${e.seed ? ` · SERIE ${e.seed}` : ''}`;
        byPlayer.set(e.player, [...(byPlayer.get(e.player) ?? []), label]);
      }
      const list = [...byPlayer].slice(0, vertical ? 9 : 5);
      rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rowSize * 0.85}" fill="#f2c230" letter-spacing="4">NUESTROS JUGADORES${byPlayer.size > list.length ? ` · +${byPlayer.size - list.length}` : ''}</text>`;
      y += rowGap * 0.9;
      for (const [player, evs] of list.slice(0, rowsFit())) {
        const nameW = vertical ? 400 : 330;
        rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rowSize * 0.9}" fill="#fff">${esc(clip(upper(player), nameW, rowSize * 0.9))}</text><text x="${x + nameW + 20}" y="${y}" font-weight="700" font-size="${rowSize * 0.8}" fill="#8fc2ee">${esc(clip(upper(evs.join('   ')), w - x * 2 - nameW - 150, rowSize * 0.8))}</text>`;
        y += rowGap * 0.85;
      }
    } else if (t.uvaPlayers.length) {
      const names = t.uvaPlayers.slice(0, vertical ? 8 : 6);
      rows += `<text x="${x}" y="${y}" font-weight="800" font-size="${rowSize * 0.85}" fill="#f2c230" letter-spacing="4">JUGADORES DE LA UVA${t.uvaPlayers.length > names.length ? ` · +${t.uvaPlayers.length - names.length}` : ''}</text>`;
      y += rowGap * 0.85;
      for (const n of names.slice(0, rowsFit())) {
        rows += `<text x="${x}" y="${y}" font-weight="700" font-size="${rowSize}" fill="#fff">${esc(clip(upper(n), w - x * 2, rowSize))}</text>`;
        y += rowGap * 0.8;
      }
    }
  }
  return frame(w, h, chip, head.svg + rows);
}

/* ------------------------------ Búsqueda y PNG ------------------------------ */

export type Found = { kind: 'partido'; t: PublicTournament; m: PublicMatch } | { kind: 'torneo' | 'resultados'; t: PublicTournament; rivals?: Record<string, string> };

export function findCard(state: PublicState, kind: CardKind, id: string): Found | undefined {
  if (kind === 'partido') {
    for (const t of state.tournaments) {
      const m = t.matches.find((x) => x.id === id);
      if (m) return { kind, t, m };
    }
    return undefined;
  }
  const t = state.tournaments.find((x) => x.id.toUpperCase() === id.toUpperCase());
  return t ? { kind, t } : undefined;
}

export const svgOf = (f: Found, size: CardSize): string => (f.kind === 'partido' ? matchSvg(f.t, f.m, size) : tournamentSvg(f.t, size, f.kind, f.kind === 'torneo' ? f.rivals : undefined));

/** Cambia cuando cambia lo que se dibuja: así la dirección de la imagen cambia con el partido y las aplicaciones no enseñan una vista previa antigua. */
export const cardVersion = (f: Found): string => createHash('sha1').update(svgOf(f, 'og')).digest('hex').slice(0, 8);

const cache = new Map<string, Buffer>();
export function renderPng(f: Found, size: CardSize): Buffer {
  const svg = svgOf(f, size);
  const key = createHash('sha1').update(size + svg).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;
  const png = new Resvg(svg, { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' } }).render().asPng();
  cache.set(key, png);
  if (cache.size > 48) cache.delete(cache.keys().next().value!); // las más antiguas primero: la memoria queda acotada (≈ 48 × 60-120 KB)
  return png;
}

/* ---------------------------------- HTML ---------------------------------- */

export interface ShareMeta {
  title: string;
  description: string;
  /** Dirección de la web del club a la que se lleva a quien abre el enlace. */
  target: string;
  image: string;
}

export function metaOf(f: Found): { title: string; description: string; webPath: string } {
  const t = f.t;
  if (f.kind === 'partido') {
    const m = f.m;
    const us = m.players.join(' / ');
    const vs = `${us} vs ${m.opponent ?? 'rival'}`;
    const state = m.state === 'finished' ? `${m.outcome === 'win' ? 'Victoria' : m.outcome === 'loss' ? 'Derrota' : 'Finalizado'}${m.score ? ` ${m.score}` : ''}` : m.state === 'live' ? 'En juego ahora' : `${dayLabel(m.date)} ${m.estimatedStart ? `${clockOf(m.estimatedStart)} (EST)` : (m.time ?? '')}`.trim();
    return { title: `${vs} · ${state}`, description: `${t.name}${m.event ? ` · ${eventName(m.event.split(' · ')[0])}` : ''}${m.court ? ` · Pista ${m.court}` : ''}. Club Bádminton Universidad de Valladolid.`, webPath: `/directo?partido=${encodeURIComponent(m.id)}` };
  }
  if (f.kind === 'resultados') {
    const medals = t.results.filter((r) => r.place).length;
    return { title: `Resultados de la UVa en ${t.name}`, description: `${medals ? `${medals} medalla${medals === 1 ? '' : 's'} para el club. ` : ''}${t.results.length} resultados de jugadores de la UVa. ${dateRange(t.startDate, t.endDate)}${t.city ? ` · ${t.city}` : ''}.`, webPath: `/calendario?torneo=${encodeURIComponent(t.id)}` };
  }
  return { title: `${t.name} · jugadores de la UVa`, description: `${t.uvaPlayers.length} jugadores de la UVa · ${dateRange(t.startDate, t.endDate)}${t.city ? ` · ${t.city}` : ''}. Partidos, cuadros y resultados en la web del club.`, webPath: `/calendario?torneo=${encodeURIComponent(t.id)}` };
}

export function shareHtmlPage(meta: ShareMeta): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${esc(meta.description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Club Bádminton Universidad de Valladolid"><meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}">
<meta property="og:image" content="${esc(meta.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(meta.title)}"><meta name="twitter:description" content="${esc(meta.description)}"><meta name="twitter:image" content="${esc(meta.image)}">
${meta.target ? `<meta property="og:url" content="${esc(meta.target)}"><link rel="canonical" href="${esc(meta.target)}"><meta http-equiv="refresh" content="0; url=${esc(meta.target)}">` : ''}</head>
<body><p>${esc(meta.title)}</p><p>${esc(meta.description)}</p>${meta.target ? `<p><a href="${esc(meta.target)}">Ver en la web del club</a></p>` : ''}</body></html>`;
}
