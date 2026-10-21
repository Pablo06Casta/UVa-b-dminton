import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { SyncEngine } from '../src/engine';
import { createPlayer } from '../src/roster';
import { FakeSource, GUID, info, memDb, PROFILE, row } from './helpers/fakes';

const min = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

beforeEach(() => {
  settings.officialReadEnabled = true;
  settings.rankingUrls = [];
});

describe('detección de cambios en badminton.es', () => {
  it('una inscripción nueva en la lista de jugadores adelanta la lectura de las pruebas (no espera horas)', async () => {
    const NOW = new Date('2026-10-21T10:00:00+02:00');
    const db = memDb();
    const src = new FakeSource();
    src.infoData = info({ startDate: '2026-11-07', endDate: '2026-11-08', days: ['2026-11-07', '2026-11-08'] });
    src.drawList = [];
    src.draws = (async () => { throw new Error('sin cuadros'); }) as never;
    let events = 0;
    let players = [{ tsPlayerId: 7, name: 'Ana Prueba' }];
    src.events = (async () => (events++, [{ eventId: 1, name: 'IM' }])) as never;
    src.eventEntries = (async () => [{ names: ['Ana Prueba'], status: 'confirmed', label: 'Main draw' }]) as never;
    src.tournamentPlayers = (async () => players) as never;
    src.playerProfile = (async () => PROFILE) as never;
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const engine = new SyncEngine(db, src, () => NOW);

    let t = 0;
    for (; t < 40; t += 2) await engine.tick(min(NOW, t)); // primera vuelta completa
    expect(events).toBe(1);

    // Sin cambios en la lista: no se vuelve a leer la lista de pruebas antes de su turno.
    for (; t < 70; t += 2) await engine.tick(min(NOW, t));
    expect(events).toBe(1);

    // Aparece alguien nuevo en la lista: en la siguiente comprobación (≈ cada 30 min) se vuelven a leer las pruebas.
    players = [...players, { tsPlayerId: 8, name: 'Otra Persona' }];
    for (; t < 110; t += 2) await engine.tick(min(NOW, t));
    expect(events).toBe(2);
  });

  it('un partido que acaba de terminar adelanta la lectura de los cuadros', async () => {
    const NOW = new Date('2026-11-07T10:00:00+01:00');
    const db = memDb();
    const src = new FakeSource();
    src.infoData = info();
    src.dayRows = [row({ status: 'on_court' })];
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const engine = new SyncEngine(db, src, () => NOW);
    let t = 0;
    for (; t < 12; t++) await engine.tick(min(NOW, t));
    // Cuadros: cada 10 min en jornada. Justo después de leerlos, termina el partido.
    const drawsBefore = src.calls.filter((c) => c === 'draws').length;
    src.dayRows = [row({ status: 'finished', winner: 1, sets: [[21, 10], [21, 12]] })];
    let finishedAt = -1;
    for (; t < 24; t++) {
      const k = await engine.tick(min(NOW, t));
      if (k?.startsWith('day') && finishedAt < 0 && src.calls.at(-1) === 'day') finishedAt = t;
      if (src.calls.filter((c) => c === 'draws').length > drawsBefore) break;
    }
    expect(src.calls.filter((c) => c === 'draws').length).toBeGreaterThan(drawsBefore);
    expect(t).toBeLessThan(finishedAt + 6); // en pocos minutos, no al cabo de 10
  });

  it('una lectura adelantada espera al menos 2 minutos desde la última de lo mismo', () => {
    const NOW = new Date('2026-11-07T10:00:00+01:00');
    const db = memDb();
    const engine = new SyncEngine(db, new FakeSource(), () => NOW);
    db.prepare('insert into tournaments(guid, name, start_date, end_date, days_json, info_ok_at, discovered_at, draws_ok_at) values(?,?,?,?,?,?,?,?)').run(
      GUID, 'T', '2026-11-07', '2026-11-07', '["2026-11-07"]', NOW.toISOString(), NOW.toISOString(), min(NOW, -1).toISOString(),
    );
    const kicked = (engine as unknown as { kicked: Map<string, number> }).kicked;
    engine.kick(`draws:${GUID}`, NOW);
    expect(kicked.get(`draws:${GUID}`)).toBe(min(NOW, 1).getTime()); // se leyó hace 1 min: toca dentro de 1 min, no ya
    engine.kick(`draws:${GUID}`, min(NOW, 5));
    expect(kicked.get(`draws:${GUID}`)).toBe(min(NOW, 1).getTime()); // se conserva el turno más próximo
  });
});
