import { useEffect } from 'react';
import { club } from '../config/site';

const siteTitle = `${club.name} ${club.university}`;
const DEFAULT_DESCRIPTION = 'Web del Club Bádminton Universidad de Valladolid: el club, su historia, el calendario de competiciones y contacto.';

const setMeta = (selector: string, value: string) => document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value);

/** Título y descripción de la página (pestaña, buscadores y vista previa al compartir). */
export function usePageTitle(title?: string, description?: string) {
  useEffect(() => {
    const full = title ? `${title} · ${siteTitle}` : siteTitle;
    const desc = description ?? DEFAULT_DESCRIPTION;
    document.title = full;
    setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:title"]', full);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[name="twitter:title"]', full);
    setMeta('meta[name="twitter:description"]', desc);
  }, [title, description]);
}
