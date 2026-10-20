import { useCallback, useEffect, useRef, useState } from 'react';
import { hasApi, listenForUpdates } from '../lib/api';
import { tournamentSource, type TournamentData } from '../lib/tournamentSource';

type State = { status: 'loading' | 'ready' | 'error'; refreshedAt?: Date; reload: () => void } & TournamentData;

/** Refresco periódico con servidor: cada 5 minutos, al volver a la pestaña y cuando el servidor avisa de datos nuevos. */
const REFRESH_MS = 5 * 60_000;

/** Fuente única de torneos para Inicio, Calendario y Directo. */
export function useTournaments(): State {
  const [state, setState] = useState<Omit<State, 'reload'>>({ status: 'loading', tournaments: [] });
  const alive = useRef(true);

  const load = useCallback(() => {
    tournamentSource
      .load()
      .then((data) => alive.current && setState({ status: 'ready', refreshedAt: new Date(), ...data }))
      .catch(() => alive.current && setState((s) => (s.status === 'ready' ? s : { status: 'error', tournaments: [] })));
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    if (!hasApi) return () => void (alive.current = false);
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const stop = listenForUpdates(load);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [load]);

  return { ...state, reload: load };
}
