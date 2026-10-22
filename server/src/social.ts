import { daysBetween, todayIn } from './dates';
import { eventName } from './news';
import type { PublicState, PublicTournament } from './publicView';

/**
 * Paquete listo para publicar en redes: qué torneos tocan, sus imágenes (las genera este mismo servidor, sin depender de leer la web)
 * y un pie de foto de partida. Lo consumen las tareas programadas que envían las publicaciones por correo.
 */
export interface SocialItem {
  kind: 'previa' | 'resultados';
  tournamentId: string;
  name: string;
  city?: string;
  dates: string;
  /** Resultados con partidos aún por jugar. */
  provisional: boolean;
  images: { square: string; story: string; og?: string };
  /** Pie de foto de partida (plantilla con datos reales, sin IA) y versión corta para la story. */
  caption: string;
  short: string;
  /** Datos que puede citar quien lo redacte (solo jugadores con consentimiento). */
  players: string[];
  medals: { gold: number; silver: number; bronze: number };
}

const TZ = 'Europe/Madrid';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const day = (iso: string) => `${Number(iso.slice(8, 10))} de ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const dates = (t: PublicTournament) => (t.endDate && t.endDate !== t.startDate ? `del ${Number(t.startDate!.slice(8, 10))} al ${day(t.endDate)}` : day(t.startDate!));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const tag = (s?: string) => (s ? `#${s.normalize('NFD').replace(/[^A-Za-z0-9]/g, '')}` : '');
const TAGS = '#badminton #bádminton #ClubBadmintonUVA #UVa #Valladolid';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function medalsOf(t: PublicTournament) {
  const n = (p: number) => t.results.filter((r) => r.place === p).length;
  return { gold: n(1), silver: n(2), bronze: n(3) };
}

function previa(t: PublicTournament, base: string): SocialItem {
  const players = t.uvaPlayers.map((p) => p.split(' ').slice(0, 2).join(' '));
  const seeds = t.entries.filter((e) => e.seed && e.status !== 'excluded').slice(0, 3).map((e) => `${e.player.split(' ').slice(0, 2).join(' ')} (${e.event.replace('-', ' ')}, cabeza de serie ${e.seed})`);
  const caption = [
    `¡Nos toca competir! 🏸 El Club Bádminton UVa juega el ${t.name}${t.city ? ` en ${t.city}` : ''} ${dates(t)}.`,
    players.length ? `Salen a pista: ${list(players)}.` : '',
    seeds.length ? `Cabezas de serie: ${list(seeds)}.` : '',
    'Las horas y los rivales de la jornada, en la imagen. ¡Vamos UVa!',
    'Resultados en directo en la web del club.',
    `${TAGS} ${tag(t.city)}`.trim(),
  ].filter(Boolean).join('\n\n');
  const id = encodeURIComponent(t.id);
  return {
    kind: 'previa', tournamentId: t.id, name: t.name, city: t.city, dates: dates(t), provisional: false,
    images: { square: `${base}/og/torneo/${id}.png?size=square`, story: `${base}/og/torneo/${id}.png?size=story`, og: `${base}/og/torneo/${id}.png?size=og` },
    caption, short: `Mañana a pista en ${t.name}. ¡Vamos UVa! 🏸`, players, medals: medalsOf(t),
  };
}

function resultados(t: PublicTournament, base: string): SocialItem {
  const m = medalsOf(t);
  const parts = [m.gold && plural(m.gold, 'oro', 'oros'), m.silver && plural(m.silver, 'plata', 'platas'), m.bronze && plural(m.bronze, 'bronce', 'bronces')].filter(Boolean) as string[];
  const podium = t.results.filter((r) => r.place).map((r) => `${r.place === 1 ? 'Oro' : r.place === 2 ? 'Plata' : 'Bronce'}: ${r.entrant} (${eventName(r.event)})`);
  const record = t.record && t.record.won + t.record.lost > 0 ? `Balance del torneo: ${t.record.won} partidos ganados y ${t.record.lost} perdidos.` : '';
  const caption = [
    parts.length ? `¡Nuestros jugadores UVa han conseguido ${list(parts)} en el ${t.name}! 🏆` : `Así quedaron nuestros jugadores UVa en el ${t.name}.`,
    podium.join('\n'),
    record,
    '¡Enhorabuena y a por la siguiente! Súmate al Club Bádminton UVa.',
    `${TAGS} ${tag(t.city)}`.trim(),
  ].filter(Boolean).join('\n\n');
  const id = encodeURIComponent(t.id);
  return {
    kind: 'resultados', tournamentId: t.id, name: t.name, city: t.city, dates: dates(t),
    provisional: t.matches.some((x) => x.state !== 'finished'),
    images: { square: `${base}/og/resultados/${id}.png?size=square`, story: `${base}/og/resultados/${id}.png?size=story` },
    caption, short: parts.length ? `${list(parts)} para la UVa en ${t.name}. ¡Enhorabuena! 🏆` : `La UVa en ${t.name}. ¡Gracias por competir!`,
    players: t.uvaPlayers.map((p) => p.split(' ').slice(0, 2).join(' ')), medals: m,
  };
}

/**
 * `previa`: torneos que empiezan mañana con gente del club. `resultados`: torneos jugados ayer u hoy (fin de semana) con resultados.
 */
export function buildSocial(state: PublicState, when: 'previa' | 'resultados', base: string, now = new Date()): SocialItem[] {
  const today = todayIn(TZ, now);
  return state.tournaments
    .filter((t) => {
      if (!t.startDate) return false;
      if (when === 'previa') return daysBetween(today, t.startDate) === 1 && (t.uvaPlayers.length > 0 || t.entries.length > 0);
      const last = t.endDate ?? t.startDate;
      return t.startDate <= today && daysBetween(last, today) <= 1 && t.results.length > 0;
    })
    .map((t) => (when === 'previa' ? previa(t, base) : resultados(t, base)));
}
