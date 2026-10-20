import type { LiveDraw, LiveEntrant } from '../../types';

const Entrant = ({ e }: { e: LiveEntrant }) => (
  <span className={`entrant${e.uva ? ' entrant--uva' : ''}${e.bye ? ' entrant--bye' : ''}`}>
    {e.bye ? 'Bye' : e.placeholder && !e.label ? e.placeholder : e.label || '—'}
    {e.club && !e.uva && <small> · {e.club}</small>}
  </span>
);

function Group({ draw }: { draw: LiveDraw }) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <caption className="sr-only">Clasificación de {draw.name}</caption>
        <thead>
          <tr><th>#</th><th>Jugador/a o pareja</th><th>PJ</th><th>G</th><th>P</th><th>Partidos</th><th>Juegos</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {draw.standings?.map((s) => (
            <tr key={s.rank + s.entrant.label} className={s.entrant.uva ? 'is-uva' : undefined}>
              <td>{s.rank}</td>
              <td><Entrant e={s.entrant} /></td>
              <td>{s.played}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.matches}</td><td>{s.games}</td><td><strong>{s.pts}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bracket({ draw }: { draw: LiveDraw }) {
  return (
    <div className="bracket" role="group" aria-label={`Cuadro ${draw.name}`}>
      {draw.rounds?.map((round) => (
        <div key={round.title} className="bracket__round">
          <h4>{round.title}</h4>
          <ul>
            {round.matches.map((m, i) => (
              <li key={i} className={`bmatch${m.a.uva || m.b.uva ? ' is-uva' : ''}`}>
                <p className={m.winner === 1 ? 'is-winner' : undefined}><Entrant e={m.a} /></p>
                <p className={m.winner === 2 ? 'is-winner' : undefined}><Entrant e={m.b} /></p>
                <p className="bmatch__meta">
                  {m.sets.length > 0 ? m.sets.map((s) => s.join('-')).join(' ') : m.when ?? ''}
                  {m.note && ` · ${m.note}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Grupos y cuadros donde juega alguien de la UVa. Las demás personas se muestran con iniciales. */
export function DrawsView({ draws }: { draws: LiveDraw[] }) {
  if (draws.length === 0) return null;
  return (
    <section aria-labelledby="draws-title" className="draws">
      <h2 id="draws-title">Grupos y cuadros</h2>
      <p className="lead">Solo los cuadros donde juegan jugadores de la UVa. Resaltados, los de la UVa; el resto, con iniciales.</p>
      {draws.map((d) => (
        <article key={d.id} className="draw">
          <h3>{d.name}</h3>
          {d.type === 'roundrobin' ? <Group draw={d} /> : <Bracket draw={d} />}
        </article>
      ))}
    </section>
  );
}
