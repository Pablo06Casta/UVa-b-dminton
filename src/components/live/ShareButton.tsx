import { useState } from 'react';
import { hasApi, shareUrl } from '../../lib/api';
import type { UvaMatch } from '../../types';
import { Icon } from '../Icon';

/** Comparte un partido: hoja de compartir del móvil o, si no existe, copia el enlace. */
export function ShareButton({ match, tournament }: { match: UvaMatch; tournament: string }) {
  const [note, setNote] = useState('');

  async function share() {
    const url = hasApi ? shareUrl(match.id) : `${location.origin}${location.pathname}?partido=${encodeURIComponent(match.id)}`;
    const title = `${match.players.join(' / ')} · ${match.event ?? tournament}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} (${tournament})`, url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote('Enlace copiado');
    } catch {
      setNote(url);
    }
    setTimeout(() => setNote(''), 4000);
  }

  return (
    <span className="share">
      <button type="button" className="link-button" onClick={share}>
        <Icon name="external" size={16} /> Compartir
      </button>
      {note && <span className="share__note" role="status">{note}</span>}
    </span>
  );
}
