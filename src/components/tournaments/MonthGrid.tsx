import { Link } from 'react-router-dom';
import { dayOfMonth, formatMonth, monthGrid } from '../../lib/dates';
import { getStatus, indexByDay } from '../../lib/tournaments';
import type { Tournament } from '../../types';
import { tournamentHref } from './TournamentCard';

const weekdays = [
  ['Lunes', 'L'],
  ['Martes', 'M'],
  ['Miércoles', 'X'],
  ['Jueves', 'J'],
  ['Viernes', 'V'],
  ['Sábado', 'S'],
  ['Domingo', 'D'],
] as const;

/**
 * Vista mensual. En escritorio cada torneo es una etiqueta enlazada a su ficha; en móvil las etiquetas se
 * sustituyen por un punto y la consulta se hace en la agenda del mes que aparece debajo (ver CalendarPage).
 */
export function MonthGrid({ month, tournaments, today }: { month: string; tournaments: Tournament[]; today: string }) {
  const byDay = indexByDay(tournaments);
  const cells = monthGrid(month);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div className="month">
      <table className="month__table">
        <caption className="sr-only">Competiciones de {formatMonth(month)}</caption>
        <thead>
          <tr>
            {weekdays.map(([full, short]) => (
              <th key={full} scope="col">
                <abbr title={full}>{short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].iso}>
              {week.map(({ iso, inMonth }) => {
                const events = byDay.get(iso) ?? [];
                return (
                  <td
                    key={iso}
                    className={`month__cell${inMonth ? '' : ' is-outside'}${iso === today ? ' is-today' : ''}`}
                  >
                    <span className="month__num">
                      {dayOfMonth(iso)}
                      {iso === today && <span className="sr-only"> (hoy)</span>}
                    </span>
                    {events.length > 0 && <span className="month__dot" aria-hidden="true" />}
                    {events.map((t) => (
                      <Link key={t.id} to={tournamentHref(t)} className={`chip chip--${getStatus(t, today)}`}>
                        {t.name}
                      </Link>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
