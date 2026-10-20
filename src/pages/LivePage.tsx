import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DrawsView } from '../components/live/DrawsView';
import { EndEstimate } from '../components/live/EndEstimate';
import { MatchCard } from '../components/live/MatchCard';
import { NotifyPanel } from '../components/live/NotifyPanel';
import { Notice, PageHeader } from '../components/ui';
import { useTournaments } from '../hooks/useTournaments';
import { usePageTitle } from '../hooks/usePageTitle';
import { hasApi } from '../lib/api';
import { toISO, formatDateRange } from '../lib/dates';
import { boardOf, clock, clockSec, pickActive } from '../lib/live';
import type { Tournament } from '../types';

export function LivePage() {
  usePageTitle('Directo');
  const { status, tournaments, live, liveError, refreshedAt } = useTournaments();
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState<string>();
  const today = toISO(new Date());

  const candidates = useMemo(() => tournaments.filter((t) => t.liveId), [tournaments]);
  const active: Tournament | undefined = candidates.find((t) => t.id === chosen) ?? pickActive(tournaments, today);
  const board = useMemo(() => boardOf((active?.matches ?? []).map((match) => ({ tournament: active!, match }))), [active]);
  const highlight = params.get('partido');

  useEffect(() => {
    if (highlight) document.getElementById(`partido-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight, status, active?.id]);

  return (
    <>
      <PageHeader sport title="Directo" lead="Partidos que se juegan ahora, resultados y próximos partidos de los jugadores de la UVa." />
      <div className="section">
        <div className="container live">
          {!hasApi && (
            <Notice kind="warning" title="Sin conexión con el servidor en directo">
              Esta web todavía no está conectada al servidor del club, por lo que no hay partidos ni resultados en directo.
            </Notice>
          )}
          {hasApi && liveError && (
            <Notice kind="warning" title="No se puede contactar con el servidor">
              Se muestran los últimos datos conocidos. Se volverá a intentar automáticamente.
            </Notice>
          )}
          {live && !live.officialReadEnabled && (
            <Notice title="Lectura automática de badminton.es desactivada">
              De momento no se actualizan partidos ni cuadros de forma automática.
            </Notice>
          )}

          {status === 'ready' && hasApi && (
            <p className="live__stamp" aria-live="polite">
              Se actualiza cada 5 minutos · Comprobado en esta pantalla a las {refreshedAt ? clockSec(refreshedAt) : '—'}
            </p>
          )}

          {candidates.length > 1 && (
            <label className="live__select">
              <span>Torneo</span>
              <select value={active?.id ?? ''} onChange={(e) => setChosen(e.target.value)}>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {formatDateRange(t.startDate, t.endDate)}</option>
                ))}
              </select>
            </label>
          )}

          {status === 'loading' && <p className="empty">Cargando…</p>}
          {status === 'ready' && !active && hasApi && !liveError && (
            <Notice title="Todavía no hay torneos con jugadores de la UVa en seguimiento">
              Cuando un jugador del club tenga torneo, aparecerá aquí con sus partidos y la hora estimada de fin.
            </Notice>
          )}

          {active && (
            <>
              <header className="live__head">
                <h2>{active.name}</h2>
                <p>{formatDateRange(active.startDate, active.endDate)} · {active.city}{active.venue ? ` · ${active.venue}` : ''}</p>
                {active.stale && (
                  <Notice kind="warning" title="Datos antiguos">
                    La última lectura correcta de este torneo fue a las {active.checkedAt ? clock(active.checkedAt) : '—'}. No se muestran como «en directo» hasta que vuelva a actualizarse.
                  </Notice>
                )}
              </header>

              <EndEstimate tournament={active} />

              <div className="board">
                <section aria-labelledby="b-live">
                  <h3 id="b-live">En juego <span className="count-pill">{board.live.length}</span></h3>
                  <ul className="mlist">
                    {board.live.map(({ match }) => <MatchCard key={match.id} match={match} tournament={active.name} highlight={match.id === highlight} />)}
                  </ul>
                  {board.live.length === 0 && <p className="empty">Ningún partido de la UVa se está jugando ahora.</p>}
                </section>
                <section aria-labelledby="b-next">
                  <h3 id="b-next">Próximos <span className="count-pill">{board.next.length}</span></h3>
                  <ul className="mlist">
                    {board.next.map(({ match }) => <MatchCard key={match.id} match={match} tournament={active.name} highlight={match.id === highlight} />)}
                  </ul>
                  {board.next.length === 0 && <p className="empty">No hay más partidos programados.</p>}
                </section>
                <section aria-labelledby="b-done">
                  <h3 id="b-done">Resultados <span className="count-pill">{board.done.length}</span></h3>
                  <ul className="mlist">
                    {board.done.map(({ match }) => <MatchCard key={match.id} match={match} tournament={active.name} highlight={match.id === highlight} />)}
                  </ul>
                  {board.done.length === 0 && <p className="empty">Aún no hay resultados.</p>}
                </section>
              </div>

              <DrawsView draws={active.draws ?? []} />
              {active.officialUrl && (
                <p className="source-note"><a href={active.officialUrl} target="_blank" rel="noopener noreferrer">Ver el torneo completo en badminton.es<span className="sr-only"> (se abre en una pestaña nueva)</span></a></p>
              )}
            </>
          )}

          {live && <NotifyPanel live={live} />}
        </div>
      </div>
    </>
  );
}
