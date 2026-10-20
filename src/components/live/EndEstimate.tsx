import { clock, clockSec } from '../../lib/live';
import type { LiveProgress, Tournament } from '../../types';

const n1 = (x: number) => x.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** Hora estimada de fin del torneo, en grande, con el ritmo en que se basa. */
export function EndEstimate({ tournament: t }: { tournament: Tournament }) {
  const p: LiveProgress | undefined = t.progress;
  const stamp = p?.asOf ?? t.checkedAt;

  return (
    <section className="estimate" aria-labelledby="estimate-title">
      <h2 id="estimate-title" className="estimate__label">
        {p?.done ? 'Torneo terminado' : 'Hora estimada de fin del torneo'}
      </h2>

      {!p && <p className="estimate__none">Todavía no hay datos del orden de juego de este torneo.</p>}

      {p && (
        <>
          <p className="estimate__time" aria-live="polite">
            {p.done ? (p.estimatedEnd ? clock(p.estimatedEnd) : '—') : p.estimatedEnd ? <>≈ {clock(p.estimatedEnd)}</> : '—'}
          </p>
          {!p.done && p.estimatedEndLow && p.estimatedEndHigh && (
            <p className="estimate__range">Margen probable: entre las {clock(p.estimatedEndLow)} y las {clock(p.estimatedEndHigh)}</p>
          )}

          <div className="progress" role="img" aria-label={`${p.finished} de ${p.total} partidos terminados`}>
            <div className="progress__bar" style={{ width: `${p.total ? Math.round((p.finished / p.total) * 100) : 0}%` }} />
          </div>
          <p className="estimate__count">
            {p.finished} de {p.total} partidos terminados · {p.live} en juego · {p.remaining} por jugar
          </p>

          <dl className="estimate__facts">
            <div>
              <dt>Duración media</dt>
              <dd>{p.avgDurationMin !== undefined ? `${n1(p.avgDurationMin)} min` : 'sin datos'}</dd>
            </div>
            <div>
              <dt>Reserva por partido</dt>
              <dd>{p.plannedSlotMin !== undefined ? `${p.plannedSlotMin} min` : 'sin datos'}</dd>
            </div>
            <div>
              <dt>Retraso medio al empezar</dt>
              <dd>{p.delayMin !== undefined ? `${p.delayMin > 0 ? '+' : ''}${p.delayMin} min` : 'sin datos'}</dd>
            </div>
            <div>
              <dt>Pistas</dt>
              <dd>{p.courts}</dd>
            </div>
          </dl>

          <p className="estimate__note">
            {p.basis === 'manual'
              ? 'Estimación a partir de las cifras que anota el club durante la jornada (partidos totales, terminados, en juego y pistas).'
              : p.basis === 'default'
              ? 'Aún no hay partidos terminados de los que aprender: se supone una duración típica por partido.'
              : 'Estimación estadística a partir de lo que han tardado los partidos ya terminados, el retraso respecto a lo programado, los partidos que quedan y las pistas disponibles.'}{' '}
            Es una previsión: puede variar.
          </p>
        </>
      )}
      {stamp && <p className="estimate__stamp">Última actualización: {clockSec(stamp)}</p>}
    </section>
  );
}
