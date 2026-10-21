import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { localToUtcIso } from '../src/dates';
import { SyncEngine } from '../src/engine';
import { estimateManual } from '../src/estimate';
import { addManualMatch, createManualTournament, deleteManualMatch, deleteManualTournament, listManual, setManualProgress, updateManualMatch } from '../src/manual';
import { notifyUpcoming, subscribe, type PushSender } from '../src/push';
import { buildPublicState } from '../src/publicView';
import { createPlayer, ValidationError } from '../src/roster';
import { FakeSource, memDb, PROFILE } from './helpers/fakes';

const consent = { consentBy: 'Club', consentAt: '2026-10-20' };
const NOW = new Date('2026-11-07T09:30:00Z'); // 10:30 en Madrid

beforeEach(() => {
  settings.officialReadEnabled = false;
  settings.opponents = 'none';
});

function scene() {
  const db = memDb();
  const ana = createPlayer(db, { name: 'Ana Prueba', public: true, ...consent });
  const luis = createPlayer(db, { name: 'Luis Prueba', public: true, ...consent });
  const guid = createManualTournament(db, { name: 'Torneo manual de prueba', startDate: '2026-11-07', city: 'Valladolid', playerIds: [ana.id, luis.id] });
  return { db, ana, luis, guid };
}

describe('hora local → UTC', () => {
  it('respeta el horario de invierno y de verano de Madrid', () => {
    expect(localToUtcIso('2026-11-07', '10:00')).toBe('2026-11-07T09:00:00.000Z');
    expect(localToUtcIso('2026-07-01', '10:00')).toBe('2026-07-01T08:00:00.000Z');
    expect(localToUtcIso('2026-11-07', '25:00x')).toBeUndefined();
  });
});

