import type { Tournament, TournamentStatus, UvaEntry } from '../types';
import { eachDay, toISO } from './dates';

export const statusLabels: Record<TournamentStatus, string> = {
  upcoming: 'Próximo',
  ongoing: 'En curso',
  finished: 'Finalizado',
};

export const endOf = (t: Tournament): string => t.endDate ?? t.startDate;

/** El estado se deriva siempre de las fechas, nunca se almacena. */
export function getStatus(t: Tournament, today: string = toISO(new Date())): TournamentStatus {
  if (endOf(t) < today) return 'finished';
  if (t.startDate > today) return 'upcoming';
  return 'ongoing';
}

export const sortByDate = (list: Tournament[]): Tournament[] =>
  [...list].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'es'));

/** Próximos torneos: los que están en curso o por empezar, ordenados por fecha. */
export function getUpcoming(list: Tournament[], limit: number, today: string = toISO(new Date())): Tournament[] {
  return sortByDate(list)
    .filter((t) => getStatus(t, today) !== 'finished')
    .slice(0, limit);
}

/** Torneos que ocupan un día concreto. */
export const tournamentsOnDay = (list: Tournament[], iso: string): Tournament[] =>
  list.filter((t) => t.startDate <= iso && iso <= endOf(t));

/** Agrupa los torneos por cada día que ocupan (para pintar el calendario mensual). */
export function indexByDay(list: Tournament[]): Map<string, Tournament[]> {
  const map = new Map<string, Tournament[]>();
  for (const t of list) {
    for (const day of eachDay(t.startDate, endOf(t))) {
      const bucket = map.get(day);
      if (bucket) bucket.push(t);
      else map.set(day, [t]);
    }
  }
  return map;
}

export interface TournamentFilters {
  /** `YYYY-MM` o `all`. Un torneo coincide si alguno de sus días cae en ese mes. */
  month: string;
  status: TournamentStatus | 'all';
  category: string | 'all';
}

export function applyFilters(list: Tournament[], f: TournamentFilters, today: string = toISO(new Date())): Tournament[] {
  return sortByDate(list).filter((t) => {
    if (f.status !== 'all' && getStatus(t, today) !== f.status) return false;
    if (f.category !== 'all' && t.category !== f.category) return false;
    if (f.month !== 'all' && !(t.startDate.slice(0, 7) <= f.month && f.month <= endOf(t).slice(0, 7))) return false;
    return true;
  });
}

export const getCategories = (list: Tournament[]): string[] =>
  [...new Set(list.map((t) => t.category).filter((c): c is string => Boolean(c)))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

/** Un torneo "tiene jugadores de la UVa" solo si el club ha registrado participación. */
export const hasUvaPlayers = (t: Tournament): boolean =>
  (t.clubParticipants ?? 0) > 0 || (t.players?.length ?? 0) > 0;

/** Superpone la participación de la UVa sobre el calendario oficial. No se inventa nada: sin entrada, sin jugadores. */
export function mergeUva(official: Tournament[], entries: UvaEntry[], own: Tournament[] = []): Tournament[] {
  const byId = new Map(entries.map((e) => [e.tournamentId, e]));
  const merged = official.map((t) => {
    const e = byId.get(t.id);
    if (!e) return t;
    return {
      ...t,
      clubParticipants: e.clubParticipants ?? e.players?.length,
      players: e.players,
      results: e.results ?? t.results,
    };
  });
  return sortByDate([...merged, ...own.filter((o) => !official.some((t) => t.id === o.id))]);
}
