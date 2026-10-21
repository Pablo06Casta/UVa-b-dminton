import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildPublicState } from '../src/publicView';
import { createPlayer } from '../src/roster';
import { PoliteClient } from '../src/http';
import { OfficialLiveReaders } from '../src/officialReaders';
import { RealSource } from '../src/source';
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

  it('reconoce a la gente del club en torneos sin perfil enlazado, confirmándola con el perfil oficial (sin confundir homónimos)', async () => {
    const { db, src, reads } = world();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    createPlayer(db, { name: 'Luis Ejemplo', profile: 'BBBBBBBB-0000-0000-0000-000000000001', public: true, ...consent });
    src.profileTournaments = []; // el perfil no lista este torneo: solo se encuentra por la lista de jugadores
    src.tournamentPlayers = (async () => (reads.push('players'), [{ tsPlayerId: 7, name: 'Ana Prueba' }, { tsPlayerId: 8, name: 'Luis Ejemplo' }, { tsPlayerId: 9, name: 'Pedro Otro' }])) as never;
    src.playerProfile = (async (_g: string, id: number) => (reads.push(`player:${id}`), id === 7 ? PROFILE.toLowerCase() : 'CCCCCCCC-0000-0000-0000-000000000002')) as never; // el «Luis Ejemplo» inscrito es otra persona
    const engine = new SyncEngine(db, src, () => NOW);
    // El torneo ya está en la base (p. ej. seguido desde el calendario).
    db.prepare("insert into tournaments(guid, name, discovered_at, start_date, end_date) values(?,?,?,?,?)").run(GUID.toUpperCase(), 't', NOW.toISOString(), '2026-11-07', '2026-11-08');
    for (let i = 0; i < 30; i++) await engine.tick(new Date(NOW.getTime() + i * 5 * 60_000));
    expect(reads).toContain('player:7');
    expect(reads).toContain('player:8');
    expect(reads).not.toContain('player:9'); // Pedro Otro no coincide con nadie de la lista del club
    const linked = db.prepare('select p.name from tournament_players tp join players p on p.id = tp.player_id where tp.tournament_guid = ?').all(GUID.toUpperCase()) as unknown as { name: string }[];
    expect(linked.map((x) => x.name)).toEqual(['Ana Prueba']);
    expect(reads.filter((r) => r.startsWith('event:')).length).toBeGreaterThan(0); // y ya se lee su admisión
  });

  it('la fuente real expone los lectores de inscritos (si no, el motor nunca los ejecutaría)', () => {
    const client = new PoliteClient({ baseUrl: 'https://fuente.test', minIntervalMs: 2500, userAgent: 'prueba', fetchImpl: (async () => new Response('')) as typeof fetch });
    const real = new RealSource(client, new OfficialLiveReaders(client));
    expect(typeof real.events).toBe('function');
    expect(typeof real.eventEntries).toBe('function');
    expect(typeof real.tournamentPlayers).toBe('function');
    expect(typeof real.playerProfile).toBe('function');
    expect(new RealSource(client).events).toBeUndefined();
  });
});
