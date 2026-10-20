import { formatDay } from '../../lib/dates';
import type { UvaMatch } from '../../types';

const stateLabel: Record<UvaMatch['state'], string> = {
  scheduled: 'Programado',
  live: 'En juego',
  finished: 'Finalizado',
};

export function MatchRow({ match: m, tournamentName }: { match: UvaMatch; tournamentName?: string }) {
  return (
    <li className={`match match--${m.state}${m.outcome ? ` match--${m.outcome}` : ''}`}>
      <div className="match__main">
        {tournamentName && <p className="match__tournament">{tournamentName}</p>}
        <p className="match__players">
          <strong>{m.players.join(' / ')}</strong>
          {m.opponent && <span> vs {m.opponent}</span>}
        </p>
        <p className="match__meta">
          {[m.event, m.date && formatDay(m.date), m.time, m.court && `Pista ${m.court}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="match__result">
        {m.state === 'finished' ? (
          <>
            {m.outcome && <span className="match__outcome">{m.outcome === 'win' ? 'Victoria' : 'Derrota'}</span>}
            <span className="match__score">{m.score ?? 'Resultado pendiente de publicar'}</span>
          </>
        ) : (
          <span className={`status status--${m.state === 'live' ? 'ongoing' : 'upcoming'}`}>{stateLabel[m.state]}</span>
        )}
      </div>
    </li>
  );
}

export function MatchList({ matches }: { matches: UvaMatch[] }) {
  const ordered = [...matches].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? ''));
  return (
    <ul className="matches">
      {ordered.map((m) => (
        <MatchRow key={m.id} match={m} />
      ))}
    </ul>
  );
}
