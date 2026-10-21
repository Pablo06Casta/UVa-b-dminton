import type { TournamentEntry } from '../../types';

const label: Record<TournamentEntry['status'], string> = {
  admitted: 'Admitido',
  reserve: 'Reserva',
  excluded: 'No admitido (lista de exclusión)',
  registered: 'Inscrito (sin confirmar)',
};

/** Resumen corto para las tarjetas: «3 admitidas · 1 en reserva». */
export function entrySummary(entries?: TournamentEntry[]): string | undefined {
  if (!entries || entries.length === 0) return undefined;
  const n = (s: TournamentEntry['status']) => entries.filter((e) => e.status === s).length;
  const parts = [
    n('admitted') && `${n('admitted')} ${n('admitted') === 1 ? 'admitida' : 'admitidas'}`,
    n('reserve') && `${n('reserve')} en reserva`,
    n('registered') && `${n('registered')} sin confirmar`,
    n('excluded') && `${n('excluded')} ${n('excluded') === 1 ? 'baja' : 'bajas'}`,
  ].filter(Boolean);
  return `Inscripciones: ${parts.join(' · ')}`;
}

/** Inscripción y admisión de las personas del club en cada prueba, según las listas oficiales de inscritos. */
export function EntriesList({ entries, note = true }: { entries: TournamentEntry[]; note?: boolean }) {
  const byPlayer = new Map<string, TournamentEntry[]>();
  for (const e of entries) byPlayer.set(e.player, [...(byPlayer.get(e.player) ?? []), e]);
  return (
    <div className="entries">
      <ul className="entries__list">
        {[...byPlayer].map(([player, list]) => (
          <li key={player}>
            <strong>{player}</strong>
            <span className="entries__chips">
              {list.map((e) => (
                <span key={e.event} className={`entry entry--${e.status}`}>
                  {e.event} · {label[e.status]}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {note && (
        <p className="entries__note">
          Según las listas oficiales de inscritos, que se revisan cada pocas horas. Los cuadros y el orden de juego se publican más cerca del torneo y aparecerán aquí
          automáticamente.
        </p>
      )}
    </div>
  );
}
