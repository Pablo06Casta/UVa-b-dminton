import { daysBetween, todayIn } from './dates';
import type { PublicResult } from './results';
import type { PublicTournament } from './publicView';

/** Noticia generada sola a partir de los resultados oficiales ya publicados (solo personas del club con consentimiento). */
export interface PublicNews {
  id: string;
  /** Último día del torneo (YYYY-MM-DD). */
  date: string;
  tag: string;
  title: string;
  summary: string;
  tournament: { name: string; place?: string };
  tournamentGuid: string;
  medals?: { place: 1 | 2 | 3; event: string; eventName: string; who: string; detail?: string }[];
  highlights?: string[];
  /** Texto de la crónica (párrafos), si hay una redactada y aprobada. */
  body?: string[];
  sources: { label: string; url: string }[];
  auto: true;
}

const EVENT: Record<string, string> = { IM: 'Individual masculino', IF: 'Individual femenino', DM: 'Dobles masculino', DF: 'Dobles femenino', DX: 'Dobles mixto' };
export const eventName = (base: string) => {
  const head = base.slice(0, 2).toUpperCase();
  const rest = base.slice(2).trim();
  return EVENT[head] ? `${EVENT[head]}${rest ? ` · ${rest}` : ''}` : base;
};

const TZ = 'Europe/Madrid';
/** Cuántos días se sigue mostrando la noticia de un torneo terminado. */
export const NEWS_DAYS = 45;
const MAX_HIGHLIGHTS = 8;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MEDAL_WORD = { 1: 'oro', 2: 'plata', 3: 'bronce' } as const;

/** ¿Ha terminado el torneo? Por fecha, o porque ya no quedan partidos del último día. */
export function finished(t: PublicTournament, today: string): boolean {
  const last = t.endDate ?? t.startDate;
  if (!last) return false;
  return last < today || (t.progress?.date === last && t.progress.done);
}

function detailFor(r: PublicResult): string | undefined {
  if (r.place === 1) return r.score ? `Ganó la final por ${r.score}.` : 'Ganó la final.';
  if (r.place === 2) return r.score ? `Perdió la final por ${r.score}.` : 'Finalista.';
  if (r.place === 3) return 'Bronce tras las semifinales.';
  return undefined;
}

/** Una noticia por cada torneo terminado (últimos 45 días) en el que figuran resultados del club. Se recalcula con cada estado: nunca se guarda nada. */
export function buildAutoNews(tournaments: PublicTournament[], now: Date): PublicNews[] {
  const today = todayIn(TZ, now);
  const out: PublicNews[] = [];
  for (const t of tournaments) {
    const last = t.endDate ?? t.startDate;
    if (!last || !finished(t, today) || daysBetween(last, today) > NEWS_DAYS || t.results.length === 0) continue;
    const medals = t.results.filter((r) => r.place);
    const count = (p: 1 | 2 | 3) => medals.filter((r) => r.place === p).length;
    const where = [t.city, t.venue].filter(Boolean).join(' · ') || undefined;
    const sources = t.officialUrl ? [{ label: 'Resultados oficiales en badminton.es', url: t.officialUrl }] : [];
    let title: string;
    let summary: string;
    if (medals.length === 1) {
      const m = medals[0];
      title = `${m.entrant}, medalla de ${MEDAL_WORD[m.place!]} en ${t.name}`;
      summary = `${eventName(m.event)}: ${MEDAL_WORD[m.place!]} para la UVa en ${t.name}.`;
    } else if (medals.length > 1) {
      title = `${plural(medals.length, 'medalla', 'medallas')} para la UVa en ${t.name}`;
      const parts = [count(1) && plural(count(1), 'oro', 'oros'), count(2) && plural(count(2), 'plata', 'platas'), count(3) && plural(count(3), 'bronce', 'bronces')].filter(Boolean);
      summary = `El club logró ${parts.join(', ')} en ${t.name}.`;
    } else {
      title = `La UVa en ${t.name}: así quedaron nuestros jugadores`;
      summary = `Resultados del club en ${t.name}, según los cuadros oficiales.`;
    }
    summary += ' Resumen generado automáticamente a partir de los resultados oficiales.';
    const rest = t.results.filter((r) => !r.place);
    const highlights = rest.slice(0, MAX_HIGHLIGHTS).map((r) => `${r.entrant} · ${eventName(r.event)}: ${r.text}.`);
    if (rest.length > MAX_HIGHLIGHTS) highlights.push(`Y ${rest.length - MAX_HIGHLIGHTS} resultados más.`);
    out.push({
      id: `auto-${t.id}`,
      date: last,
      tag: medals.length > 0 ? 'Podio' : 'Resultados',
      title,
      summary,
      tournament: { name: t.name, place: where },
      tournamentGuid: t.id,
      medals: medals.length > 0 ? medals.map((r) => ({ place: r.place!, event: r.event, eventName: eventName(r.event), who: r.entrant, detail: detailFor(r) })) : undefined,
      highlights: highlights.length > 0 ? highlights : undefined,
      sources,
      auto: true,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
