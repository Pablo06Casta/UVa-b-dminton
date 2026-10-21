import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import { FakeSource, GUID, info, memDb, PROFILE } from './helpers/fakes';

const NOW = new Date('2026-10-21T10:00:00+02:00');
const consent = { consentBy: 'Ella misma', consentAt: '2026-10-01' };

function world() {
  const db = memDb();
  const src = new FakeSource();
  src.infoData = info({ startDate: '2026-11-07', endDate: '2026-11-08', days: ['2026-11-07', '2026-11-08'] });
  src.drawList = []; // aún sin cuadros: solo hay inscripciones
  src.draws = (async () => { src.calls.push('draws'); throw new Error('sin cuadros'); }) as never;
  const reads: string[] = [];
  src.events = (async () => (reads.push('events'), [{ eventId: 1, name: 'IM' }, { eventId: 3, name: 'DM' }, { eventId: 22, name: 'DX' }])) as never;
  src.eventEntries = (async (_g: string, id: number) => {
    reads.push(`event:${id}`);
    if (id === 1) return [{ names: ['Ana Prueba'], status: 'confirmed', label: 'Main draw' }, { names: ['Rival Uno'], status: 'confirmed', label: 'Main draw' }];
    if (id === 3) return [{ names: ['Ana Prueba', 'Socio Menor'], status: 'reserve', label: 'Reserve' }];
    return [{ names: ['Ana P.'], status: 'unknown', label: '' }, { names: ['Luis Oculto'], status: 'confirmed', label: 'Main draw' }];
  }) as never;
  return { db, src, reads };
}

beforeEach(() => {
  settings.opponents = 'none';
  settings.officialReadEnabled = true;
  settings.rankingUrls = [];
});

describe('inscripción y admisión en torneos futuros', () => {
  it('lee una prueba por lectura y publica el estado de las personas del club con consentimiento', async () => {
    const { db, src, reads } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 12; i++) await engine.tick(new Date(NOW.getTime() + i * 5 * 60_000));
    expect(reads).toEqual(['events', 'event:1', 'event:3', 'event:22']); // una sola vuelta, una prueba por tick
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.entries).toEqual([
      { player: 'Ana Prueba', event: 'DM', status: 'reserve' },
      { player: 'Ana Prueba', event: 'IM', status: 'admitted' },
    ]);
    // La pareja, los rivales y las personas sin consentimiento no se guardan ni se publican.
    expect(JSON.stringify(t)).not.toMatch(/Socio Menor|Rival Uno|Luis Oculto/);
  });

  it('una persona sin consentimiento no aparece, y una baja sustituye al estado anterior', async () => {
    const { db, src } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 8; i++) await engine.tick(new Date(NOW.getTime() + i * 5 * 60_000));
    expect(buildPublicState(db, NOW).tournaments).toEqual([]);
    expect((db.prepare('select count(*) n from entries').get() as unknown as { n: number }).n).toBeGreaterThan(0);
  });

  it('vuelve a revisar las listas pasadas unas horas', async () => {
    const { db, src, reads } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 12; i++) await engine.tick(new Date(NOW.getTime() + i * 5 * 60_000));
    const first = reads.length;
    await engine.tick(new Date(NOW.getTime() + 2 * 3600_000)); // aún no toca (torneo a 17 días: cada 6 h)
    expect(reads.length).toBe(first);
    for (let i = 0; i < 6; i++) await engine.tick(new Date(NOW.getTime() + 7 * 3600_000 + i * 5 * 60_000));
    expect(reads.length).toBeGreaterThan(first);
  });
});
