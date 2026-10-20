import officialJson from '../data/calendario-oficial.json';
import uvaJson from '../data/uva-torneos.json';
import type { Tournament, UvaTournamentsFile } from '../types';
import { mergeUva } from './tournaments';

export interface TournamentData {
  tournaments: Tournament[];
  /** Cuándo se comprobó por última vez la fuente oficial (ISO). */
  checkedAt?: string;
  sourceLabel?: string;
  note?: string;
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

const official = officialJson as { meta: { comprobadoEl: string; fuente: string; nota: string }; tournaments: Tournament[] };
const uva = uvaJson as UvaTournamentsFile;

export const localSource: TournamentSource = {
  load: async () => ({
    tournaments: mergeUva(official.tournaments, uva.entradas, uva.torneosPropios),
    checkedAt: official.meta.comprobadoEl,
    sourceLabel: official.meta.fuente,
    note: official.meta.nota,
  }),
};

export const tournamentSource: TournamentSource = localSource;
