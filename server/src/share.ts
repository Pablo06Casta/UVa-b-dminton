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
const FONT_FILES = ['BarlowCondensed_700Bold.ttf', 'BarlowCondensed_800ExtraBold.ttf'].map((f) => path.join(FONT_DIR, f));

/** Logotipo oficial de la UVa (el mismo de la web), incrustado en las tarjetas. */
const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'logo-uva.png')).toString('base64')}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const upper = (s: string) => s.toLocaleUpperCase('es-ES');

/** Tamaño de letra para que `text` quepa en `maxW` (ancho medio de la tipografía condensada ≈ 0,44 em en mayúsculas). */
const fit = (text: string, maxW: number, max: number, min = 26) => Math.max(min, Math.min(max, Math.floor(maxW / (Math.max(1, text.length) * 0.46))));
const clip = (text: string, maxW: number, size: number) => {
  const n = Math.floor(maxW / (size * 0.46));
  return text.length > n ? `${text.slice(0, Math.max(1, n - 1)).trimEnd()}…` : text;
};
const wrap = (text: string, maxChars: number, lines = 2): string[] => {
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
const clockOf = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : undefined);
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

/**
 * Tarjeta de resultados con podio en tres alturas (1.º en el centro), titular publicitario y llamada a la acción.
 * Se dibuja en un lienzo de 1080×1350 y se escala para que quepa en cuadrado o vertical.
 */
export function podiumSvg(t: PublicTournament, size: CardSize): string {
  const { w, h } = SIZES[size];
  const k = Math.min(w / 1080, h / 1350);
  const ox = (w - 1080 * k) / 2;
  const oy = (h - 1350 * k) / 2;
  const medals = t.results.filter((r) => r.place);
  const pick = (p: 1 | 2 | 3) => medals.find((r) => r.place === p);
  const extra = medals.length - [1, 2, 3].filter((p) => pick(p as 1 | 2 | 3)).length;
  // Alturas: escalón central más alto. Cada uno: [x, ancho, arriba, color, número].
  const steps = [
    { p: 2 as const, x: 64, w: 330, top: 800, fill: 'url(#silver)', line: '#9aa3af' },
    { p: 1 as const, x: 372, w: 336, top: 730, fill: 'url(#gold)', line: '#e0a914' },
    { p: 3 as const, x: 686, w: 330, top: 850, fill: 'url(#bronze)', line: '#b8793f' },
  ];
  const NAVY = '#14132f';
  const nameLines = (who: string): string[] => {
    const parts = who.split(/\s+\/\s+/);
    return parts.length > 1 ? parts : wrap(who, 15, 2);
  };
  const stepSvg = steps
    .map((s) => {
      const r = pick(s.p);
      const lines = r ? nameLines(r.entrant) : [];
      const cx = s.x + s.w / 2;
      const hgt = 1050 - s.top;
      const evY = s.top - 26;
      const nameY = evY - 64 - (lines.length - 1) * 46;
      const label = lines.map((l, i) => `<text x="${cx}" y="${nameY + i * 46}" text-anchor="middle" font-weight="800" font-size="44" fill="${NAVY}">${esc(clip(upper(l), s.w + 20, 44))}</text>`).join('');
      const ev = r ? `<rect x="${cx - 36}" y="${evY - 50}" width="72" height="6" fill="${s.line}"/><text x="${cx}" y="${evY}" text-anchor="middle" font-weight="700" font-size="26" letter-spacing="2" fill="#44506b">${esc(clip(upper(eventName(r.event)), s.w + 20, 26))}</text>` : '';
      const numSize = Math.min(190, hgt * 0.6);
      return `${label}${ev}<rect x="${s.x}" y="${s.top}" width="${s.w}" height="${hgt}" fill="${s.fill}"/><rect x="${s.x}" y="${s.top}" width="${s.w}" height="10" fill="#fff" fill-opacity=".35"/>
<text x="${cx}" y="${s.top + hgt * 0.62}" text-anchor="middle" font-weight="800" font-size="${numSize}" fill="${NAVY}">${s.p}</text><text x="${cx}" y="${s.top + hgt * 0.93}" text-anchor="middle" font-weight="800" font-size="${Math.min(64, hgt * 0.24)}" fill="${NAVY}">UVa</text>`;
    })
    .join('');
  const place = [t.name, t.city].filter(Boolean).join(' · ');
  const body = `
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef2f9"/><stop offset="1" stop-color="#dfe6f2"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3cf55"/><stop offset="1" stop-color="#d9a514"/></linearGradient>
  <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dde4"/><stop offset="1" stop-color="#a7aeb9"/></linearGradient>
  <linearGradient id="bronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9965c"/><stop offset="1" stop-color="#a8683a"/></linearGradient>
  <clipPath id="logoClip"><rect width="112" height="112"/></clipPath>
</defs>
<g stroke="#9fb0cf" stroke-opacity=".45" stroke-width="2"><path d="M-600 640H1700M-600 700H1700M-600 760H1700M-600 820H1700M-600 880H1700M-90 600V900M90 600V900M270 600V900M450 600V900M630 600V900M810 600V900M990 600V900M1170 600V900"/></g>
<g stroke="#fff" stroke-opacity=".8" stroke-width="5"><path d="M-600 1070H1700M-600 1140H1700M540 1050V1190"/></g>
<g transform="translate(64 56)"><image href="${LOGO}" width="112" height="112" clip-path="url(#logoClip)"/></g>
<rect x="206" y="62" width="3" height="100" fill="#14132f" fill-opacity=".6"/>
<text x="232" y="98" font-weight="800" font-size="48" fill="${NAVY}">CLUB</text><text x="232" y="140" font-weight="800" font-size="48" fill="${NAVY}">BÁDMINTON UVA</text>
<text x="540" y="360" text-anchor="middle" font-weight="800" font-size="168" fill="${NAVY}">EL TALENTO UVA</text>
<text x="540" y="506" text-anchor="middle" font-weight="800" font-size="150" fill="#e0a914">SUBE AL PODIO</text>
${stepSvg}
<g transform="translate(900 1125) rotate(-8)">${SHUTTLE}</g>
<line x1="64" x2="1016" y1="1182" y2="1182" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
<text x="540" y="1244" text-anchor="middle" font-weight="800" font-size="46" fill="#fff">${esc(clip(upper(place), 960, 46))}</text>
<line x1="64" x2="1016" y1="1268" y2="1268" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
<text x="540" y="1318" text-anchor="middle" font-weight="700" font-size="36" fill="#fff" letter-spacing="1">${esc(upper(extra > 0 ? `+${extra} ${extra === 1 ? 'medalla más' : 'medallas más'} · ` : ''))}¡Súmate al club! #ClubBadmintonUVA</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Barlow Condensed"><defs><linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5f95"/><stop offset="1" stop-color="#25406d"/></linearGradient><linearGradient id="skyBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6f2"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#skyBg)"/><rect y="${oy + 1030 * k}" width="${w}" height="${h}" fill="url(#floor)"/><g transform="translate(${ox} ${oy}) scale(${k})">${body}</g></svg>`;
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
