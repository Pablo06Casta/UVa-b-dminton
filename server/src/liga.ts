import { createHash } from 'node:crypto';
import { daysBetween, todayIn } from './dates';
import type { LigaFixture, LigaStanding } from './ligaParse';
import { titleCase } from './rankingParse';
import { isUvaClub } from './uva';

/** Lo que el servidor guarda de la división de la Liga que sigue (se rehace en cada lectura). */
export interface LigaSnapshot {
  tournamentId: string;
  edition: string;
  division: string;
  drawId: number;
  /** Cuándo se averiguó la edición y la división (se repite cada 24 h). */
  resolvedAt: string;
  updatedAt: string;
  standings: LigaStanding[];
  fixtures: LigaFixture[];
}

const TZ = 'Europe/Madrid';

/** La edición más reciente: «Liga Nacional de Clubes edición 2026-2027» (se ignoran pruebas, regionales y otras competiciones). */
export function latestEdition(list: { id: string; name: string }[]): { id: string; name: string } | undefined {
  return list
    .map((t) => ({ ...t, year: Number(/^Liga Nacional de Clubes\s+edici.n\s+(\d{4})-\d{4}$/i.exec(t.name)?.[1]) }))
    .filter((t) => t.year > 0)
    .sort((a, b) => b.year - a.year)[0];
}

/** Cada cuánto conviene volver a leer: a menudo en jornada, cada hora si hay encuentros cerca, y poco si no hay nada próximo. */
export function ligaEveryMs(s: Pick<LigaSnapshot, 'fixtures'> | undefined, now: Date): number {
  const today = todayIn(TZ, now);
  const dated = (s?.fixtures ?? []).filter((f) => f.date);
  if (dated.some((f) => f.date === today)) return 5 * 60_000;
  if (dated.some((f) => f.homeScore === undefined && daysBetween(today, f.date!) >= 0 && daysBetween(today, f.date!) <= 3)) return 60 * 60_000;
  return 12 * 3600_000;
}

/** Los nombres oficiales vienen a veces en mayúsculas («CD UNIVERSIDAD DE VALLADOLID»). */
const niceName = (n: string) => (n === n.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(n) ? titleCase(n).replace(/\bCd\b/, 'CD').replace(/\bAd\b/, 'AD').replace(/\bA\.d\./, 'A.D.') : n);

export interface PublicLigaClub extends LigaStanding {
  uva: boolean;
}
export interface PublicLigaFixture {
  id: number;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  date?: string;
  time?: string;
  moved: boolean;
  uva: boolean;
  status: 'scheduled' | 'finished';
  url: string;
}
export interface PublicLiga {
  edition: string;
  division: string;
  updatedAt: string;
  /** Página oficial de la división. */
  officialUrl: string;
  /** `false` hasta que se juegue el primer encuentro (la clasificación aún está a cero). */
  started: boolean;
  clubs: PublicLigaClub[];
  rounds: { round: number; date?: string; fixtures: PublicLigaFixture[] }[];
  /** Jornada que toca ahora: la primera con algún encuentro sin jugar. */
  currentRound?: number;
  version: string;
}

export function buildLiga(s: LigaSnapshot | undefined): PublicLiga | undefined {
  if (!s) return undefined;
  const clubs = s.standings.map((c) => ({ ...c, club: niceName(c.club), uva: isUvaClub(c.club) }));
  const byRound = new Map<number, PublicLigaFixture[]>();
  for (const f of s.fixtures) {
    const list = byRound.get(f.round) ?? [];
    list.push({
      id: f.id, home: niceName(f.home), away: niceName(f.away), homeScore: f.homeScore, awayScore: f.awayScore, date: f.date, time: f.time, moved: f.moved,
      uva: isUvaClub(f.home) || isUvaClub(f.away), status: f.homeScore !== undefined ? 'finished' : 'scheduled',
      url: `https://www.badminton.es/sport/teammatch.aspx?id=${s.tournamentId}&match=${f.id}`,
    });
    byRound.set(f.round, list);
  }
  const rounds = [...byRound]
    .sort((a, b) => a[0] - b[0])
    .map(([round, fixtures]) => ({ round, date: fixtures.map((f) => f.date).filter(Boolean).sort()[0], fixtures: fixtures.sort((a, b) => `${a.date ?? '9'}${a.time ?? ''}`.localeCompare(`${b.date ?? '9'}${b.time ?? ''}`) || Number(b.uva) - Number(a.uva)) }));
  const body = { edition: s.edition, division: s.division, clubs, rounds };
  return {
    edition: s.edition,
    division: s.division,
    updatedAt: s.updatedAt,
    officialUrl: `https://www.badminton.es/sport/league/draw?id=${s.tournamentId}&draw=${s.drawId}`,
    started: clubs.some((c) => c.played > 0),
    clubs,
    rounds,
    currentRound: rounds.find((r) => r.fixtures.some((f) => f.status === 'scheduled'))?.round,
    version: createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12),
  };
}
