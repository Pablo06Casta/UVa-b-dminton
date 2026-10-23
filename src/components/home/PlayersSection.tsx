import { useMemo } from 'react';
import playersJson from '../../data/players.json';
import { useTournaments } from '../../hooks/useTournaments';
import { asset } from '../../lib/asset';
import type { Player, Tournament } from '../../types';
import { SectionHeading } from '../ui';

/** Fichas añadidas a mano por el club (foto, función, información). Solo con autorización expresa (`consent: true`). */
const manual = (playersJson as Player[]).filter((p) => p.consent === true);

const tokens = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1);
/** Mismo nombre aunque uno lleve solo un apellido: todas las palabras del más corto están en el más largo. */
const sameName = (a: string, b: string) => {
  const [x, y] = [tokens(a), tokens(b)].sort((p, q) => p.length - q.length);
  return x.length >= 2 && x.every((t) => y.includes(t));
};

interface Card {
  key: string;
  name: string;
  role: string;
  photo?: string;
  info?: string;
  medals: { gold: number; silver: number; bronze: number };
}

/** Medallas de cada persona según los resultados de los torneos ya leídos (en parejas cuenta para las dos). */
function medalsOf(name: string, tournaments: Tournament[]) {
  const m = { gold: 0, silver: 0, bronze: 0 };
  for (const t of tournaments) {
    for (const r of t.podium ?? []) {
      if (!r.place || !r.entrant.split(/\s+\/\s+/).some((n) => sameName(n, name))) continue;
      if (r.place === 1) m.gold++;
      else if (r.place === 2) m.silver++;
      else m.bronze++;
    }
  }
  return m;
}

function Silhouette() {
  return (
    <svg viewBox="0 0 100 125" className="player__silhouette" aria-hidden="true" focusable="false">
      <circle cx="50" cy="46" r="18" />
      <path d="M14 125c0-26 16-42 36-42s36 16 36 42z" />
    </svg>
  );
}

function PlayerCard({ c }: { c: Card }) {
  const { gold, silver, bronze } = c.medals;
  return (
    <li className="player">
      <div className="player__photo">
        {c.photo ? <img src={asset(c.photo)} alt={`Fotografía de ${c.name}`} loading="lazy" width="400" height="500" /> : <Silhouette />}
      </div>
      <h3 className="player__name">{c.name}</h3>
      <p className="player__role">{c.role}</p>
      {c.info && <p className="player__info">{c.info}</p>}
      {gold + silver + bronze > 0 && (
        <p className="player__medals" aria-label={`Medallas: ${gold} oro, ${silver} plata, ${bronze} bronce`}>
          {gold > 0 && <span className="pmedal pmedal--gold">{gold} oro{gold > 1 ? 's' : ''}</span>}
          {silver > 0 && <span className="pmedal pmedal--silver">{silver} plata{silver > 1 ? 's' : ''}</span>}
          {bronze > 0 && <span className="pmedal pmedal--bronze">{bronze} bronce{bronze > 1 ? 's' : ''}</span>}
        </p>
      )}
    </li>
  );
}

/** «Nuestros jugadores»: las personas del club con consentimiento que publica el servidor, más las fichas a mano (foto, función). */
export function PlayersSection() {
  const { tournaments, live } = useTournaments();
  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    const used = new Set<string>();
    for (const p of live?.players ?? []) {
      const extra = manual.find((m) => sameName(m.name, p.name));
      if (extra) used.add(extra.id);
      out.push({ key: `s${p.id}`, name: extra?.name ?? p.name, role: extra?.role ?? 'Jugador/a', photo: extra?.photo, info: extra?.info ?? p.category, medals: medalsOf(p.name, tournaments) });
    }
    for (const m of manual) if (!used.has(m.id)) out.push({ key: m.id, name: m.name, role: m.role, photo: m.photo, info: m.info, medals: medalsOf(m.name, tournaments) });
    return out.sort((a, b) => b.medals.gold - a.medals.gold || b.medals.silver - a.medals.silver || b.medals.bronze - a.medals.bronze || a.name.localeCompare(b.name, 'es'));
  }, [live, tournaments]);

  if (cards.length === 0) return null;
  return (
    <section id="jugadores" className="section" aria-labelledby="jugadores-title">
      <div className="container">
        <SectionHeading id="jugadores-title" eyebrow="Personas" title="Nuestros jugadores" lead="Las personas del club que compiten, con sus medallas de la temporada. Solo se publican quienes han dado su consentimiento." sport />
        <ul className="team-grid">{cards.map((c) => <PlayerCard key={c.key} c={c} />)}</ul>
      </div>
    </section>
  );
}
