import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTournaments } from '../../hooks/useTournaments';
import { formatDateRange, toISO } from '../../lib/dates';
import { clock, liveTournaments, summarize, type LiveSummary } from '../../lib/live';
import type { UvaMatch } from '../../types';
import { SectionHeading } from '../ui';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const who = (m: UvaMatch) => `${m.players.join(' / ')}${m.opponent ? ` vs ${m.opponent}` : ''}`;
const where = (m: UvaMatch) => [m.event, m.court ? `Pista ${m.court}` : ''].filter(Boolean).join(' · ');

function Card({ s }: { s: LiveSummary }) {
  const t = s.tournament;
  const p = t.progress;
  const total = p?.total ?? 0;
  return (
    <article className="lnow__card" aria-labelledby={`ln-${t.id}`}>
      <header>
        <h3 id={`ln-${t.id}`}>{t.name}</h3>
        <p>{formatDateRange(t.startDate, t.endDate)} · {t.city}</p>
      </header>

      <section aria-label="En juego ahora">
        <h4><span className={`livenow__dot${s.playing.length > 0 ? ' is-on' : ''}`} aria-hidden="true" /> Jugando ahora</h4>
        {s.playing.length > 0 ? (
          <ul>{s.playing.map((m) => <li key={m.id}><strong>{who(m)}</strong><span>{where(m)}</span></li>)}</ul>
        ) : (
          <p className="lnow__empty">Ahora mismo no hay ningún partido de la UVa en pista.</p>
        )}
      </section>

      {s.next.length > 0 && (
        <section aria-label="Próximos partidos">
          <h4>Próximos</h4>
          <ul>
            {s.next.map((m) => {
              const at = m.estimatedStart ?? m.plannedStart;
              return (
                <li key={m.id}>
                  <strong>{at ? <>{m.estimatedStart && <abbr className="est" title="Estimación">EST</abbr>} {clock(at)}</> : m.time ?? '—'}</strong>
                  <span>{who(m)} · {where(m)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="lnow__score">
        {s.finished > 0 ? <>Hoy: <strong>{plural(s.won, 'victoria', 'victorias')}</strong> y <strong>{plural(s.lost, 'derrota', 'derrotas')}</strong> en {plural(s.finished, 'partido terminado', 'partidos terminados')}.</> : 'Aún no ha terminado ningún partido de la UVa hoy.'}
        {s.pending > 0 && <> Quedan {plural(s.pending, 'partido', 'partidos')} del club.</>}
      </p>

      {p && !p.done && total > 0 && (
        <p className="lnow__prog">
          Torneo: {p.finished} de {total} partidos terminados · {p.remaining + p.live} por jugar
          {p.estimatedEnd && <> · fin estimado <abbr className="est" title="Estimación">EST</abbr> {clock(p.estimatedEnd)}</>}
        </p>
      )}
      <Link className="lnow__more" to={`/directo?torneo=${encodeURIComponent(t.id)}`}>Ver el directo completo</Link>
    </article>
  );
}

/** «En directo» en Inicio: resumen de los torneos que se están jugando hoy. Desaparece cuando no hay ninguno o acaban. */
export function LiveNow() {
  const { tournaments } = useTournaments();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const today = toISO(now);
  const live = liveTournaments(tournaments, today);
  if (live.length === 0) return null;
  return (
    <section className="section lnow" aria-labelledby="lnow-title" aria-live="polite">
      <div className="container">
        <SectionHeading sport id="lnow-title" eyebrow="En directo" title="Así vamos en los torneos" lead="Resumen en directo de los torneos que se están jugando ahora con jugadores de la UVa." />
        <div className="lnow__grid">{live.map((t) => <Card key={t.id} s={summarize(t, today)} />)}</div>
      </div>
    </section>
  );
}
