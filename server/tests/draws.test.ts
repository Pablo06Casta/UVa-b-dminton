import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import type { BracketRound, StandingRow } from '../src/model';
import { FakeSource, GUID, memDb, PROFILE, standing } from './helpers/fakes';

const NOW = new Date('2026-11-07T10:00:00+01:00');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const consent = { consentBy: 'Ella misma', consentAt: '2026-10-01' };

const club: StandingRow[] = [standing(['Ana Prueba'], [1], 'UNIVERSIDAD DE VALLADOLID'), standing(['Rival Uno'], [2], 'OTRO CLUB')];
const other: StandingRow[] = [standing(['Pedro Otro'], [3], 'CLUB X'), standing(['Luis Otro'], [4], 'CLUB Y')];
const entrant = (names: string[], ids: number[], club?: string, placeholder?: string) => ({ names, ids, club, placeholder });
const finalIM: BracketRound[] = [{ title: 'Final', matches: [{ a: entrant([], [], undefined, 'Grupo A #1'), b: entrant([], [], undefined, 'Grupo B #1'), sets: [] }] }];
const groupMatches: BracketRound[] = [{ title: 'Ronda 1', matches: [{ a: entrant(['Ana Prueba'], [1], 'UNIVERSIDAD DE VALLADOLID'), b: entrant(['Rival Uno'], [2], 'OTRO CLUB'), winner: 1, sets: [[21, 10], [21, 12]] }] }];

function world() {
  const db = memDb();
  const src = new FakeSource();
  const calls: string[] = [];
  src.drawList = [
    { drawId: 1, name: 'IM - Grupo A', type: 'roundrobin' },
    { drawId: 2, name: 'IM - Grupo B', type: 'roundrobin' },
    { drawId: 3, name: 'DM - Grupo A', type: 'roundrobin' },
    { drawId: 4, name: 'IM', type: 'knockout' },
    { drawId: 5, name: 'DM', type: 'knockout' },
  ];
  src.standings = (async (_g: string, id: number) => (calls.push(`standings:${id}`), id === 1 ? club : other)) as never;
  src.bracket = (async (_g: string, id: number) => (calls.push(`bracket:${id}`), id === 4 ? finalIM : id === 5 ? [] : id === 1 ? groupMatches : [])) as never;
  createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
  return { db, src, calls, engine: new SyncEngine(db, src, () => NOW) };
}
const run = async (e: SyncEngine, from: number, n = 8) => {
  for (let i = 0; i < n; i++) await e.tick(min(from + i));
};

beforeEach(() => {
  settings.opponents = 'none';
  settings.officialReadEnabled = true;
});

describe('lectura eficiente de grupos y cuadros', () => {
  it('la primera lectura recorre todo; después solo donde juega alguien del club y los cuadros finales de esa prueba', async () => {
    const { calls, engine } = world();
    await run(engine, 0);
    const first = calls.filter((c) => c.startsWith('standings') || c.startsWith('bracket'));
    expect(first.filter((c) => c.startsWith('standings'))).toHaveLength(3); // los tres grupos
    calls.length = 0;
    // pasa el tiempo (menos que la lectura completa): se vuelve a leer la jornada
    await run(engine, 30, 10);
    const later = calls.filter((c) => c.startsWith('standings') || c.startsWith('bracket'));
    expect(later).toContain('standings:1'); // el grupo con la UVa
    expect(later).toContain('bracket:4'); // el cuadro final de su prueba (IM)
    expect(later).not.toContain('standings:2'); // grupos sin nadie del club
    expect(later).not.toContain('standings:3');
    expect(later).not.toContain('bracket:5'); // cuadro de otra prueba (DM) sin nadie del club
  });

  it('cada cierto tiempo hace una lectura completa para no perder cambios', async () => {
    const { calls, engine } = world();
    await run(engine, 0);
    calls.length = 0;
    settings.intervals.drawsFull = 60_000; // 1 minuto
    await run(engine, 90, 10);
    expect(calls).toContain('standings:2');
    expect(calls).toContain('bracket:5');
    settings.intervals.drawsFull = 360 * 60_000;
  });

  it('los partidos del grupo solo se piden si hay alguien del club', async () => {
    const { calls, engine } = world();
    await run(engine, 0);
    expect(calls).toContain('bracket:1');
    expect(calls).not.toContain('bracket:2');
    expect(calls).not.toContain('bracket:3');
  });
});

describe('cuadros públicos', () => {
  it('muestra los grupos con la UVa (clasificación y partidos) y su cuadro final, con cuántos pasan de cada grupo', async () => {
    const { db, engine } = world();
    await run(engine, 0);
    const [t] = buildPublicState(db, NOW).tournaments;
    const a = t.draws.find((d) => d.id === 1)!;
    expect(a).toMatchObject({ base: 'IM', group: 'Grupo A', type: 'roundrobin', qualify: 1 });
    expect(a.standings![0].entrant).toMatchObject({ label: 'Ana Prueba', uva: true });
    expect(a.rounds![0].matches[0]).toMatchObject({ winner: 1, sets: [[21, 10], [21, 12]] });
    expect(t.draws.some((d) => d.id === 2 || d.id === 3 || d.id === 5)).toBe(false); // sin la UVa, no se publican
    // el cuadro final de la prueba (IM) también se muestra, aunque aún solo tenga plazas «Grupo A #1»
    const fin = t.draws.find((d) => d.base === 'IM' && d.type === 'knockout')!;
    expect(fin.rounds![0].matches[0].a.placeholder).toBe('Grupo A #1');
  });

  it('recuerda cuántos pasan de cada grupo aunque el cuadro final ya tenga nombres', async () => {
    const { db, src, engine } = world();
    await run(engine, 0);
    // el cuadro final ahora muestra a los clasificados, no las plazas «Grupo A #1»
    src.bracket = (async (_g: string, id: number) => (id === 4 ? [{ title: 'Final', matches: [{ a: entrant(['Ana Prueba'], [1], 'UNIVERSIDAD DE VALLADOLID'), b: entrant(['Pedro Otro'], [3], 'CLUB X'), sets: [] }] }] : id === 1 ? groupMatches : [])) as never;
    settings.intervals.drawsFull = 1;
    await run(engine, 60, 10);
    settings.intervals.drawsFull = 360 * 60_000;
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.draws.find((d) => d.id === 1)!.qualify).toBe(1);
    const fin = t.draws.find((d) => d.base === 'IM' && d.type === 'knockout')!;
    expect(fin.rounds![0].matches[0].a).toMatchObject({ label: 'Ana Prueba', uva: true });
  });
});

void GUID;
