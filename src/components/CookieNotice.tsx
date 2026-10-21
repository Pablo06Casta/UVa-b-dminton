import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'uva-cookies-aviso';

const seen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Aviso de cookies. La web no usa cookies de seguimiento ni analítica: solo almacenamiento técnico (avisos de partido).
 * Si algún día se añade analítica u otro servicio de terceros, este aviso debe pasar a pedir consentimiento previo.
 */
export function CookieNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sin almacenamiento: el aviso volverá a salir, sin más */
    }
    setOpen(false);
  };

  return (
    <section className="cookies" role="region" aria-label="Aviso de cookies">
      <p>
        Esta web <strong>no usa cookies de seguimiento ni de publicidad</strong>. Solo guarda en tu navegador lo imprescindible para
        funcionar (por ejemplo, tus avisos de partido). <Link to="/legal#cookies">Más información</Link>
      </p>
      <button type="button" className="btn btn--light btn--small" onClick={close}>
        Entendido
      </button>
    </section>
  );
}
