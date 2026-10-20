import { Link } from 'react-router-dom';
import { dayOfMonth, formatDateRange, parseISO, shortMonth } from '../../lib/dates';
import { getStatus, hasUvaPlayers, statusLabels } from '../../lib/tournaments';
import type { Tournament } from '../../types';
import { Icon } from '../Icon';
import { PendingTag } from '../ui';

export const tournamentHref = (t: Tournament) => `/calendario?torneo=${encodeURIComponent(t.id)}`;

export function StatusBadge({ tournament }: { tournament: Tournament }) {
  const status = getStatus(tournament);
  return <span className={`status status--${status}`}>{statusLabels[status]}</span>;
}

export function participantsText(t: Tournament): string {
  if (!hasUvaPlayers(t)) return 'Sin jugadores de la UVa registrados';
  const n = t.clubParticipants ?? t.players?.length;
  if (n === undefined) return 'Jugadores de la UVa (número por confirmar)';
  return n === 1 ? '1 jugador de la UVa' : `${n} jugadores de la UVa`;
}

export function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  const multiDay = t.endDate && t.endDate !== t.startDate;
  return (
    <article className="t-card">
      <time className="t-card__date" dateTime={t.startDate}>
        <span className="t-card__day">
          {dayOfMonth(t.startDate)}
          {multiDay && <span className="t-card__day-end">–{dayOfMonth(t.endDate!)}</span>}
        </span>
        <span className="t-card__month">{shortMonth(t.startDate)}</span>
        <span className="t-card__year">{parseISO(t.startDate).getFullYear()}</span>
      </time>

      <div className="t-card__body">
        <div className="t-card__tags">
          <StatusBadge tournament={t} />
          {hasUvaPlayers(t) && <span className="uva-tag">UVa</span>}
          {t.provisional && <PendingTag />}
        </div>
        <h3 className="t-card__title">
          <Link to={tournamentHref(t)} className="t-card__link">
            {t.name}
          </Link>
        </h3>
        <ul className="meta">
          <li>
            <Icon name="calendar" size={16} />
            {formatDateRange(t.startDate, t.endDate)}
          </li>
          <li>
            <Icon name="pin" size={16} />
            {t.city}
          </li>
          {t.venue && (
            <li>
              <Icon name="building" size={16} />
              {t.venue}
            </li>
          )}
          <li>
            <Icon name="users" size={16} />
            {participantsText(t)}
          </li>
          {t.players && t.players.length > 0 && (
            <li className="meta__players">
              <span className="sr-only">Jugadores de la UVa: </span>
              {t.players.join(', ')}
            </li>
          )}
        </ul>
      </div>
    </article>
  );
}
