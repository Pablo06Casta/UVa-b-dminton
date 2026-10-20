import { getUpcoming } from '../../lib/tournaments';
import { useTournaments } from '../../hooks/useTournaments';
import { TournamentCard } from '../tournaments/TournamentCard';
import { ButtonLink, SectionHeading } from '../ui';

export function UpcomingSection() {
  const { status, tournaments } = useTournaments();
  const upcoming = getUpcoming(tournaments, 3);

  return (
    <section className="section section--gray" aria-labelledby="torneos-title">
      <div className="container">
        <SectionHeading
          id="torneos-title"
          eyebrow="Competición"
          title="Próximas competiciones"
          lead="Los próximos torneos en los que participa el club."
        />
        <div aria-live="polite">
          {status === 'loading' && <p className="empty">Cargando competiciones…</p>}
          {status === 'error' && <p className="empty">No se han podido cargar las competiciones.</p>}
          {status === 'ready' && upcoming.length === 0 && (
            <p className="empty">Todavía no hay competiciones próximas registradas.</p>
          )}
        </div>
        {upcoming.length > 0 && (
          <div className="t-grid">
            {upcoming.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
        <div className="section__cta">
          <ButtonLink to="/calendario" arrow>
            Ver calendario completo
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
