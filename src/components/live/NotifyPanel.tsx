import { useState } from 'react';
import { activeAlerts, disableAlert, enableAlert, pushSupported, type EnableResult } from '../../lib/push';
import type { LiveState } from '../../types';
import { Icon } from '../Icon';
import { Notice } from '../ui';

const messages: Record<EnableResult, string> = {
  ok: 'Aviso activado.',
  unsupported: 'Este navegador no admite notificaciones. En iPhone, añade primero la web a la pantalla de inicio.',
  denied: 'Has bloqueado las notificaciones para esta web. Actívalas en los ajustes del navegador.',
  disabled: 'Los avisos aún no están activados en el servidor.',
  error: 'No se ha podido activar el aviso. Inténtalo de nuevo.',
};

/** Avisos opcionales antes del partido de un jugador concreto. */
export function NotifyPanel({ live }: { live: LiveState }) {
  const [alerts, setAlerts] = useState(activeAlerts);
  const [minutes, setMinutes] = useState(20);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  if (live.players.length === 0) return null;

  async function toggle(id: number) {
    setBusy(id);
    if (alerts[id]) {
      await disableAlert(id);
      setMsg('Aviso desactivado.');
    } else {
      setMsg(messages[await enableAlert(id, minutes)]);
    }
    setAlerts(activeAlerts());
    setBusy(null);
  }

  return (
    <section aria-labelledby="notify-title" className="notify">
      <h2 id="notify-title">Avisos antes del partido</h2>
      {!live.pushEnabled ? (
        <Notice title="Avisos no disponibles todavía">El servidor aún no tiene activadas las notificaciones.</Notice>
      ) : (
        <>
          <p className="lead">Recibe una notificación unos minutos antes de que empiece el partido de un jugador. Es opcional y puedes quitarla cuando quieras.</p>
          {!pushSupported() && <Notice kind="warning" title="Este navegador no admite avisos">En iPhone y iPad hay que añadir la web a la pantalla de inicio para recibirlos.</Notice>}
          <label className="notify__minutes">
            <span>Avisar con</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[10, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos de antelación</option>)}
            </select>
          </label>
          <ul className="notify__list">
            {live.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}{p.category && <small> · {p.category}</small>}</span>
                <button type="button" className={`btn btn--small ${alerts[p.id] ? 'btn--primary' : 'btn--secondary'}`} onClick={() => toggle(p.id)} disabled={busy === p.id} aria-pressed={!!alerts[p.id]}>
                  <Icon name="check" size={16} /> {alerts[p.id] ? `Aviso activo (${alerts[p.id]} min)` : 'Avisarme'}
                </button>
              </li>
            ))}
          </ul>
          <p className="notify__msg" role="status">{msg}</p>
        </>
      )}
    </section>
  );
}
