import { useEffect, useState } from 'react';
import { tournamentSource, type TournamentData } from '../lib/tournamentSource';

type State = { status: 'loading' | 'ready' | 'error' } & TournamentData;

/** Fuente única de torneos para Inicio y Calendario. */
export function useTournaments(): State {
  const [state, setState] = useState<State>({ status: 'loading', tournaments: [] });

  useEffect(() => {
    let cancelled = false;
    tournamentSource
      .load()
      .then((data) => !cancelled && setState({ status: 'ready', ...data }))
      .catch(() => !cancelled && setState({ status: 'error', tournaments: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
