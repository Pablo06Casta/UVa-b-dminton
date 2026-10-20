import tournamentsJson from '../data/tournaments.json';
import type { Tournament } from '../types';

/**
 * Punto único de acceso a los torneos.
 *
 * Hoy los datos se introducen a mano en `src/data/tournaments.json`. Para conectar en el futuro una
 * fuente oficial y autorizada, bastará con crear otra implementación de `TournamentSource`
 * (p. ej. una que haga `fetch` a un endpoint propio o a un servicio autorizado) y cambiar
 * `tournamentSource` más abajo. Ni las páginas ni los componentes tendrán que modificarse.
 *
 * IMPORTANTE: no se ha asumido que exista ninguna API oficial. Esta capa solo deja el hueco preparado.
 */
export interface TournamentSource {
  load(): Promise<Tournament[]>;
}

export const manualSource: TournamentSource = {
  load: async () => tournamentsJson as Tournament[],
};

export const tournamentSource: TournamentSource = manualSource;
