import { useCallback, useEffect, useRef, useState } from 'react';
import { hasApi, listenForUpdates } from '../lib/api';
import { tournamentSource, type TournamentData } from '../lib/tournamentSource';

type State = { status: 'loading' | 'ready' | 'error'; refreshedAt?: Date; refreshMs: number; reload: () => void } & TournamentData;

/** Refresco periódico con servidor: cada 5 minutos (cada minuto si hay partidos hoy), al volver a la pestaña y cuando el servidor avisa. */
const REFRESH_MS = 5 * 60_000;
const REFRESH_LIVE_MS = 60_000;
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Fuente única de torneos para Inicio, Calendario y Directo. */
export function useTournaments(): State {
  const [state, setState] = useState<Omit<State, 'reload' | 'refreshMs'>>({ status: 'loading', tournaments: [] });
  const alive = useRef(true);
  const playingToday = useRef(false);
  const today = todayLocal();
  playingToday.current = state.tournaments.some((t) => (t.matches ?? []).some((m) => m.date === today && m.state !== 'finished') || (t.matches ?? []).some((m) => m.state === 'live'));

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
    // Más seguido mientras hay partidos hoy: así se ve el avance del torneo y las horas estimadas se mantienen al día.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      load();
      timer = setTimeout(tick, playingToday.current ? REFRESH_LIVE_MS : REFRESH_MS);
    };
    timer = setTimeout(tick, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const stop = listenForUpdates(load);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [load]);

  return { ...state, refreshMs: playingToday.current ? REFRESH_LIVE_MS : REFRESH_MS, reload: load };
}
