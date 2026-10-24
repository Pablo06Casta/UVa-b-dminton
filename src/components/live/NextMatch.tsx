import { formatDay } from '../../lib/dates';
import { clock, nextInfo, spanText } from '../../lib/live';
import type { LiveProgress, UvaMatch } from '../../types';

/** Siguiente partido de la UVa: cuántos faltan, cuánto falta y las horas oficial y estimada. */
export function NextMatch({ match, progress, now }: { match: UvaMatch; progress?: LiveProgress; now: Date }) {
  const i = nextInfo(match, progress, now);
  const late = i.delay !== undefined && Math.abs(i.delay) >= 1;
  return (
    <section className="nextm" aria-labelledby="nextm-title">
      <h3 id="nextm-title">Siguiente partido de la UVa</h3>
      <p className="nextm__who">
        <strong>{match.players.join(' / ')}</strong>
        {match.event && <span> · {match.event}</span>}
        {match.court && <span> · Pista {match.court}</span>}
        {match.date && <span> · {formatDay(match.date)}</span>}
      </p>
      <dl className="nextm__grid">
        <div>
          <dt>Partidos antes del suyo</dt>
          <dd aria-live="polite">{i.ahead !== undefined ? i.ahead : '—'}</dd>
          {i.inPlay !== undefined && i.inPlay > 0 && <small>y {i.inPlay} en pista ahora</small>}
        </div>
        <div>
          <dt>Tiempo estimado</dt>
          <dd aria-live="polite">{i.minutes !== undefined ? (i.minutes === 0 ? 'Ya toca' : spanText(i.minutes)) : '—'}</dd>
          <small>hasta que empiece</small>
        </div>
        <div>
          <dt>Hora oficial</dt>
          <dd>{i.plannedAt ? clock(i.plannedAt) : match.time ?? '—'}</dd>
          <small>según el calendario</small>
        </div>
        <div className="is-est">
          <dt>Hora estimada</dt>
          <dd>{i.estimatedAt ? <><abbr className="est" title="Estimación">EST</abbr> {clock(i.estimatedAt)}</> : '—'}</dd>
          {late ? <small>{i.delay! > 0 ? `${i.delay} min más tarde` : `${-i.delay!} min antes`} que la oficial</small> : i.estimatedAt ? <small>como la oficial</small> : <small>aún sin estimación</small>}
        </div>
      </dl>
      {i.remaining !== undefined && <p className="nextm__rest">Quedan <strong>{i.remaining}</strong> partidos por jugar hoy en el torneo.</p>}
      <p className="nextm__note">
        Previsión estadística a partir del ritmo real del torneo; el modelo mide su acierto en cada jornada y se corrige solo. Puede variar.
      </p>
    </section>
  );
}
