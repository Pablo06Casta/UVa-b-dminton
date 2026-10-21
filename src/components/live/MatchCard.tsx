import { clock, lateness } from '../../lib/live';
import type { UvaMatch } from '../../types';
import { SetScores } from '../tournaments/SetScores';
import { ShareButton } from './ShareButton';

const stateLabel = { scheduled: 'Programado', live: 'En juego', finished: 'Finalizado' } as const;

export function MatchCard({ match: m, tournament, highlight }: { match: UvaMatch; tournament: string; highlight?: boolean }) {
  const late = lateness(m);
  return (
    <li id={`partido-${m.id}`} className={`mcard mcard--${m.state}${m.outcome ? ` mcard--${m.outcome}` : ''}${highlight ? ' is-highlight' : ''}`}>
      <div className="mcard__top">
        <p className="mcard__players">{m.players.join(' / ')}{m.opponent && <span> vs {m.opponent}</span>}</p>
        <span className={`status status--${m.state === 'live' ? 'ongoing' : m.state === 'scheduled' ? 'upcoming' : 'finished'}`}>{stateLabel[m.state]}</span>
      </div>
      <p className="mcard__meta">{[m.event, m.court && `Pista ${m.court}`].filter(Boolean).join(' · ')}</p>

      {m.state === 'finished' && (
        <p className="mcard__result">
          {m.outcome && <strong className="mcard__outcome">{m.outcome === 'win' ? 'Victoria' : 'Derrota'}</strong>}
          {m.score ? <SetScores score={m.score} /> : <span className="mcard__score">Resultado pendiente de publicar</span>}
        </p>
      )}

      {m.state === 'scheduled' && (
        <p className="mcard__time">
          {m.estimatedStart ? (
            <>
              <span className="mcard__est"><abbr className="est" title="Estimación">EST</abbr> {clock(m.estimatedStart)}</span>
              {m.plannedStart && <> · programado {clock(m.plannedStart)}</>}
              {late !== undefined && Math.abs(late) >= 5 && <span className={late > 0 ? 'late' : 'early'}> ({late > 0 ? '+' : ''}{late} min)</span>}
            </>
          ) : m.plannedStart ? (
            <>Programado {clock(m.plannedStart)}</>
          ) : (
            m.time && <>Programado {m.time}</>
          )}
        </p>
      )}
      <ShareButton match={m} tournament={tournament} />
    </li>
  );
}
