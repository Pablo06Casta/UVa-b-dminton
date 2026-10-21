import type { UvaResult } from '../../types';

const medal = { 1: 'Oro', 2: 'Plata', 3: 'Bronce' } as const;

/** Medallas y resultados de la UVa en un torneo, por prueba. Solo personas con consentimiento (el servidor ya filtra). */
export function UvaResults({ results }: { results: UvaResult[] }) {
  const medals = results.filter((r) => r.place);
  const rest = results.filter((r) => !r.place);
  return (
    <div className="uvares">
      {medals.length > 0 && (
        <ul className="podium" aria-label="Podio de la UVa">
          {medals.map((r) => (
            <li key={`${r.event}-${r.entrant}`} className={`podium__item podium__item--${r.place}`}>
              <span className="podium__medal">{medal[r.place!]}</span>
              <span className="podium__who">
                <strong>{r.entrant}</strong>
                <span> · {r.event}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="uvares__list">
          {rest.map((r) => (
            <li key={`${r.event}-${r.entrant}`}>
              <strong>{r.entrant}</strong> · {r.event}: {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const hasMedals = (results?: UvaResult[]) => !!results?.some((r) => r.place);
