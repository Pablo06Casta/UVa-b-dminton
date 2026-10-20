import { useEffect } from 'react';
import { club } from '../config/site';

const siteTitle = `${club.name} ${club.university}`;

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${siteTitle}` : siteTitle;
  }, [title]);
}
