import { useEffect, useRef } from 'react';
import { formatDateRange } from '../../lib/dates';
import { getStatus, hasUvaPlayers } from '../../lib/tournaments';
import type { Tournament } from '../../types';
import { Icon } from '../Icon';
import { PendingTag } from '../ui';
import { MatchList } from './MatchList';
import { StatusBadge, participantsText } from './TournamentCard';

const TBC = 'Por confirmar';

/** Ficha detallada de un torneo, en un <dialog> nativo (foco atrapado, Esc para cerrar). */
export function TournamentDialog({ tournament: t, onClose }: { tournament: Tournament | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (t && !dialog.open) dialog.showModal();
    if (!t && dialog.open) dialog.close();
  }, [t]);

  const finished = t ? getStatus(t) === 'finished' : false;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      {t && (
        <div className="dialog__inner">
          <button type="button" className="dialog__close" onClick={() => ref.current?.close()}>
            <Icon name="close" size={22} />
            <span className="sr-only">Cerrar ficha</span>
          </button>

          <div className="t-card__tags">
            <StatusBadge tournament={t} />
            {hasUvaPlayers(t) && <span className="uva-tag">Jugadores UVa</span>}
            {t.provisional && <PendingTag>Provisional · dato de ejemplo</PendingTag>}
          </div>
          <h2 id="dialog-title">{t.name}</h2>

          <dl className="facts">
            <div>
              <dt>Fecha</dt>
              <dd>{formatDateRange(t.startDate, t.endDate)}</dd>
            </div>
            <div>
              <dt>Localidad</dt>
              <dd>{t.city}</dd>
            </div>
            <div>
              <dt>Instalación</dt>
              <dd>{t.venue ?? TBC}</dd>
            </div>
            <div>
              <dt>Dirección</dt>
              <dd>{t.address ?? TBC}</dd>
            </div>
            <div>
              <dt>Ámbito</dt>
              <dd>{t.category ? `${t.category} · Absoluto` : TBC}</dd>
            </div>
            {t.level && (
              <div>
                <dt>Nivel oficial</dt>
                <dd>{t.level}</dd>
              </div>
            )}
            <div>
              <dt>Participación del club</dt>
              <dd>{participantsText(t)}</dd>
            </div>
            {hasUvaPlayers(t) && (
              <div className="facts__wide">
                <dt>Jugadores de la UVa</dt>
                <dd>
                  {t.players && t.players.length > 0
                    ? t.players.join(', ')
                    : 'Los nombres se publicarán cuando los jugadores (o sus familias, si son menores) lo autoricen.'}
                </dd>
              </div>
            )}
            {t.matches && t.matches.length > 0 && (
              <div className="facts__wide">
                <dt>Partidos de la UVa</dt>
                <dd>
                  <MatchList matches={t.matches} />
                </dd>
              </div>
            )}
            {finished && (
              <div className="facts__wide">
                <dt>Resultados</dt>
                <dd>{t.results ?? 'Resultados pendientes de incorporar.'}</dd>
              </div>
            )}
          </dl>

          {t.externalUrl && (
            <a className="btn btn--primary" href={t.externalUrl} target="_blank" rel="noopener noreferrer">
              {t.source === 'official' ? 'Ficha oficial en badminton.es' : 'Web del torneo'}
              <Icon name="external" size={18} />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}
        </div>
      )}
    </dialog>
  );
}
