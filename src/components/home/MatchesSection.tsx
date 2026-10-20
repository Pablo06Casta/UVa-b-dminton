import { useTournaments } from '../../hooks/useTournaments';
import { recentResults, upcomingMatches } from '../../lib/tournaments';
import { MatchRow } from '../tournaments/MatchList';
import { SectionHeading } from '../ui';

/** Próximos partidos y últimos resultados de jugadores de la UVa. Se oculta si el club no ha registrado ninguno. */
export function MatchesSection() {
  const { tournaments } = useTournaments();
  const next = upcomingMatches(tournaments, 5);
  const done = recentResults(tournaments, 5);
  if (next.length === 0 && done.length === 0) return null;

  return (
    <section className="section" aria-labelledby="partidos-title">
      <div className="container">
        <SectionHeading
          sport
          id="partidos-title"
          eyebrow="Competición"
          title="Partidos y resultados"
          lead="Próximos partidos y últimos resultados de jugadores de la UVa."
        />
        <div className="matches-grid">
          {next.length > 0 && (
            <div>
              <h3>Próximos partidos</h3>
              <ul className="matches">
                {next.map(({ tournament, match }) => (
                  <MatchRow key={match.id} match={match} tournamentName={tournament.name} />
                ))}
              </ul>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h3>Últimos resultados</h3>
              <ul className="matches">
                {done.map(({ tournament, match }) => (
                  <MatchRow key={match.id} match={match} tournamentName={tournament.name} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
