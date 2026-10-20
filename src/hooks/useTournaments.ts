import { useEffect, useState } from 'react';
import { tournamentSource } from '../lib/tournamentSource';
import type { Tournament } from '../types';

type State =
  | { status: 'loading'; tournaments: Tournament[] }
  | { status: 'ready'; tournaments: Tournament[] }
  | { status: 'error'; tournaments: Tournament[] };

/** Fuente única de torneos para Inicio y Calendario. */
export function useTournaments(): State {
  const [state, setState] = useState<State>({ status: 'loading', tournaments: [] });

  useEffect(() => {
    let cancelled = false;
    tournamentSource
      .load()
      .then((tournaments) => !cancelled && setState({ status: 'ready', tournaments }))
      .catch(() => !cancelled && setState({ status: 'error', tournaments: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
