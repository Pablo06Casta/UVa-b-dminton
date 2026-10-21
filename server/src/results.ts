import type { PublicDraw } from './publicView';

/** Resultado de una persona o pareja de la UVa en una prueba, calculado con los cuadros ya publicados. */
export interface PublicResult {
  /** Prueba («IM», «DX»…). */
  event: string;
  /** Persona o pareja de la UVa (solo jugadores públicos del club). */
  entrant: string;
  /** 1 = oro, 2 = plata, 3 = bronce. Solo si el cuadro lo decide ya. */
  place?: 1 | 2 | 3;
  text: string;
  /** Marcador de la final (por sets, desde el punto de vista de la persona o pareja de la UVa), si ya se jugó. */
  score?: string;
  /** `true` si ya no le quedan partidos en esa prueba. */
  done: boolean;
}

type Round = NonNullable<PublicDraw['rounds']>[number];

/** Última ronda del cuadro en la que aparece `label` y su partido. */
function lastAppearance(rounds: Round[], label: string) {
  for (let i = rounds.length - 1; i >= 0; i--) {
    for (const m of rounds[i].matches) {
      if (m.a.uva && m.a.label === label) return { i, m, side: 1 as const };
      if (m.b.uva && m.b.label === label) return { i, m, side: 2 as const };
    }
  }
  return undefined;
}

function knockoutResult(event: string, rounds: Round[], label: string): PublicResult | undefined {
  const hit = lastAppearance(rounds, label);
  if (!hit) return undefined;
  const { i, m, side } = hit;
  const title = rounds[i].title;
  const result = (r: Omit<PublicResult, 'event' | 'entrant'>): PublicResult => ({ event, entrant: label, ...r });
  if (!m.winner) return result({ text: `Próximo partido: ${title}`, done: false });
  const won = m.winner === side;
  const isFinal = i === rounds.length - 1;
  if (isFinal) {
    const score = m.sets.map(([a, b]) => (side === 1 ? `${a}-${b}` : `${b}-${a}`)).join(' ') || undefined;
    return won ? result({ place: 1, text: 'Oro', score, done: true }) : result({ place: 2, text: 'Plata', score, done: true });
  }
  if (won) return result({ text: `Pasa a ${rounds[i + 1].title}`, done: false });
  // Semifinal (dos partidos antes de la final): las dos perdedoras son bronce.
  if (i === rounds.length - 2 && rounds[i].matches.length === 2) return result({ place: 3, text: 'Bronce', done: true });
  return result({ text: `Cae en ${title}`, done: true });
}

/**
 * Resultados de las personas de la UVa por prueba: medalla si el cuadro final ya la decide, ronda en la que caen o
 * avanzan, y puesto en el grupo si aún no han llegado al cuadro final. Solo usa los cuadros ya públicos.
 */
export function uvaResults(draws: PublicDraw[]): PublicResult[] {
  const out: PublicResult[] = [];
  const bases = new Set(draws.map((d) => d.base));
  for (const base of bases) {
    const ofBase = draws.filter((d) => d.base === base);
    const knockouts = ofBase.filter((d) => d.type === 'knockout' && d.rounds?.length);
    const done = new Set<string>();
    for (const k of knockouts) {
      const labels = new Set((k.rounds ?? []).flatMap((r) => r.matches.flatMap((m) => [m.a, m.b])).filter((e) => e.uva).map((e) => e.label));
      for (const label of labels) {
        const r = knockoutResult(base, k.rounds!, label);
        if (r) {
          out.push(r);
          done.add(label);
        }
      }
    }
    for (const g of ofBase.filter((d) => d.type === 'roundrobin' && d.standings)) {
      for (const s of g.standings!) {
        if (!s.entrant.uva || done.has(s.entrant.label)) continue;
        const where = g.group ?? 'la liguilla';
        const qualified = g.qualify !== undefined && s.rank <= g.qualify;
        const pure = !knockouts.length && !g.group; // liguilla única: el puesto decide el podio
        const place = pure && s.rank <= 3 ? (s.rank as 1 | 2 | 3) : undefined;
        out.push({
          event: base,
          entrant: s.entrant.label,
          place,
          text: `${s.rank}.º en ${where}${qualified ? ' · se clasifica para el cuadro final' : ''}`,
          done: pure,
        });
      }
    }
  }
  return out.sort((a, b) => (a.place ?? 9) - (b.place ?? 9) || a.event.localeCompare(b.event, 'es') || a.entrant.localeCompare(b.entrant, 'es'));
}
