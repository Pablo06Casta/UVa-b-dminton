import { useMemo } from 'react';
import { clock } from '../../lib/live';
import type { LiveDraw, LiveEntrant } from '../../types';

type Round = NonNullable<LiveDraw['rounds']>[number];
type BMatch = Round['matches'][number];

const EVENT_NAME: Record<string, string> = {
  IM: 'Individual masculino',
  IF: 'Individual femenino',
  DM: 'Dobles masculino',
  DF: 'Dobles femenino',
  DX: 'Dobles mixto',
};
export const eventName = (base: string) => {
  const head = base.slice(0, 2).toUpperCase();
  const rest = base.slice(2).trim();
  return EVENT_NAME[head] ? `${EVENT_NAME[head]}${rest ? ` · ${rest}` : ''}` : base;
};

const label = (e: LiveEntrant) => (e.bye ? 'Bye' : e.label || e.placeholder || '—');

function Entrant({ e }: { e: LiveEntrant }) {
  return (
    <span className={`entrant${e.uva ? ' entrant--uva' : ''}${e.bye ? ' entrant--bye' : ''}${!e.label && e.placeholder ? ' entrant--tbd' : ''}`}>
      {label(e)}
      {e.club && !e.uva && !e.bye && <small> · {e.club}</small>}
    </span>
  );
}

/** Marcador de un partido: un número por set y por jugador. */
function Score({ m, side }: { m: BMatch; side: 0 | 1 }) {
  if (m.sets.length === 0) return m.winner && m.note ? <span className="bk__wo">{side === (m.winner === 1 ? 1 : 0) ? 'W.O.' : ''}</span> : null;
  return (
    <span className="bk__sets">
      {m.sets.map((s, i) => (
        <b key={i} className={s[side] > s[1 - side] ? 'is-won' : undefined}>{s[side]}</b>
      ))}
    </span>
  );
}

function MatchBox({ m }: { m: BMatch }) {
  const done = m.sets.length > 0 || (m.winner && m.note);
  return (
    <li className={`bk__match${m.a.uva || m.b.uva ? ' is-uva' : ''}${done ? ' is-done' : ''}`}>
      <p className={`bk__row${m.winner === 1 ? ' is-winner' : m.winner === 2 ? ' is-loser' : ''}`}>
        <Entrant e={m.a} />
        <Score m={m} side={0} />
      </p>
      <p className={`bk__row${m.winner === 2 ? ' is-winner' : m.winner === 1 ? ' is-loser' : ''}`}>
        <Entrant e={m.b} />
        <Score m={m} side={1} />
      </p>
      {!done && (m.when || m.court) && (
        <p className="bk__meta">{[m.when && (/\d{1,2}:\d{2}/.test(m.when) ? m.when : clock(m.when)), m.court && `Pista ${m.court}`].filter(Boolean).join(' · ')}</p>
      )}
    </li>
  );
}

