import { useEffect, useState } from 'react';
import { fetchLiveState, hasApi } from '../lib/api';
import type { NewsItem } from '../types';

const REFRESH_MS = 5 * 60_000;

/** Noticias que genera solo el servidor al terminar cada torneo. Se piden al cargar y cada 5 minutos; sin servidor, no hay ninguna. */
export function useLiveNews(): NewsItem[] {
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    if (!hasApi) return;
    let alive = true;
    const load = () =>
      fetchLiveState()
        .then((s) => alive && setNews(s.news ?? []))
        .catch(() => {
          /* se conservan las últimas noticias */
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return news;
}
