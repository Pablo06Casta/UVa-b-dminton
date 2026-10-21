import uvaJson from '../data/uva-torneos.json';
import type { LiveState, Tournament, UvaTournamentsFile } from '../types';
import { fetchCalendar, fetchLiveState, hasApi } from './api';
import { mergeLive } from './live';
import { mergeUva } from './tournaments';

export interface TournamentData {
  tournaments: Tournament[];
  /** Cuándo se comprobó por última vez la fuente oficial (ISO). */
  checkedAt?: string;
  sourceLabel?: string;
  note?: string;
  /** Estado del servidor en directo (jugadores públicos, avisos disponibles…). Ausente si no hay servidor. */
  live?: LiveState;
  /** `true` si hay servidor configurado pero no responde: se muestran los últimos datos incluidos en la web. */
  liveError?: boolean;
}

/**
 * Punto único de acceso a los torneos.
 *
 * Hoy se combinan dos ficheros: `calendario-oficial.json` (lo regenera `npm run calendario:actualizar` a
 * partir del calendario público de badminton.es) y `uva-torneos.json` (participación de la UVa, que informa el
 * club). Para conectar en el futuro una fuente oficial con inscritos y resultados, bastará con crear otra
 * implementación de `TournamentSource` y cambiar `tournamentSource`; las páginas no se tocan.
 *
 * IMPORTANTE: la lista de inscritos de badminton.es no indica el club, y las rutas con inscritos, cuadros y
 * partidos están excluidas por su robots.txt. Por eso la participación de la UVa la aporta el club (o una
 * futura conexión autorizada), nunca se deduce.
 */
export interface TournamentSource {
  load(): Promise<TournamentData>;
}

const uva = uvaJson as UvaTournamentsFile;

/** El calendario incluido en la web (≈ 47 KB) no viaja con el código inicial: solo se descarga si no hay servidor o si este no responde. */
const loadOfficial = async () => (await import('../data/calendario-oficial.json')).default as { meta: { comprobadoEl: string; fuente: string; nota: string }; tournaments: Tournament[] };

export const localSource: TournamentSource = {
  load: async () => {
    const official = await loadOfficial();
    return {
      tournaments: mergeUva(official.tournaments, uva.entradas, uva.torneosPropios),
      checkedAt: official.meta.comprobadoEl,
      sourceLabel: official.meta.fuente,
      note: official.meta.nota,
    };
  },
};

/**
 * Con servidor (VITE_API_URL): calendario oficial y datos en directo vienen de él; si no responde, se usan los datos
 * incluidos en la web y se avisa. Sin servidor, solo los datos incluidos.
 */
export const apiSource: TournamentSource = {
  load: async () => {
    const [cal, live] = await Promise.allSettled([fetchCalendar(), fetchLiveState()]);
    const calendar = cal.status === 'fulfilled' ? cal.value : undefined;
    const fallback = calendar ? undefined : await localSource.load();
    const base = calendar ? mergeUva(calendar.tournaments, uva.entradas, uva.torneosPropios) : fallback!.tournaments;
    const tournaments = live.status === 'fulfilled' ? mergeLive(base, live.value) : base;
    return {
      tournaments,
      checkedAt: calendar?.meta.comprobadoEl ?? fallback?.checkedAt,
      sourceLabel: calendar?.meta.fuente ?? fallback?.sourceLabel,
      note: calendar?.meta.nota ?? fallback?.note,
      live: live.status === 'fulfilled' ? live.value : undefined,
      liveError: live.status === 'rejected',
    };
  },
};

export const tournamentSource: TournamentSource = hasApi ? apiSource : localSource;
