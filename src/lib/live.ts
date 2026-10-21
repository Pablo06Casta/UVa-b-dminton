import type { LiveState, Tournament, UvaMatch } from '../types';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const sameCity = (a?: string, b?: string) => {
  const x = norm(a ?? '');
  const y = norm(b ?? '');
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

/**
 * Superpone los datos en directo del servidor sobre el calendario oficial. Se empareja por fecha de inicio y localidad;
 * si el torneo no está en el calendario absoluto, se añade como torneo propio.
 */
export function mergeLive(base: Tournament[], live: LiveState): Tournament[] {
  const out = [...base];
  for (const lt of live.tournaments) {
    const patch: Partial<Tournament> = {
      liveId: lt.id,
      players: lt.uvaPlayers,
      clubParticipants: lt.uvaPlayers.length || undefined,
      matches: lt.matches as UvaMatch[],
      progress: lt.progress,
      draws: lt.draws,
      podium: lt.results,
      entries: lt.entries,
      checkedAt: lt.checkedAt,
      stale: lt.stale,
      officialUrl: lt.officialUrl,
    };
    const i = out.findIndex((o) => o.startDate === lt.startDate && sameCity(o.city, lt.city));
    if (i >= 0) {
      out[i] = { ...out[i], ...patch, endDate: out[i].endDate ?? lt.endDate, venue: out[i].venue ?? lt.venue };
    } else if (lt.startDate) {
      out.push({
        id: `ts-${lt.id.slice(0, 8).toLowerCase()}`,
        name: lt.name,
        startDate: lt.startDate,
        endDate: lt.endDate,
        city: lt.city ?? 'Localidad por determinar',
        venue: lt.venue,
        level: lt.level,
        externalUrl: lt.officialUrl,
        source: 'official',
        ...patch,
      });
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'es'));
}

export type MatchWithTournament = { tournament: Tournament; match: UvaMatch };

export const allMatches = (list: Tournament[]): MatchWithTournament[] =>
  list.flatMap((tournament) => (tournament.matches ?? []).map((match) => ({ tournament, match })));

const startOf = (m: UvaMatch) => m.estimatedStart ?? m.plannedStart ?? `${m.date ?? '9999'}T${m.time ?? '99:99'}`;

/** Partidos por situación: en juego, próximos (por hora estimada) y resultados (el más reciente primero). */
export function boardOf(matches: MatchWithTournament[]) {
  const sorted = (xs: MatchWithTournament[], dir: 1 | -1) => [...xs].sort((a, b) => dir * startOf(a.match).localeCompare(startOf(b.match)));
  return {
    live: sorted(matches.filter((x) => x.match.state === 'live'), 1),
    next: sorted(matches.filter((x) => x.match.state === 'scheduled'), 1),
    done: sorted(matches.filter((x) => x.match.state === 'finished'), -1),
  };
}

/** Torneo a mostrar en «Directo»: el que está en juego hoy; si no, el próximo; si no, el último. */
export function pickActive(list: Tournament[], today: string): Tournament | undefined {
  const withData = list.filter((t) => t.progress || (t.matches?.length ?? 0) > 0 || t.liveId);
  const end = (t: Tournament) => t.endDate ?? t.startDate;
  return (
    withData.find((t) => t.startDate <= today && today <= end(t)) ??
    withData.filter((t) => t.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    [...withData].sort((a, b) => end(b).localeCompare(end(a)))[0]
  );
}

const fmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fmtSec = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
export const clock = (iso: string) => fmt.format(new Date(iso));
export const clockSec = (iso: string | Date) => fmtSec.format(typeof iso === 'string' ? new Date(iso) : iso);

/** Minutos de diferencia entre la hora estimada y la programada (+ = más tarde). */
export const lateness = (m: UvaMatch): number | undefined =>
  m.estimatedStart && m.plannedStart ? Math.round((Date.parse(m.estimatedStart) - Date.parse(m.plannedStart)) / 60_000) : undefined;