/** Esquema del cuadro final: una columna por ronda, con líneas que unen cada pareja de partidos con el siguiente. */
function Bracket({ draw }: { draw: LiveDraw }) {
  const rounds = draw.rounds ?? [];
  if (rounds.length === 0) return <p className="empty">El cuadro aún no está publicado.</p>;
  return (
    <div className="bk" role="group" aria-label={`Cuadro final ${eventName(draw.base)}`}>
      {rounds.map((round, ri) => {
        const pairs: BMatch[][] = [];
        const last = ri === rounds.length - 1;
        for (let i = 0; i < round.matches.length; i += last ? round.matches.length : 2) pairs.push(round.matches.slice(i, i + (last ? round.matches.length : 2)));
        return (
          <div key={round.title} className="bk__col">
            <h5 className="bk__title">{round.title}</h5>
            <div className="bk__body">
              {pairs.map((pair, pi) => (
                <ul key={pi} className="bk__pair">
                  {pair.map((m, mi) => <MatchBox key={mi} m={m} />)}
                </ul>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupCard({ draw }: { draw: LiveDraw }) {
  const rows = draw.standings ?? [];
  const q = draw.qualify;
  const started = rows.some((r) => r.played > 0);
  const matches = (draw.rounds ?? []).flatMap((r) => r.matches);
  return (
    <section className="gcard" aria-label={`${eventName(draw.base)} ${draw.group ?? draw.name}`}>
      <header className="gcard__head">
        <h4>{draw.group ?? draw.name}</h4>
        {q ? <span className="gcard__q">Pasan {q === 1 ? 'el 1.º' : `los ${q} primeros`}</span> : null}
      </header>
      <div className="table-wrap">
        <table className="standings">
          <caption className="sr-only">Clasificación de {draw.name}</caption>
          <thead>
            <tr><th>#</th><th>Jugador/a o pareja</th><th title="Partidos jugados">PJ</th><th title="Ganados">G</th><th title="Perdidos">P</th><th title="Juegos">Juegos</th><th title="Puntos de clasificación">Pts</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.rank + s.entrant.label} className={`${s.entrant.uva ? 'is-uva' : ''}${q && s.rank <= q && started ? ' is-qualified' : ''}`.trim() || undefined}>
                <td>{s.rank}</td>
                <td><Entrant e={s.entrant} /></td>
                <td>{s.played}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.games}</td><td><strong>{s.pts}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {matches.length > 0 && (
        <details className="gcard__matches">
          <summary>Partidos del grupo ({matches.filter((m) => m.sets.length > 0 || m.note).length}/{matches.length} jugados)</summary>
          <ul>
            {matches.map((m, i) => (
              <li key={i} className={m.a.uva || m.b.uva ? 'is-uva' : undefined}>
                <span className={m.winner === 1 ? 'is-winner' : undefined}><Entrant e={m.a} /></span>
                <span className="gcard__vs">{m.sets.length > 0 ? m.sets.map((s) => s.join('-')).join(' ') : m.note ?? (m.when ? (/\d{1,2}:\d{2}/.test(m.when) ? m.when : clock(m.when)) : 'vs')}</span>
                <span className={m.winner === 2 ? 'is-winner' : undefined}><Entrant e={m.b} /></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Grupos (clasificatoria) y cuadros finales de las pruebas donde juega alguien de la UVa. Las demás personas se muestran con iniciales. */
export function DrawsView({ draws, updatedAt }: { draws: LiveDraw[]; updatedAt?: string }) {
  const events = useMemo(() => {
    const map = new Map<string, { base: string; groups: LiveDraw[]; finals: LiveDraw[] }>();
    for (const d of draws) {
      const e = map.get(d.base) ?? { base: d.base, groups: [], finals: [] };
      (d.type === 'roundrobin' ? e.groups : e.finals).push(d);
      map.set(d.base, e);
    }
    return [...map.values()];
  }, [draws]);
  if (draws.length === 0) return null;
  return (
    <section aria-labelledby="draws-title" className="draws">
      <h2 id="draws-title">Grupos y cuadros</h2>
      <p className="lead">
        Clasificación de cada grupo y esquema del cuadro final de las pruebas donde juegan jugadores de la UVa; el resto, con iniciales.
        {updatedAt && <> Actualizado a las {clock(updatedAt)}.</>}
      </p>
      {events.map((ev) => (
        <article key={ev.base} className="devent">
          <h3>{eventName(ev.base)}</h3>
          {ev.groups.length > 0 && (
            <>
              <h4 className="devent__sub">Fase de grupos</h4>
              <div className="gcards">{ev.groups.map((g) => <GroupCard key={g.id} draw={g} />)}</div>
            </>
          )}
          {ev.finals.map((f) => (
            <div key={f.id}>
              <h4 className="devent__sub">Cuadro final</h4>
              <Bracket draw={f} />
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
