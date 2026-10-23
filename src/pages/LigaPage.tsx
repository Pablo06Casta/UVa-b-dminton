import { useEffect, useMemo, useState } from 'react';
import { Notice, PageHeader } from '../components/ui';
import { useLiga } from '../hooks/useLiga';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatDay } from '../lib/dates';
import type { LigaClub, LigaData, LigaFixture } from '../types';

type Tab = 'clasificacion' | 'jornadas' | 'clubes';

const when = (f: Pick<LigaFixture, 'date' | 'time'>) => (f.date ? `${formatDay(f.date)}${f.time ? ` · ${f.time}` : ''}` : 'Fecha por confirmar');

function Fixture({ f }: { f: LigaFixture }) {
  const done = f.status === 'finished';
  const homeWon = done && (f.homeScore ?? 0) > (f.awayScore ?? 0);
  const awayWon = done && (f.awayScore ?? 0) > (f.homeScore ?? 0);
  return (
    <li className={`lfix${f.uva ? ' is-uva' : ''}${done ? ' is-done' : ''}`}>
      <span className="lfix__when">
        {when(f)}
        {f.moved && <small> · cambio de horario</small>}
      </span>
      <span className="lfix__teams">
        <span className={`lfix__team${homeWon ? ' is-win' : ''}`}>{f.home}</span>
        <span className="lfix__score" aria-label={done ? `Resultado ${f.homeScore} a ${f.awayScore}` : 'Pendiente'}>
          {done ? `${f.homeScore} - ${f.awayScore}` : 'vs'}
        </span>
        <span className={`lfix__team lfix__team--away${awayWon ? ' is-win' : ''}`}>{f.away}</span>
      </span>
      <a className="lfix__link" href={f.url} target="_blank" rel="noopener noreferrer">
        Ver encuentro<span className="sr-only"> en badminton.es (se abre en una pestaña nueva)</span>
      </a>
    </li>
  );
}

