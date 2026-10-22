import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tournament } from '../../types';
import { formatDay, parseISO } from '../../lib/dates';

interface Point {
  id: string;
  name: string;
  date: string;
  won: number;
  lost: number;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

const MEDAL = { gold: '#c99a06', silver: '#8c96a3', bronze: '#a9622d' } as const;
const medalOf = (p: Point) => (p.gold ? 'gold' : p.silver ? 'silver' : p.bronze ? 'bronze' : undefined);
const medalText = (p: Point) =>
  [p.gold && `${p.gold} oro${p.gold > 1 ? 's' : ''}`, p.silver && `${p.silver} plata${p.silver > 1 ? 's' : ''}`, p.bronze && `${p.bronze} bronce${p.bronze > 1 ? 's' : ''}`].filter(Boolean).join(', ');

const shortDate = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISO(iso)).replace('.', '');
/** Escala con marcas en números redondos (de 1, 2, 5, 10, 20 o 50 en 50...), con 3 a 6 marcas. */
const niceScale = (v: number) => {
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => Math.ceil(Math.max(v, 1) / s) <= 5) ?? 100;
  const max = Math.max(step * 2, Math.ceil(v / step) * step);
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, k) => k * step) };
};

/** Puntos de la gráfica: un torneo por punto, por orden de fecha, con el total de partidos ganados hasta entonces. */
export function trajectoryOf(tournaments: Tournament[]): Point[] {
  let total = 0;
  return tournaments
    .filter((t) => t.record && t.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((t) => {
      const r = t.record!;
      total += r.won;
      return { id: t.id, name: t.name, date: t.startDate, won: r.won, lost: r.lost, gold: r.gold, silver: r.silver, bronze: r.bronze, total };
    });
}

/** Trayectoria del club a lo largo del tiempo: partidos ganados en cada torneo (barras) y total acumulado (línea), con las medallas. */
export function TrajectoryChart({ tournaments }: { tournaments: Tournament[] }) {
  const points = useMemo(() => trajectoryOf(tournaments), [tournaments]);
  const [active, setActive] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = points.length;
  // En pantallas estrechas la gráfica se desliza: se empieza viendo lo más reciente.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [count]);
  if (points.length === 0) return null;

  const wonTotal = points.at(-1)!.total;
  const lostTotal = points.reduce((n, p) => n + p.lost, 0);
  const golds = points.reduce((n, p) => n + p.gold, 0);
  const medalTournaments = points.filter((p) => medalOf(p)).length;

  const n = points.length;
  const step = 60;
  const padL = 44;
  const padR = 40;
  const padT = 22;
  const padB = 52;
  const H = 300;
  const W = Math.max(600, padL + padR + n * step);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const { max: yMax, ticks } = niceScale(Math.max(...points.map((p) => p.total), ...points.map((p) => p.won)));
  const x = (i: number) => padL + (innerW / n) * (i + 0.5);
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const barW = Math.min(26, (innerW / n) * 0.45);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');

  const tip = active === null ? null : points[active];
  const tipLines = tip ? [tip.name.length > 34 ? `${tip.name.slice(0, 33)}…` : tip.name, formatDay(tip.date), `Ganados en el torneo: ${tip.won} · perdidos: ${tip.lost}`, `Total acumulado: ${tip.total}`, ...(medalText(tip) ? [`Medallas: ${medalText(tip)}`] : [])] : [];
  const tipW = tip ? Math.min(W - 8, Math.max(...tipLines.map((l) => l.length)) * 6.6 + 20) : 0;
  const tipH = tipLines.length * 17 + 14;
  const tipX = tip ? Math.max(4, Math.min(W - tipW - 4, x(active!) - tipW / 2)) : 0;
  const tipY = tip ? Math.max(4, y(Math.max(tip.total, tip.won)) - tipH - 14) : 0;

  return (
    <section className="traj" aria-labelledby="traj-title">
      <h3 id="traj-title">Trayectoria del club</h3>
      <p className="traj__lead">Partidos ganados por los jugadores de la UVa en cada torneo y total acumulado a lo largo del tiempo.</p>

      <dl className="traj__stats">
        <div><dt>Partidos ganados</dt><dd>{wonTotal}</dd></div>
        <div><dt>Perdidos</dt><dd>{lostTotal}</dd></div>
        <div><dt>Torneos con medalla</dt><dd>{medalTournaments}</dd></div>
        <div><dt>Oros</dt><dd>{golds}</dd></div>
      </dl>

      <ul className="traj__legend" aria-label="Leyenda">
        <li><span className="traj__sw traj__sw--bar" aria-hidden="true" />Ganados en el torneo</li>
        <li><span className="traj__sw traj__sw--line" aria-hidden="true" />Total acumulado</li>
        <li><span className="traj__sw traj__sw--medal" aria-hidden="true" />Torneo con medalla (oro, plata o bronce)</li>
      </ul>

      <div className="traj__scroll" ref={scroller}>
        <svg className="traj__svg" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, maxWidth: W * 1.4 }} role="group" aria-label={`Gráfica con ${n} torneos: ${wonTotal} partidos ganados en total`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="traj__grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
              <text className="traj__tick" x={padL - 8} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}

          {points.map((p, i) => (
            <rect key={`b${p.id}`} className="traj__bar" x={x(i) - barW / 2} y={y(p.won)} width={barW} height={Math.max(0, y(0) - y(p.won))} rx={3} />
          ))}
          <path className="traj__line" d={line} />
          {points.map((p, i) => {
            const m = medalOf(p);
            return <circle key={`d${p.id}`} className={`traj__dot${m ? ' has-medal' : ''}`} cx={x(i)} cy={y(p.total)} r={m ? 7 : 5} style={m ? { fill: MEDAL[m] } : undefined} />;
          })}
          <text className="traj__end" x={x(n - 1) + 12} y={y(wonTotal) + 4}>{wonTotal}</text>

          {points.map((p, i) => (
            <g key={`x${p.id}`}>
              <text className="traj__xlab" x={x(i)} y={H - padB + 18} textAnchor="middle">{shortDate(p.date)}</text>
              {(i === 0 || p.date.slice(0, 4) !== points[i - 1].date.slice(0, 4)) && <text className="traj__xyear" x={x(i)} y={H - padB + 34} textAnchor="middle">{p.date.slice(0, 4)}</text>}
            </g>
          ))}

          {points.map((p, i) => (
            <rect
              key={`h${p.id}`}
              className={`traj__hit${active === i ? ' is-on' : ''}`}
              x={x(i) - innerW / n / 2}
              y={padT}
              width={innerW / n}
              height={innerH + 26}
              tabIndex={0}
              role="img"
              aria-label={`${p.name}, ${formatDay(p.date)}: ${p.won} ganados, ${p.lost} perdidos, ${p.total} acumulados${medalText(p) ? `, medallas: ${medalText(p)}` : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              onClick={() => setActive((a) => (a === i ? null : i))}
            />
          ))}

          {tip && (
            <g className="traj__tip" pointerEvents="none">
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} />
              {tipLines.map((l, k) => (
                <text key={l} x={tipX + 10} y={tipY + 20 + k * 17} className={k === 0 ? 'is-title' : undefined}>{l}</text>
              ))}
            </g>
          )}
        </svg>
      </div>

      <p className="traj__hint">Desliza la gráfica para ver todos los torneos.</p>

      <details className="traj__table">
        <summary>Ver los datos en tabla</summary>
        <div className="traj__tablewrap">
          <table>
            <thead>
              <tr><th scope="col">Torneo</th><th scope="col">Fecha</th><th scope="col">Ganados</th><th scope="col">Perdidos</th><th scope="col">Medallas</th><th scope="col">Acumulado</th></tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id}><th scope="row">{p.name}</th><td>{formatDay(p.date)}</td><td>{p.won}</td><td>{p.lost}</td><td>{medalText(p) || '—'}</td><td>{p.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="traj__note">Solo cuentan los partidos de jugadores del club que han dado su consentimiento para aparecer en la web, y los torneos ya leídos de badminton.es. Se completa con cada torneo.</p>
    </section>
  );
}
