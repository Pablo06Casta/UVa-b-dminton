/**
 * Pruebas con páginas oficiales REALES de badminton.es guardadas como ejemplos (torneo de Valladolid, 3-oct-2026).
 * Los ficheros no se suben al repositorio (contienen nombres de personas): `npm run fixtures:copy` los copia desde
 * el repositorio privado badmiton.live. Sin ellos, estas pruebas se omiten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TournamentInfo } from '@/lib/domain/types';
import { parseDayMatchesPage, parseTournamentPage } from '@/lib/ts/parse/pages';
import { parseBracket, parseDrawsList, parseStandingTable } from '@/lib/ts/parse/draws';
import { SyncEngine } from '../src/engine';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import type { OfficialSource } from '../src/source';
import { isUvaClub } from '../src/uva';
import { memDb } from './helpers/fakes';

const dir = path.join(import.meta.dirname, 'fixtures');
const has = (f: string) => fs.existsSync(path.join(dir, f));
const F = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
const ready = ['tournament-valladolid.html', 'standings-valladolid-a.html', 'draws-estella.html', 'draw-valladolid-ko-im.html', 'matches-valladolid-20261003.html'].every(has);

const GUID = 'AAAAAAAA-0000-0000-0000-000000000001';
const DAY = '2026-10-03';
const NOW = new Date('2026-10-03T21:00:00+02:00');

describe.skipIf(!ready)('con páginas oficiales reales', () => {
  const info = (): TournamentInfo => parseTournamentPage(F('tournament-valladolid.html'), GUID);
  const rows = () => parseDayMatchesPage(F('matches-valladolid-20261003.html'), { tournamentId: GUID, date: DAY, tz: 'Europe/Madrid', baseUrl: 'https://www.badminton.es' });
  const uvaRow = () => parseStandingTable(F('standings-valladolid-a.html')).find((r) => isUvaClub(r.club))!;

  /** Fuente que sirve las páginas reales guardadas en lugar de pedirlas a la red. */
  const source = (): OfficialSource => ({
    profile: async () => ({ name: 'x', tournamentIds: [GUID] }),
    tournament: async () => info(),
    draws: async () => parseDrawsList(F('draws-estella.html')),
    standings: async () => parseStandingTable(F('standings-valladolid-a.html')),
    bracket: async () => parseBracket(F('draw-valladolid-ko-im.html')),
    day: async () => rows(),
    calendar: async () => ({ fesba: [], finder: [] }),
  });

  it('las páginas reales se leen y el club aparece en la clasificación', () => {
    expect(info().name).toBeTruthy();
    expect(rows().length).toBeGreaterThan(10);
    const u = uvaRow();
    expect(u).toBeDefined();
    expect(u.ids.length).toBeGreaterThan(0);
  });

  it('de extremo a extremo: descubre, identifica al jugador del club por la clasificación y guarda sus partidos', async () => {
    const db = memDb();
    const u = uvaRow();
    // El nombre sale de la propia página: no se escribe ningún nombre real en el código.
    createPlayer(db, { name: u.names[0], profile: 'BBBBBBBB-0000-0000-0000-000000000002', public: true, consentBy: 'Prueba', consentAt: '2026-10-01' });
    const engine = new SyncEngine(db, source(), () => NOW);
    for (let i = 0; i < 10; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));

    expect((db.prepare('select count(*) n from entrants where club is not null').get() as { n: number }).n).toBeGreaterThan(0);
    const mine = db.prepare('select json from matches').all() as unknown as { json: string }[];
    expect(mine.length).toBeGreaterThan(0);
    expect((db.prepare('select count(*) n from slots').get() as { n: number }).n).toBe(rows().length); // todos los partidos, para la estimación
    expect((db.prepare('select count(*) n from draws').get() as { n: number }).n).toBeGreaterThan(0);

    const state = buildPublicState(db, NOW);
    const [t] = state.tournaments;
    expect(t.uvaPlayers).toEqual([u.names[0]]);
    // Entre los partidos guardados hay más personas con el club de la UVA que no están en la lista: esos NO se publican.
    const onlyMine = mine.filter((r) => {
      const m = JSON.parse(r.json) as { sides: { players: { uva: boolean; name: string }[] }[] };
      return m.sides.flatMap((x) => x.players).filter((p) => p.uva).every((p) => p.name === u.names[0]);
    });
    expect(t.matches.length).toBe(onlyMine.length);
    expect(t.matches.length).toBeLessThanOrEqual(mine.length);
    expect(t.matches.every((m) => m.players.includes(u.names[0]))).toBe(true);

    // Estimación con duraciones reales
    expect(t.progress).toBeDefined();
    expect(t.progress!.total).toBe(rows().length);
    expect(t.progress!.basis).toBe('observed');
    expect(t.progress!.avgDurationMin).toBeGreaterThan(5);
    expect(t.progress!.avgDurationMin).toBeLessThan(90);
    console.log('[real] partidos guardados del club:', mine.length, '· publicables (jugador con consentimiento):', t.matches.length, '| partidos del día:', t.progress!.total, '· terminados:', t.progress!.finished, '· duración media:', t.progress!.avgDurationMin, 'min · pistas:', t.progress!.courts, '· retraso medio:', t.progress!.delayMin, 'min');
  });

  it('ningún nombre de un tercero ni de un jugador oculto llega a la API pública', async () => {
    const db = memDb();
    const u = uvaRow();
    createPlayer(db, { name: u.names[0], profile: 'BBBBBBBB-0000-0000-0000-000000000002', public: true, consentBy: 'Prueba', consentAt: '2026-10-01' });
    const engine = new SyncEngine(db, source(), () => NOW);
    for (let i = 0; i < 10; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    const json = JSON.stringify(buildPublicState(db, NOW));
    const others = new Set<string>();
    for (const r of rows()) for (const p of [...r.team1.players, ...r.team2.players]) if (p.name !== u.names[0]) others.add(p.name);
    for (const r of parseStandingTable(F('standings-valladolid-a.html'))) for (const n of r.names) if (n !== u.names[0]) others.add(n);
    expect(others.size).toBeGreaterThan(3);
    for (const name of others) expect(json).not.toContain(name);
  });

  it('estimación a mitad de jornada: se simula el mismo día con solo los primeros partidos terminados', async () => {
    const all = rows();
    const cut = 80; // los 80 primeros (por hora programada) ya terminados; el resto, pendientes
    const ordered = [...all].sort((a, b) => (a.plannedUtc ?? '').localeCompare(b.plannedUtc ?? ''));
    const midRows = ordered.map((r, i) => (i < cut ? r : { ...r, status: 'scheduled' as const, durationMin: undefined, winner: undefined, sets: [], court: undefined }));
    const now = new Date(Date.parse(ordered[cut].plannedUtc!) - 5 * 60_000);
    const db = memDb();
    const u = uvaRow();
    createPlayer(db, { name: u.names[0], profile: 'BBBBBBBB-0000-0000-0000-000000000002', public: true, consentBy: 'Prueba', consentAt: '2026-10-01' });
    const engine = new SyncEngine(db, { ...source(), day: async () => midRows }, () => now);
    for (let i = 0; i < 10; i++) await engine.tick(new Date(now.getTime() + i * 1000));
    const p = buildPublicState(db, now).tournaments[0].progress!;
    const realEnd = Math.max(...ordered.map((r) => Date.parse(r.plannedUtc!) + 30 * 60_000));
    expect(p).toMatchObject({ total: all.length, finished: cut, remaining: all.length - cut, basis: 'observed' });
    expect(Date.parse(p.estimatedEnd!)).toBeGreaterThan(now.getTime());
    expect(Date.parse(p.estimatedEndLow!)).toBeLessThanOrEqual(Date.parse(p.estimatedEndHigh!));
    const hhmm = (iso: string) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
    console.log('[real] a mitad de jornada → quedan', p.remaining, 'partidos · fin estimado', hhmm(p.estimatedEnd!), '(' + hhmm(p.estimatedEndLow!) + '–' + hhmm(p.estimatedEndHigh!) + ') · último programado', hhmm(new Date(realEnd - 30 * 60_000).toISOString()));
  });
});
