import { useEffect, useState } from 'react';
import { fetchNews, hasApi } from '../lib/api';
import type { NewsItem } from '../types';

const REFRESH_MS = 5 * 60_000;
const KEY = 'uva-noticias';

const cached = (): NewsItem[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as NewsItem[]) : [];
  } catch {
    return [];
  }
};

/**
 * Noticias que genera solo el servidor al terminar cada torneo. Salen al instante con las de la última visita (guardadas en el navegador)
 * y se renuevan con una petición muy ligera (solo noticias, con ETag) al cargar y cada 5 minutos. Sin servidor, no hay ninguna.
 */
export function useLiveNews(): NewsItem[] {
  const [news, setNews] = useState<NewsItem[]>(() => (hasApi ? cached() : []));
  useEffect(() => {
    if (!hasApi) return;
    let alive = true;
    const load = () =>
      fetchNews()
        .then(({ news: fresh }) => {
          if (!alive) return;
          setNews(fresh);
          try {
            localStorage.setItem(KEY, JSON.stringify(fresh));
          } catch {
            /* sin almacenamiento: solo se pierde la carga instantánea */
          }
        })
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
