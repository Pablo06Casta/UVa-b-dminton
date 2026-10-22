import { useEffect, useMemo, useRef, useState } from 'react';
import manual from '../../data/trayectoria.json';
import type { LiveState, Tournament } from '../../types';

/** Un torneo (o parte de él) con sus partidos ganados/perdidos y medallas. */
export interface TrajectoryEntry {
  id: string;
  name: string;
  /** Fecha (YYYY-MM-DD). */
  date: string;
  won: number;
  lost: number;
  gold: number;
  silver: number;
  bronze: number;
}

export interface MonthPoint {
  key: string;
  won: number;
  lost: number;
  gold: number;
  silver: number;
  bronze: number;
  /** Partidos ganados desde el inicio de la gráfica hasta este mes. */
  total: number;
  items: TrajectoryEntry[];
}

/** Años que abarca la gráfica. */
export const YEARS = 5;

const MEDAL = { gold: '#c99a06', silver: '#8c96a3', bronze: '#a9622d' } as const;
const medalOf = (p: Pick<MonthPoint, 'gold' | 'silver' | 'bronze'>) => (p.gold ? 'gold' : p.silver ? 'silver' : p.bronze ? 'bronze' : undefined);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const medalText = (p: Pick<MonthPoint, 'gold' | 'silver' | 'bronze'>) =>
  [p.gold && plural(p.gold, 'oro', 'oros'), p.silver && plural(p.silver, 'plata', 'platas'), p.bronze && plural(p.bronze, 'bronce', 'bronces')].filter(Boolean).join(', ');

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** Marcas del eje en números redondos (de 1, 2, 5, 10, 20, 50 o 100), de 3 a 6. */
const niceScale = (v: number) => {
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => Math.ceil(Math.max(v, 1) / s) <= 5) ?? 100;
  const max = Math.max(step * 2, Math.ceil(v / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, k) => k * step) };
};

/** Torneos con balance de la UVa: los publicados por el servidor, los de los perfiles oficiales y los que aporta el club a mano. */
export function entriesOf(tournaments: Tournament[], history: LiveState['history'] = []): TrajectoryEntry[] {
  const fromTournaments = tournaments
    .filter((t) => t.record && t.startDate)
    .map((t) => ({ id: t.id, name: t.name, date: t.startDate, won: t.record!.won, lost: t.record!.lost, gold: t.record!.gold, silver: t.record!.silver, bronze: t.record!.bronze }));
  const fromProfiles = history.map((h) => ({ ...h, gold: 0, silver: 0, bronze: 0 }));
  const fromClub = (manual.entradas as Partial<TrajectoryEntry>[]).flatMap((e, i) =>
    e.date && e.name ? [{ id: `club-${i}`, name: e.name, date: e.date, won: e.won ?? 0, lost: e.lost ?? 0, gold: e.gold ?? 0, silver: e.silver ?? 0, bronze: e.bronze ?? 0 }] : [],
  );
  return [...fromTournaments, ...fromProfiles, ...fromClub];
}

