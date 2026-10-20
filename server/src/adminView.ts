import { type Db, kvGet } from './db';
import type { Estimate } from './estimate';
import { listPlayers } from './roster';
import type { StoredMatch } from './uva';

export interface AdminMatch {
  id: string;
  event?: string;
  /** Nombres de ambos lados: esta vista es solo para la administración del club. */
  sides: [string, string];
  state: 'scheduled' | 'live' | 'finished';
  date?: string;
  time?: string;
  court?: string;
  score?: string;
  outcome?: 'win' | 'loss';
  plannedStart?: string;
  estimatedStart?: string;
}

export interface AdminPlayerOverview {
  id: number;
  name: string;
  public: boolean;
  profileLinked: boolean;
  tournaments: {
    guid: string;
    name: string;
    startDate?: string;
    endDate?: string;
    city?: string;
    checkedAt?: string;
    progress?: { finished: number; total: number; estimatedEnd?: string };
    matches: AdminMatch[];
  }[];
}

const state = (s: StoredMatch['status']): AdminMatch['state'] => (s === 'on_court' ? 'live' : s === 'scheduled' || s === 'unknown' ? 'scheduled' : 'finished');

/** Vista de seguimiento para la administración: por jugador de la lista, sus torneos y partidos, publicados o no. */
export function buildOverview(db: Db): AdminPlayerOverview[] {
  const tournaments = db.prepare('select * from tournaments where hidden = 0').all() as unknown as {
    guid: string; name: string; start_date: string | null; end_date: string | null; city: string | null; info_ok_at: string | null; draws_ok_at: string | null;
  }[];

  return listPlayers(db).map((p) => {
    const linked = new Set((db.prepare('select tournament_guid g from tournament_players where player_id = ?').all(p.id) as unknown as { g: string }[]).map((r) => r.g));
    const out: AdminPlayerOverview['tournaments'] = [];
    for (const t of tournaments) {
      const est = kvGet<Estimate & { date: string }>(db, `estimate:${t.guid}`);
      const matches: AdminMatch[] = [];
      for (const r of db.prepare('select json from matches where tournament_guid = ?').all(t.guid) as unknown as { json: string }[]) {
        const m = JSON.parse(r.json) as StoredMatch;
        const mine = m.sides.findIndex((s) => s.players.some((x) => x.rosterId === p.id));
        if (mine < 0) continue;
        const st = state(m.status);
        const flip = (x: [number, number]): [number, number] => (mine === 0 ? x : [x[1], x[0]]);
        const sets = m.sets.map(flip);
        matches.push({
          id: m.key,
          event: [m.eventCode ?? m.drawName, m.round].filter(Boolean).join(' · ') || undefined,
          sides: [m.sides[0].players.map((x) => x.name).join(' / ') || m.sides[0].placeholder || '—', m.sides[1].players.map((x) => x.name).join(' / ') || m.sides[1].placeholder || '—'],
          state: st,
          date: m.date,
          time: m.plannedClock,
          court: m.court,
          score: st === 'finished' ? (m.status === 'walkover' ? 'W.O.' : sets.map((s) => s.join('-')).join(' ') || undefined) : undefined,
          outcome: st === 'finished' && m.winner ? (m.winner === mine + 1 ? 'win' : 'loss') : undefined,
          plannedStart: m.plannedUtc,
          estimatedStart: st === 'scheduled' ? est?.starts?.[m.key] : undefined,
        });
      }
      if (!linked.has(t.guid) && matches.length === 0) continue;
      const checkedAt = [t.info_ok_at, t.draws_ok_at].filter((x): x is string => !!x).sort().at(-1);
      out.push({
        guid: t.guid, name: t.name, startDate: t.start_date ?? undefined, endDate: t.end_date ?? undefined, city: t.city ?? undefined, checkedAt,
        progress: est ? { finished: est.finished, total: est.total, estimatedEnd: est.estimatedEnd } : undefined,
        matches: matches.sort((a, b) => `${a.date ?? ''} ${a.time ?? ''}`.localeCompare(`${b.date ?? ''} ${b.time ?? ''}`)),
      });
    }
    out.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    return { id: p.id, name: p.name, public: p.public, profileLinked: !!p.profileGuid, tournaments: out };
  });
}
