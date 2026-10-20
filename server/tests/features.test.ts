import { beforeEach, describe, expect, it } from 'vitest';
import { shareHtml } from '../src/api';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { buildPublicState, entrantLabel } from '../src/publicView';
import { createPlayer, listPlayers } from '../src/roster';
import { FakeSource, GUID, memDb, PROFILE, row, standing } from './helpers/fakes';

const NOW = new Date('2026-11-07T10:00:00+01:00');
const consent = { consentBy: 'Ella', consentAt: '2026-10-01' };

beforeEach(() => {
  settings.drawNames = 'initials';
  settings.officialReadEnabled = true;
});

describe('cuadros públicos', () => {
  const setup = async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    createPlayer(db, { name: 'Carla Prueba' }); // en la lista pero sin consentimiento
    src.standingRows = [
      standing(['Ana Prueba'], [1], 'UNIVERSIDAD DE VALLADOLID'),
      standing(['Carla Prueba'], [3], 'UNIVERSIDAD DE VALLADOLID'),
      standing(['Rival Uno'], [2], 'OTRO CLUB'),
    ];
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 6; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    return db;
  };

  it('muestra a la jugadora pública con su nombre, a los demás con iniciales y a su club como «Jugador/a UVa»', async () => {
    const db = await setup();
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.draws).toHaveLength(1);
    const labels = t.draws[0].standings!.map((s) => s.entrant.label);
    expect(labels).toEqual(['Ana Prueba', 'Jugador/a UVa', 'R. U.']);
    expect(JSON.stringify(t.draws)).not.toMatch(/Carla|Rival/);
  });

  it('PUBLIC_DRAW_NAMES=off oculta los cuadros y =full muestra los nombres', async () => {
    const db = await setup();
    settings.drawNames = 'off';
    expect(buildPublicState(db, NOW).tournaments[0].draws).toEqual([]);
    settings.drawNames = 'full';
    expect(JSON.stringify(buildPublicState(db, NOW).tournaments[0].draws)).toContain('Rival Uno');
    expect(JSON.stringify(buildPublicState(db, NOW).tournaments[0].draws)).not.toContain('Carla');
  });

  it('un cuadro sin jugadores públicos del club no se publica', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    src.standingRows = [standing(['Pedro Otro'], [8], 'OTRO CLUB')];
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 6; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    expect(buildPublicState(db, NOW).tournaments[0].draws).toEqual([]);
  });

  it('entrantLabel: parejas de dobles', () => {
    const db = memDb();
    createPlayer(db, { name: 'Ana Prueba', public: true, ...consent });
    expect(entrantLabel(['Ana Prueba', 'Pedro Otro'], 'X', listPlayers(db).filter((p) => p.public)).label).toBe('Ana Prueba / P. O.');
  });
});

describe('progreso y estimación publicados', () => {
  it('publica ritmo, retraso y hora estimada de fin, y la hora estimada de cada partido del club', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, ...consent });
    const planned = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
    const mk = (i: number, status: 'finished' | 'scheduled', mins?: number) =>
      ({ ...row({ key: `k${i}`, status, court: String((i % 2) + 1), names1: i === 5 ? [['Ana Prueba', 1]] : [['Otro Uno', 20 + i]], names2: [['Otro Dos', 40 + i]] }), plannedUtc: planned(i * 10 - 40), durationMin: mins, orderIndex: i }) as ReturnType<typeof row>;
    src.dayRows = [mk(0, 'finished', 30), mk(1, 'finished', 34), mk(2, 'finished', 28), mk(3, 'scheduled'), mk(4, 'scheduled'), mk(5, 'scheduled')];
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 8; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.progress).toMatchObject({ total: 6, finished: 3, remaining: 3, basis: 'observed', courts: 2, done: false });
    expect(t.progress!.avgDurationMin).toBeCloseTo(30.7, 0);
    expect(Date.parse(t.progress!.estimatedEnd!)).toBeGreaterThan(NOW.getTime());
    expect(t.matches).toHaveLength(1);
    expect(t.matches[0].estimatedStart).toBeDefined();
    expect(JSON.stringify(t.progress)).not.toContain('starts'); // las horas por partido de terceros no se publican
    expect(JSON.stringify(buildPublicState(db, NOW))).not.toMatch(/Otro (Uno|Dos)/);
  });
});

describe('calendario oficial automático', () => {
  it('guarda el calendario y no lo sustituye si la fuente devuelve vacío', async () => {
    const db = memDb();
    const src = new FakeSource();
    const fesba = [{ calendarId: '1', url: 'https://www.badminton.es/calendarevent/1', name: 'Máster n4-Absoluto', startDate: '2027-01-30', group: 'ESP_Absoluto', level: 'n4', city: 'Granollers', country: 'España', year: 2027, egid: '593' }];
    src.calendarData = { fesba, finder: [] } as never;
    const engine = new SyncEngine(db, src, () => NOW, { live: false, calendar: true });
    expect(await engine.tick(NOW)).toBe('calendar');
    const cal = JSON.parse((db.prepare("select v from kv where k = 'calendar'").get() as { v: string }).v);
    expect(cal.tournaments).toHaveLength(1);
    expect(cal.tournaments[0]).toMatchObject({ id: 'fesba-1', category: 'Nacional', source: 'official' });

    src.calendarData = { fesba: [], finder: [] } as never;
    const later = new Date(NOW.getTime() + 7 * 3600_000);
    await engine.tick(later);
    expect(JSON.parse((db.prepare("select v from kv where k = 'calendar'").get() as { v: string }).v).tournaments).toHaveLength(1); // se conserva
    expect(engine.lastJob?.ok).toBe(false);
  });

  it('sin la lectura en directo, el motor solo toca el calendario', async () => {
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const engine = new SyncEngine(db, src, () => NOW, { live: false, calendar: true });
    for (let i = 0; i < 5; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    expect(src.calls.every((c) => c === 'calendar')).toBe(true);
    void GUID;
  });
});

describe('compartir un partido', () => {
  it('genera una vista previa con etiquetas Open Graph y escapa el texto', () => {
    settings.siteUrl = 'https://club.example';
    const html = shareHtml('Torneo <x>', { id: 'k1', event: 'IM · Final', players: ['Ana Prueba'], state: 'finished', outcome: 'win', score: '21-10 21-12', court: '3' }, 'k1');
    expect(html).toContain('property="og:title" content="Ana Prueba · IM · Final"');
    expect(html).toContain('Victoria 21-10 21-12');
    expect(html).toContain('url=https://club.example/directo?partido=k1');
    expect(html).not.toContain('<x>');
  });
});

describe('vista de seguimiento para la administración', () => {
  it('incluye a jugadores ocultos y los nombres de los rivales, que la API pública nunca expone', async () => {
    const { buildOverview } = await import('../src/adminView');
    const db = memDb();
    const src = new FakeSource();
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE }); // oculta
    src.dayRows = [row({ status: 'finished', winner: 1, sets: [[21, 10], [21, 12]] })];
    const engine = new SyncEngine(db, src, () => NOW);
    for (let i = 0; i < 8; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    const [o] = buildOverview(db);
    expect(o).toMatchObject({ name: 'Ana Prueba', public: false, profileLinked: true });
    expect(o.tournaments[0].matches[0]).toMatchObject({ sides: ['Ana Prueba', 'Rival Uno'], state: 'finished', outcome: 'win', score: '21-10 21-12' });
    expect(JSON.stringify(buildPublicState(db, NOW))).not.toMatch(/Ana Prueba|Rival Uno/);
  });
});
