import { useRef, useState } from 'react';
import { hasApi, shareImageUrl, shareUrl, type ShareKind } from '../../lib/api';
import { Icon } from '../Icon';

/**
 * Menú «Compartir» de un partido, un torneo o sus resultados. Con servidor, el enlace enseña una vista previa deportiva en WhatsApp,
 * Telegram o X, y hay imágenes para publicar en Instagram (cuadrada) o en una historia (vertical).
 */
export function ShareMenu({ kind, id, title, label = 'Compartir' }: { kind: ShareKind; id: string; title: string; label?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [note, setNote] = useState('');
  const url = hasApi ? shareUrl(id, kind) : `${location.origin}${location.pathname}${kind === 'partido' ? `?partido=${encodeURIComponent(id)}` : `?torneo=${encodeURIComponent(id)}`}`;
  const close = () => ref.current?.removeAttribute('open');
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(''), 3500);
  };

  async function native() {
    close();
    try {
      await navigator.share({ title, text: title, url });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') flash(url);
    }
  }
  async function copy() {
    close();
    try {
      await navigator.clipboard.writeText(url);
      flash('Enlace copiado');
    } catch {
      flash(url);
    }
  }

  return (
    <span className="sharemenu">
      <details ref={ref}>
        <summary className="link-button">
          <Icon name="external" size={16} /> {label}
        </summary>
        <ul className="sharemenu__list">
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <li>
              <button type="button" onClick={native}>Enviar…</button>
            </li>
          )}
          <li>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={close}>
              WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </li>
          <li>
            <button type="button" onClick={copy}>Copiar enlace</button>
          </li>
          {hasApi && (
            <>
              <li>
                <a href={shareImageUrl(id, kind, 'square')} target="_blank" rel="noopener noreferrer" onClick={close}>
                  Imagen para Instagram<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </li>
              <li>
                <a href={shareImageUrl(id, kind, 'story')} target="_blank" rel="noopener noreferrer" onClick={close}>
                  Imagen para historia<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              </li>
            </>
          )}
        </ul>
      </details>
      {note && <span className="share__note" role="status">{note}</span>}
    </span>
  );
}
