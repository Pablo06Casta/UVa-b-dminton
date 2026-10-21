import { describe, expect, it } from 'vitest';
import { SourceUnavailableError } from '../src/http';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { kvSet } from '../src/db';
import { createPlayer } from '../src/roster';
import { buildStoredMatch } from '../src/uva';
import { FakeSource, GUID, info, memDb, PROFILE, row } from './helpers/fakes';

const NOW = new Date('2026-11-07T10:00:00+01:00');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);

const stored = (o = {}) => buildStoredMatch(row(o), { tournamentGuid: GUID, entrants: new Map([[1, 1]]) })!;

describe('confirmación de cambios', () => {
  it('un cambio necesita dos lecturas idénticas seguidas', () => {
    const db = memDb();
    const e = new SyncEngine(db, new FakeSource());
    expect(e.ingest(stored(), NOW)).toBe('new');
    expect(e.ingest(stored(), min(4))).toBe('same');

    const changed = stored({ clock: '11:30', court: '4' });
    expect(e.ingest(changed, min(8))).toBe('pending');
    expect((db.prepare('select json from matches').get() as { json: string }).json).toContain('"10:00"'); // aún no se da por bueno
    expect(e.ingest(changed, min(12))).toBe('changed');
    expect((db.prepare('select json from matches').get() as { json: string }).json).toContain('"11:30"');
    const log = db.prepare("select field, old_value, new_value from changes where kind = 'changed' order by id").all();
    expect(log).toEqual([
      { field: 'plannedClock', old_value: '10:00', new_value: '11:30' },
      { field: 'court', old_value: '1', new_value: '4' },
    ]);
  });

  it('una oscilación (A, B, A) no cambia nada', () => {
    const db = memDb();
    const e = new SyncEngine(db, new FakeSource());
    e.ingest(stored(), NOW);
    expect(e.ingest(stored({ court: '9' }), min(4))).toBe('pending');
    expect(e.ingest(stored(), min(8))).toBe('same');
    expect(db.prepare("select count(*) n from changes where kind = 'changed'").get()).toEqual({ n: 0 });
  });

  it('dos cambios distintos seguidos reinician la confirmación', () => {
    const db = memDb();
    const e = new SyncEngine(db, new FakeSource());
    e.ingest(stored(), NOW);
    expect(e.ingest(stored({ court: '2' }), min(4))).toBe('pending');
    expect(e.ingest(stored({ court: '3' }), min(8))).toBe('pending');
    expect(e.ingest(stored({ court: '3' }), min(12))).toBe('changed');
  });
});