/** Un punto por mes durante los últimos `years` años (hasta el mes de `now`), con el total acumulado. */
export function monthlyOf(entries: TrajectoryEntry[], now: Date, years = YEARS): MonthPoint[] {
  const total = years * 12;
  const keys = Array.from({ length: total }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (total - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const byKey = new Map(keys.map((k) => [k, { key: k, won: 0, lost: 0, gold: 0, silver: 0, bronze: 0, total: 0, items: [] as TrajectoryEntry[] }]));
  for (const e of entries) {
    const m = byKey.get(e.date.slice(0, 7));
    if (!m) continue;
    m.won += e.won;
    m.lost += e.lost;
    m.gold += e.gold;
    m.silver += e.silver;
    m.bronze += e.bronze;
    m.items.push(e);
  }
  let acc = 0;
  return keys.map((k) => {
    const m = byKey.get(k)!;
    acc += m.won;
    m.total = acc;
    m.items.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  });
}

/** Trayectoria del club mes a mes en los últimos cinco años: partidos ganados cada mes (barras), total acumulado (línea) y medallas. */
export function TrajectoryChart({ tournaments, history }: { tournaments: Tournament[]; history?: LiveState['history'] }) {
  const months = useMemo(() => monthlyOf(entriesOf(tournaments, history), new Date()), [tournaments, history]);
  const [active, setActive] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const withData = months.filter((m) => m.items.length > 0);
  const hasData = withData.length > 0;
  // En pantallas estrechas la gráfica se desliza: se empieza viendo lo más reciente.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [hasData]);
  if (!hasData) return null;

  const wonTotal = months.at(-1)!.total;
  const lostTotal = months.reduce((n, m) => n + m.lost, 0);
  const golds = months.reduce((n, m) => n + m.gold, 0);
  const medalTournaments = months.reduce((n, m) => n + m.items.filter((e) => e.gold + e.silver + e.bronze > 0).length, 0);
  const first = withData[0].key;

  const n = months.length;
  const step = 17;
  const padL = 44;
  const padR = 44;
  const padT = 22;
  const padB = 54;
  const H = 300;
  const W = padL + padR + n * step;
  const innerH = H - padT - padB;
  const { max: yMax, ticks } = niceScale(Math.max(wonTotal, ...months.map((m) => m.won)));
  const x = (i: number) => padL + step * (i + 0.5);
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const barW = 9;
  // La línea empieza en el primer mes con datos: antes no es «cero partidos», es que badminton.es no los publica.
  const firstIdx = months.findIndex((m) => m.items.length > 0);
  const line = months.map((m, i) => (i < firstIdx ? '' : `${i === firstIdx ? 'M' : 'L'}${x(i).toFixed(1)} ${y(m.total).toFixed(1)}`)).filter(Boolean).join(' ');

  const tip = active === null ? null : months[active];
  const tipLines = tip
    ? [
        monthLabel(tip.key),
        ...tip.items.slice(0, 4).map((e) => `${e.name.length > 34 ? `${e.name.slice(0, 33)}…` : e.name}: ${e.won}-${e.lost}`),
        ...(tip.items.length > 4 ? [`y ${tip.items.length - 4} más`] : []),
        `Ganados en el mes: ${tip.won} · perdidos: ${tip.lost}`,
        `Total acumulado: ${tip.total}`,
        ...(medalText(tip) ? [`Medallas: ${medalText(tip)}`] : []),
      ]
    : [];
  const tipW = tip ? Math.min(W - 8, Math.max(...tipLines.map((l) => l.length)) * 6.6 + 20) : 0;
  const tipH = tipLines.length * 17 + 14;
  const tipX = tip ? Math.max(4, Math.min(W - tipW - 4, x(active!) - tipW / 2)) : 0;
  const tipY = tip ? Math.max(4, y(Math.max(tip.total, tip.won)) - tipH - 14) : 0;

  return (
    <section className="traj" aria-labelledby="traj-title">
      <h3 id="traj-title">Trayectoria del club</h3>
      <p className="traj__lead">Partidos ganados por los jugadores de la UVa cada mes durante los últimos {YEARS} años y total acumulado.</p>

      <dl className="traj__stats">
        <div><dt>Partidos ganados</dt><dd>{wonTotal}</dd></div>
        <div><dt>Perdidos</dt><dd>{lostTotal}</dd></div>
        <div><dt>Torneos con medalla</dt><dd>{medalTournaments}</dd></div>
        <div><dt>Oros</dt><dd>{golds}</dd></div>
      </dl>

      <ul className="traj__legend" aria-label="Leyenda">
        <li><span className="traj__sw traj__sw--bar" aria-hidden="true" />Ganados en el mes</li>
        <li><span className="traj__sw traj__sw--line" aria-hidden="true" />Total acumulado</li>
        <li><span className="traj__sw traj__sw--medal" aria-hidden="true" />Mes con medalla (oro, plata o bronce)</li>
      </ul>

      <div className="traj__scroll" ref={scroller}>
        <svg className="traj__svg" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 900) }} role="group" aria-label={`Gráfica mensual de los últimos ${YEARS} años: ${wonTotal} partidos ganados en total`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="traj__grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
              <text className="traj__tick" x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}

          {firstIdx > 2 && (
            <g className="traj__nodata">
              <rect x={padL} y={padT} width={step * firstIdx} height={innerH} />
              <text x={padL + (step * firstIdx) / 2} y={padT + innerH / 2} textAnchor="middle">Sin datos publicados en badminton.es</text>
            </g>
          )}
          {months.map((m, i) => m.won > 0 && <rect key={`b${m.key}`} className="traj__bar" x={x(i) - barW / 2} y={y(m.won)} width={barW} height={Math.max(0, y(0) - y(m.won))} rx={2} />)}
          <path className="traj__line" d={line} />
          {months.map((m, i) => {
            const k = medalOf(m);
            if (!k && m.items.length === 0) return null;
            return <circle key={`d${m.key}`} className={`traj__dot${k ? ' has-medal' : ''}`} cx={x(i)} cy={y(m.total)} r={k ? 6 : 4} style={k ? { fill: MEDAL[k] } : undefined} />;
          })}
          <text className="traj__end" x={x(n - 1) + 10} y={y(wonTotal) + 4}>{wonTotal}</text>

          {months.map((m, i) => {
            const month = Number(m.key.slice(5, 7));
            const jan = month === 1 || i === 0;
            if (!jan && month % 3 !== 1) return null;
            return (
              <g key={`x${m.key}`}>
                <line className="traj__xtick" x1={x(i)} x2={x(i)} y1={y(0)} y2={y(0) + (jan ? 8 : 4)} />
                <text className="traj__xlab" x={x(i)} y={y(0) + 22} textAnchor="middle">{MONTHS[month - 1]}</text>
                {jan && <text className="traj__xyear" x={x(i)} y={y(0) + 38} textAnchor="middle">{m.key.slice(0, 4)}</text>}
              </g>
            );
          })}

          {months.map((m, i) =>
            m.items.length === 0 ? null : (
              <rect
                key={`h${m.key}`}
                className={`traj__hit${active === i ? ' is-on' : ''}`}
                x={x(i) - step / 2}
                y={padT}
                width={step}
                height={innerH + 26}
                tabIndex={0}
                role="img"
                aria-label={`${monthLabel(m.key)}: ${m.won} ganados, ${m.lost} perdidos, ${m.total} acumulados${medalText(m) ? `, medallas: ${medalText(m)}` : ''}. Torneos: ${m.items.map((e) => e.name).join('; ')}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                onClick={() => setActive((a) => (a === i ? null : i))}
              />
            ),
          )}

          {tip && (
            <g className="traj__tip" pointerEvents="none">
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} />
              {tipLines.map((l, k) => (
                <text key={`${k}-${l}`} x={tipX + 10} y={tipY + 20 + k * 17} className={k === 0 ? 'is-title' : undefined}>{l}</text>
              ))}
            </g>
          )}
        </svg>
      </div>

      <p className="traj__hint">Desliza la gráfica para ver todos los meses.</p>

      <details className="traj__table">
        <summary>Ver los datos en tabla</summary>
        <div className="traj__tablewrap">
          <table>
            <thead>
              <tr><th scope="col">Mes</th><th scope="col">Torneos</th><th scope="col">Ganados</th><th scope="col">Perdidos</th><th scope="col">Medallas</th><th scope="col">Acumulado</th></tr>
            </thead>
            <tbody>
              {withData.map((m) => (
                <tr key={m.key}><th scope="row">{monthLabel(m.key)}</th><td>{m.items.map((e) => e.name).join('; ')}</td><td>{m.won}</td><td>{m.lost}</td><td>{medalText(m) || '—'}</td><td>{m.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="traj__note">
        Datos de badminton.es, que solo publica las últimas temporadas de cada jugador: los meses anteriores a {monthLabel(first)} aparecen vacíos. Solo cuentan los partidos de jugadores del club que han dado su consentimiento para aparecer en la web.
      </p>
    </section>
  );
}
