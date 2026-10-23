import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLiga, hasApi } from '../lib/api';
import type { LigaData } from '../types';

const KEY = 'uva-liga';
const REFRESH_MS = 5 * 60_000;
const REFRESH_LIVE_MS = 60_000;

const cached = (): LigaData | undefined => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LigaData | null;
    return v && Array.isArray(v.clubs) && Array.isArray(v.rounds) ? v : undefined;
  } catch {
    return undefined;
  }
};

/** ¿Hay algún encuentro hoy? Entonces se pregunta cada minuto; si no, cada 5. */
const playsToday = (liga?: LigaData) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return !!liga?.rounds.some((r) => r.fixtures.some((f) => f.date === today));
};

/** Liga: sale al instante con lo de la última visita y se renueva sola (con ETag en el servidor, casi gratis si no hay cambios). */
export function useLiga() {
  const [liga, setLiga] = useState<LigaData | undefined>(() => (hasApi ? cached() : undefined));
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending' | 'error'>(() => (hasApi && cached() ? 'ready' : 'loading'));
  const alive = useRef(true);
  const current = useRef(liga);
  current.current = liga;

  const load = useCallback(() => {
    fetchLiga()
      .then((data) => {
        if (!alive.current) return;
        if (!data) return setStatus((s) => (s === 'ready' ? s : 'pending'));
        setLiga(data);
        setStatus('ready');
        try {
          localStorage.setItem(KEY, JSON.stringify(data));
        } catch {
          /* sin almacenamiento: solo se pierde la carga instantánea */
        }
      })
      .catch(() => alive.current && setStatus((s) => (s === 'ready' ? s : 'error')));
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!hasApi) return () => void (alive.current = false);
    load();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      load();
      timer = setTimeout(tick, !current.current || playsToday(current.current) ? REFRESH_LIVE_MS : REFRESH_MS);
    };
    timer = setTimeout(tick, current.current ? REFRESH_MS : REFRESH_LIVE_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { liga, status, hasApi };
}