describe('torneos y partidos introducidos por el club', () => {
  it('aparecen en la API pública con la hora programada, el estado y el resultado desde la UVa', () => {
    const { db, ana, guid } = scene();
    addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], opponent: 'Rival X', event: 'IM', round: 'Cuartos', date: '2026-11-07', time: '12:00', court: '3', state: 'scheduled' });
    const done = addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], event: 'IM', round: 'Octavos', date: '2026-11-07', time: '09:00', state: 'finished', score: '21-15 18-21 21-17' });
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t).toMatchObject({ manual: true, name: 'Torneo manual de prueba', stale: false });
    expect(t.officialUrl).toBeUndefined();
    expect(t.uvaPlayers).toEqual(['Ana Prueba', 'Luis Prueba']);
    const next = t.matches.find((m) => m.state === 'scheduled')!;
    expect(next).toMatchObject({ players: ['Ana Prueba'], event: 'IM · Cuartos', court: '3', time: '12:00', plannedStart: '2026-11-07T11:00:00.000Z' });
    expect(t.matches.find((m) => m.id === done)).toMatchObject({ state: 'finished', outcome: 'win', score: '21-15 18-21 21-17' });
    expect(JSON.stringify(t)).not.toContain('Rival X'); // los rivales no se publican por defecto
  });

  it('se puede pasar un partido a «en juego» y luego finalizarlo con el resultado', () => {
    const { db, ana, guid } = scene();
    const key = addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', time: '11:00' });
    updateManualMatch(db, key, { state: 'live', court: '2' });
    expect(buildPublicState(db, NOW).tournaments[0].matches[0].state).toBe('live');
    updateManualMatch(db, key, { state: 'finished', score: '15-21 18-21' });
    expect(buildPublicState(db, NOW).tournaments[0].matches[0]).toMatchObject({ state: 'finished', outcome: 'loss', score: '15-21 18-21', court: '2' });
  });

  it('exige resultado para finalizar y valida los datos', () => {
    const { db, ana, guid } = scene();
    expect(() => addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', state: 'finished' })).toThrow(/resultado/);
    expect(() => addManualMatch(db, { tournamentId: guid, playerIds: [], date: '2026-11-07' })).toThrow(ValidationError);
    expect(() => addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: 'mañana' })).toThrow(/AAAA-MM-DD/);
    expect(() => addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', time: '9h' })).toThrow(/HH:MM/);
    expect(() => addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', state: 'finished', score: '21/15' })).toThrow(/Set no válido/);
    expect(() => addManualMatch(db, { tournamentId: 'otro', playerIds: [ana.id], date: '2026-11-07' })).toThrow(/No existe/);
  });

  it('un jugador oculto no se publica aunque se anoten sus partidos', () => {
    const db = memDb();
    const hidden = createPlayer(db, { name: 'Carla Prueba' });
    const guid = createManualTournament(db, { name: 'Torneo manual de prueba', startDate: '2026-11-07', playerIds: [hidden.id] });
    addManualMatch(db, { tournamentId: guid, playerIds: [hidden.id], date: '2026-11-07', time: '10:00' });
    expect(buildPublicState(db, NOW).tournaments).toEqual([]);
  });

  it('las cifras de la jornada dan la hora estimada de fin y el retraso se aplica a los partidos próximos', () => {
    const { db, ana, guid } = scene();
    addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', time: '12:00' });
    setManualProgress(db, guid, { total: 40, finished: 16, live: 4, courts: 4, avgDurationMin: 30, delayMin: 20 }, NOW);
    const [t] = buildPublicState(db, NOW).tournaments;
    expect(t.progress).toMatchObject({ total: 40, finished: 16, live: 4, remaining: 20, courts: 4, basis: 'manual', done: false });
    // 4 en juego (15 min) + 5 rondas × (30 + 4) = 185 min desde las 10:30 locales
    expect(Date.parse(t.progress!.estimatedEnd!) - NOW.getTime()).toBe(185 * 60_000);
    expect(Date.parse(t.progress!.estimatedEndLow!)).toBeLessThan(Date.parse(t.progress!.estimatedEnd!));
    expect(Date.parse(t.progress!.estimatedEndHigh!)).toBeGreaterThan(Date.parse(t.progress!.estimatedEnd!));
    expect(t.matches[0].estimatedStart).toBe('2026-11-07T11:20:00.000Z'); // 12:00 programado + 20 min de retraso
  });

  it('valida las cifras de la jornada', () => {
    const { db, guid } = scene();
    expect(() => setManualProgress(db, guid, { total: 10, finished: 9, live: 4, courts: 2 })).toThrow(/superar/);
    expect(() => setManualProgress(db, guid, { total: 0, finished: 0, courts: 2 })).toThrow(ValidationError);
    expect(estimateManual({ total: 10, finished: 10, live: 0, courts: 2 }, NOW).done).toBe(true);
  });

  it('el motor no intenta leer de la fuente oficial los torneos manuales', async () => {
    const { db } = scene();
    createPlayer(db, { name: 'Marta Prueba', profile: PROFILE });
    const src = new FakeSource();
    src.profileTournaments = [];
    const engine = new SyncEngine(db, src, () => NOW, { live: true, calendar: false });
    for (let i = 0; i < 6; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
    expect(src.calls.filter((c) => c === 'tournament' || c === 'draws' || c === 'day')).toEqual([]);
  });

  it('también avisa 20 minutos antes de un partido anotado a mano', async () => {
    const { db, ana, guid } = scene();
    addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], date: '2026-11-07', time: '11:00' }); // 10:00Z
    subscribe(db, { subscription: { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } }, playerId: ana.id });
    const sent: string[] = [];
    const sender: PushSender = { send: async (_s, payload) => void sent.push(JSON.parse(payload).title) };
    expect(await notifyUpcoming(db, new Date('2026-11-07T09:30:00Z'), sender)).toBe(0); // faltan 30 min
    expect(await notifyUpcoming(db, new Date('2026-11-07T09:45:00Z'), sender)).toBe(1); // faltan 15
    expect(sent[0]).toBe('Ana Prueba juega en unos 15 min');
  });

  it('el panel lista los torneos manuales y se pueden borrar partidos y torneos', () => {
    const { db, ana, guid } = scene();
    const key = addManualMatch(db, { tournamentId: guid, playerIds: [ana.id], opponent: 'Rival X', date: '2026-11-07', time: '12:00' });
    const [t] = listManual(db);
    expect(t.matches[0]).toMatchObject({ key, players: ['Ana Prueba'], opponent: 'Rival X', state: 'scheduled' });
    expect(deleteManualMatch(db, key)).toBe(true);
    expect(listManual(db)[0].matches).toEqual([]);
    expect(deleteManualTournament(db, guid)).toBe(true);
    expect(listManual(db)).toEqual([]);
  });

  it('no se pueden editar torneos que vienen de la fuente oficial', () => {
    const { db, ana } = scene();
    db.prepare("insert into tournaments(guid, name, discovered_at) values('OFICIAL', 'x', '2026-01-01')").run();
    expect(() => addManualMatch(db, { tournamentId: 'OFICIAL', playerIds: [ana.id], date: '2026-11-07' })).toThrow(/fuente oficial/);
  });
});