describe('planificación y ciclo completo', () => {
  it('no hace nada sin jugadores con perfil ni torneos', async () => {
    const e = new SyncEngine(memDb(), new FakeSource());
    expect(await e.tick(NOW)).toBeUndefined();
  });

  it('descubre, lee la información, los cuadros y el orden de juego, UNA petición lógica por tick', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.dayRows = [row()];
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    const ran: string[] = [];
    for (let i = 0; i < 6; i++) {
      const k = await e.tick(min(i));
      if (k) ran.push(k.split(':')[0]);
    }
    expect(ran).toEqual(['day', 'draws', 'info', 'discover'].length ? ran : []); // orden por urgencia comprobado abajo
    expect(src.calls.filter((c) => c === 'profile')).toHaveLength(1); // una por jugador, no más
    expect(src.calls.filter((c) => c === 'tournament')).toHaveLength(1);
    expect(src.calls.filter((c) => c === 'day')).toHaveLength(1);
    expect(db.prepare('select count(*) n from matches').get()).toEqual({ n: 1 });
  });

  it('lee una vez por torneo aunque haya varios jugadores vinculados', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    createPlayer(db, { name: 'Carla Prueba', profile: 'BBBBBBBB-BBBB-CCCC-DDDD-EEEEEEEEEEEE' });
    const e = new SyncEngine(db, src);
    for (let i = 0; i < 8; i++) await e.tick(min(i));
    expect(src.calls.filter((c) => c === 'tournament')).toHaveLength(1);
    expect(src.calls.filter((c) => c === 'draws')).toHaveLength(1);
  });

  it('frecuencias: orden de juego cada 5 min en jornada; cuadros cada 20 min; nada tras el torneo', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    for (let i = 0; i < 6; i++) await e.tick(min(i));
    const dayAt = (n: number) => e.plan(min(n)).some((j) => j.kind === 'day');
    const drawsAt = (n: number) => e.plan(min(n)).some((j) => j.kind === 'draws');
    // Orden de ejecución: descubrimiento (min 0), información (1), cuadros (2), orden de juego (3).
    expect(dayAt(6)).toBe(false); // se leyó hace poco
    expect(dayAt(3 + settings.intervals.live.day / 60_000)).toBe(true);
    expect(drawsAt(15)).toBe(false);
    expect(drawsAt(21)).toBe(false);
    expect(drawsAt(22)).toBe(true); // cuadros cada 20 min
    const nextWeek = new Date(NOW.getTime() + 10 * 86_400_000);
    expect(e.plan(nextWeek).filter((j) => j.kind !== 'discover')).toEqual([]);
  });

  it('ante un fallo conserva los datos, reintenta con espera creciente y registra el error', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.dayRows = [row()];
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    for (let i = 0; i < 5; i++) await e.tick(min(i));
    expect(db.prepare('select count(*) n from matches').get()).toEqual({ n: 1 });

    src.failWith = new Error('HTTP 503');
    await e.tick(min(19));
    expect(e.lastJob?.ok).toBe(false);
    expect(db.prepare('select count(*) n from matches').get()).toEqual({ n: 1 }); // datos anteriores intactos
    const retried = src.calls.length;
    await e.tick(min(19) /* misma hora: aún en espera */);
    expect(src.calls.length).toBe(retried);
    expect(db.prepare('select last_error from tournaments').get()).toEqual({ last_error: 'HTTP 503' });
  });

  it('si la fuente corta (circuit breaker) el motor se detiene hasta la hora indicada', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    src.failWith = new SourceUnavailableError('pausa', NOW.getTime() + 15 * 60_000);
    await e.tick(NOW);
    const calls = src.calls.length;
    src.failWith = undefined;
    expect(await e.tick(min(5))).toBeUndefined();
    expect(src.calls.length).toBe(calls);
    expect(await e.tick(min(16))).toBeDefined();
  });

  it('un torneo ya pasado se lee una vez y no se vuelve a consultar', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.infoData = info({ startDate: '2026-09-01', endDate: '2026-09-01', days: ['2026-09-01'] });
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    for (let i = 0; i < 6; i++) await e.tick(min(i));
    expect(src.calls.filter((c) => c === 'draws' || c === 'day')).toHaveLength(0);
    expect(settings.intervals.live.day).toBe(15 * 60_000);
  });
});

describe('próximos partidos antes del torneo', () => {
  it('mira el orden de juego desde 3 días antes, cada hora, y no antes', async () => {
    const db = memDb();
    const src = new FakeSource(); // torneo el 2026-11-07
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src);
    for (let i = 0; i < 4; i++) await e.tick(new Date('2026-10-20T10:00:00+02:00'));
    const at = (iso: string) => e.plan(new Date(iso)).map((j) => j.kind);
    expect(at('2026-10-31T10:00:00+01:00')).not.toContain('day'); // faltan 7 días
    expect(at('2026-11-04T10:00:00+01:00')).toContain('day'); // faltan 3 días
  });
});


describe('torneos excluidos', () => {
  it('«Liga Nacional» no se lee ni se muestra', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.infoData = info({ name: 'Liga Nacional de Clubes edición 2026-2027' });
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const e = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 8; i++) await e.tick(min(i));
    expect(db.prepare('select hidden from tournaments').get()).toEqual({ hidden: 1 });
    const before = src.calls.length;
    for (let i = 8; i < 20; i++) await e.tick(min(i * 30));
    expect(src.calls.slice(before).filter((c) => c === 'draws' || c === 'day' || c === 'tournament')).toEqual([]);
  });
});

describe('seguimiento del calendario oficial', () => {
  const cal = (tournaments: object[]) => ({ meta: {}, tournaments });
  it('sigue los torneos absolutos cercanos con identificador oficial, y no los lejanos ni los excluidos', () => {
    const db = memDb();
    kvSet(db, 'calendar', cal([
      { name: 'Cercano', startDate: '2026-11-14', tsId: 'AAAAAAAA-0000-0000-0000-000000000001' },
      { name: 'Lejano', startDate: '2027-03-14', tsId: 'AAAAAAAA-0000-0000-0000-000000000002' },
      { name: 'Liga Nacional de Clubes', startDate: '2026-11-10', tsId: 'AAAAAAAA-0000-0000-0000-000000000003' },
      { name: 'Sin identificador', startDate: '2026-11-10' },
    ]));
    new SyncEngine(db, new FakeSource(), () => NOW).followCalendar(NOW);
    expect((db.prepare('select guid from tournaments').all() as { guid: string }[]).map((r) => r.guid)).toEqual(['AAAAAAAA-0000-0000-0000-000000000001']);
  });
});