function Standings({ clubs, started }: { clubs: LigaClub[]; started: boolean }) {
  return (
    <div className="ltable__wrap">
      <table className="ltable">
        <caption className="sr-only">Clasificación</caption>
        <thead>
          <tr>
            <th scope="col">Pos.</th>
            <th scope="col">Club</th>
            <th scope="col" title="Encuentros jugados">PJ</th>
            <th scope="col" title="Ganados">G</th>
            <th scope="col" title="Perdidos">P</th>
            <th scope="col" title="Partidos individuales a favor y en contra">Partidos</th>
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((c, i) => (
            <tr key={c.club} className={c.uva ? 'is-uva' : undefined}>
              <td>{started ? c.rank : i + 1}</td>
              <th scope="row">
                {c.club}
                {c.uva && <span className="ltag">UVa</span>}
              </th>
              <td>{c.played}</td>
              <td>{c.won}</td>
              <td>{c.lost}</td>
              <td>{c.matchesFor}-{c.matchesAgainst}</td>
              <td className="ltable__pts">{c.points}{c.adjusted ? '*' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {clubs.some((c) => c.adjusted) && <p className="ltable__note">* Puntos con ajuste o sanción según la clasificación oficial.</p>}
    </div>
  );
}

function Rounds({ liga }: { liga: LigaData }) {
  const first = liga.currentRound ?? liga.rounds.at(-1)?.round ?? 1;
  const [round, setRound] = useState(first);
  useEffect(() => setRound(first), [first]);
  const idx = Math.max(0, liga.rounds.findIndex((r) => r.round === round));
  const r = liga.rounds[idx];
  if (!r) return <p className="empty">Aún no hay jornadas publicadas.</p>;
  return (
    <div>
      <div className="lround__nav">
        <button type="button" onClick={() => setRound(liga.rounds[Math.max(0, idx - 1)].round)} disabled={idx === 0} aria-label="Jornada anterior">‹</button>
        <label>
          <span className="sr-only">Jornada</span>
          <select value={r.round} onChange={(e) => setRound(Number(e.target.value))}>
            {liga.rounds.map((x) => (
              <option key={x.round} value={x.round}>
                Jornada {x.round}{x.date ? ` · ${formatDay(x.date)}` : ''}{x.round === liga.currentRound ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setRound(liga.rounds[Math.min(liga.rounds.length - 1, idx + 1)].round)} disabled={idx === liga.rounds.length - 1} aria-label="Jornada siguiente">›</button>
      </div>
      <h3 className="lround__title">Jornada {r.round}{r.round === liga.currentRound && <span className="ltag ltag--now">Actual</span>}</h3>
      <ul className="lfix__list">{r.fixtures.map((f) => <Fixture key={f.id} f={f} />)}</ul>
    </div>
  );
}

export function LigaPage() {
  usePageTitle('Liga', 'Liga Nacional de Clubes de bádminton: clasificación, jornadas y encuentros del Club Bádminton UVa, actualizados desde badminton.es.');
  const { liga, status, hasApi } = useLiga();
  const [tab, setTab] = useState<Tab>('clasificacion');
  const uvaFixtures = useMemo(() => (liga?.rounds ?? []).flatMap((r) => r.fixtures.filter((f) => f.uva).map((f) => ({ round: r.round, f }))), [liga]);
  const next = uvaFixtures.find((x) => x.f.status === 'scheduled') ?? uvaFixtures.at(-1);
  const uvaClub = liga?.clubs.find((c) => c.uva);

  return (
    <>
      <PageHeader sport title="Liga" lead={liga ? `Liga Nacional de Clubes · ${liga.division} · ${liga.edition.replace(/^Liga Nacional de Clubes\s*/i, '')}` : 'Liga Nacional de Clubes: clasificación, jornadas y encuentros del club.'} />
      <div className="section">
        <div className="container liga">
          {!hasApi && <Notice kind="warning" title="Sin conexión con el servidor">Esta web todavía no está conectada al servidor del club, por lo que no hay datos de la Liga.</Notice>}
          {hasApi && status === 'error' && !liga && <Notice kind="warning" title="No se puede cargar la Liga">El servidor no responde ahora mismo. Se volverá a intentar automáticamente.</Notice>}
          {hasApi && status === 'loading' && !liga && <p className="empty">Cargando…</p>}

          {liga && (
            <>
              {!liga.started && (
                <Notice title="La Liga aún no ha empezado">
                  Ya están publicados los clubes y el calendario de jornadas. La clasificación se rellenará sola cuando se jueguen los primeros encuentros y los resultados irán apareciendo según los publique badminton.es.
                </Notice>
              )}

              {next && (
                <section className="lnext" aria-labelledby="lnext-title">
                  <h2 id="lnext-title">{next.f.status === 'finished' ? 'Último encuentro de la UVa' : 'Próximo encuentro de la UVa'} · Jornada {next.round}</h2>
                  <ul className="lfix__list"><Fixture f={next.f} /></ul>
                  {uvaClub && liga.started && <p className="lnext__pos">Posición actual: <strong>{uvaClub.rank}.º</strong> con {uvaClub.points} puntos.</p>}
                </section>
              )}

              <div className="ltabs" role="tablist" aria-label="Secciones de la Liga">
                {([['clasificacion', 'Clasificación'], ['jornadas', 'Jornadas'], ['clubes', 'Clubes']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : undefined} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>

              {tab === 'clasificacion' && <Standings clubs={liga.clubs} started={liga.started} />}
              {tab === 'jornadas' && <Rounds liga={liga} />}
              {tab === 'clubes' && (
                <ul className="lclubs">
                  {liga.clubs.map((c) => (
                    <li key={c.club} className={c.uva ? 'is-uva' : undefined}>
                      {c.club}
                      {c.uva && <span className="ltag">UVa</span>}
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'jornadas' && uvaFixtures.length > 0 && (
                <section className="lnext" aria-labelledby="lcal-title">
                  <h2 id="lcal-title">Calendario de la UVa</h2>
                  <ul className="lfix__list">
                    {uvaFixtures.map(({ round, f }) => (
                      <li key={f.id} className="lcal"><span className="lcal__round">J{round}</span><ul className="lfix__list"><Fixture f={f} /></ul></li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="source-note">
                Datos de <a href={liga.officialUrl} target="_blank" rel="noopener noreferrer">badminton.es<span className="sr-only"> (se abre en una pestaña nueva)</span></a>, actualizados automáticamente.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
