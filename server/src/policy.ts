import { daysBetween } from '@/lib/util/time';
import { settings } from './config';

export type Phase = 'far' | 'soon' | 'imminent' | 'live' | 'recent' | 'past' | 'undated';
export const NEVER = Number.POSITIVE_INFINITY;

export function tournamentPhase(t: { startDate?: string | null; endDate?: string | null }, today: string): Phase {
  if (!t.startDate) return 'undated';
  const end = t.endDate ?? t.startDate;
  if (today > end) return daysBetween(end, today) <= 2 ? 'recent' : 'past';
  if (today >= t.startDate) return 'live';
  const d = daysBetween(today, t.startDate);
  if (d <= 1) return 'imminent';
  if (d <= 14) return 'soon';
  return 'far';
}

export interface Intervals {
  info: number;
  draws: number;
  day: number;
}

/**
 * Frecuencias por fase (ver config). Antes del torneo, cada 4 h; el día antes, cada 20 min (cuadros);
 * en jornada, el orden de juego cada pocos minutos; terminado, una última pasada y silencio.
 */
export function intervalsFor(phase: Phase): Intervals {
  const i = settings.intervals;
  switch (phase) {
    case 'far':
    case 'soon':
    case 'undated':
      return { info: i.before.info, draws: i.before.draws, day: NEVER };
    case 'imminent':
      return { ...i.imminent, day: NEVER };
    case 'live':
      return i.live;
    case 'recent':
      return i.recent;
    default:
      return { info: NEVER, draws: NEVER, day: NEVER };
  }
}

/** Prioridad de petición del cliente HTTP: 0 = jornada en curso, 1 = normal, 2 = segundo plano. */
export const priorityFor = (phase: Phase, kind: 'info' | 'draws' | 'day' | 'discover'): 0 | 1 | 2 => {
  if (phase === 'live' && (kind === 'day' || kind === 'draws')) return 0;
  if (kind === 'discover') return 2;
  return phase === 'live' || phase === 'imminent' ? 1 : 2;
};
