import { describe, expect, it } from 'vitest';
import { buildAccuracy, stats } from '../src/accuracy';
import { SyncEngine } from '../src/engine';
import { createPlayer } from '../src/roster';
import { FakeSource, GUID, info, memDb, PROFILE, row } from './helpers/fakes';

const T = (hhmm: string) => `2026-11-07T${hhmm}:00.000Z`;

describe('acierto de la estimación', () => {
  it('estadísticos: error medio con signo, absoluto, mediana y porcentaje dentro de ±15', () => {
    const s = stats([-10, 5, 20, -30])!;
    expect(s).toMatchObject({ n: 4, bias: -3.7, mae: 16.3, within10: 0.5, within15: 0.5, within30: 1 });
    expect(stats([])).toBeUndefined();
  });

  it('compara fin estimado y hora de inicio estimada con lo ocurrido, para todos los partidos y para los del club', () => {
    const db = memDb();
    const g = 'G1';
    db.prepare("insert into tournaments(guid, name, discovered_at) values(?,?,?)").run(g, 'Torneo de Prueba', T('00:00'));
    const slot = db.prepare('insert into slots(key, tournament_guid, date, planned_utc, order_idx, status, started_seen_at, prev_poll_at, finished_seen_at, updated_at, event) values(?,?,?,?,?,?,?,?,?,?,?)');
    // Partido A (del club): programado 08:00, empezó 08:20 (visto en pista 08:22, lectura anterior 08:18). Partido B: programado 08:30, empezó 08:50.
    slot.run('A', g, '2026-11-07', T('08:00'), 0, 'finished', T('08:22'), T('08:18'), T('09:00'), T('09:00'), 'IM');
    slot.run('B', g, '2026-11-07', T('08:30'), 1, 'finished', T('08:50'), T('08:50'), T('09:40'), T('09:40'), 'DM');
    db.prepare("insert into matches(key, tournament_guid, date, json, hash, state, first_seen_at, updated_at, last_seen_at) values('A',?,?,?,?,?,?,?,?)").run(g, '2026-11-07', '{}', 'h', 'finished', 'x', 'x', 'x');
    const log = db.prepare('insert into estimate_log(tournament_guid, date, at, est_end, est_end_low, est_end_high, remaining, finished, total) values(?,?,?,?,?,?,?,?,?)');
    log.run(g, '2026-11-07', T('07:50'), T('09:50'), T('09:30'), T('10:10'), 2, 0, 2); // antes de empezar: acierta con 10 min de error (real 09:40)
    log.run(g, '2026-11-07', T('08:40'), T('09:45'), T('09:35'), T('09:55'), 1, 1, 2);
    const st = db.prepare('insert into estimate_starts(tournament_guid, date, at, slot_key, est_start) values(?,?,?,?,?)');
    st.run(g, '2026-11-07', T('07:50'), 'A', T('08:10'));
    st.run(g, '2026-11-07', T('07:50'), 'B', T('08:45'));
    st.run(g, '2026-11-07', T('08:10'), 'A', T('08:25')); // foto 10 min antes de empezar: demasiado tarde para el horizonte de 15 (08:05), se usa la de 07:50
    st.run(g, '2026-11-07', T('08:30'), 'B', T('08:55'));

    const [day] = buildAccuracy(db, T('00:00'));
    expect(day).toMatchObject({ tournament: 'Torneo de Prueba', finished: true, actualEnd: T('09:40'), matches: { total: 2, withActualStart: 2, club: 1 } });
    expect(day.beforeStart).toMatchObject({ estimatedEnd: T('09:50'), errorMin: 10, inRange: true });
    expect(day.end.find((h) => h.minBefore === 60)).toMatchObject({ estimatedEnd: T('09:45'), errorMin: 5, inRange: true });
    // Programación: A salió 20 min más tarde de lo programado; B, 20 min. A 15 y 30 min de empezar, la última foto válida de A (07:50) decía 08:10: error de −10.
    expect(day.starts.planAll).toMatchObject({ n: 2, bias: -20 });
    expect(day.starts.club['15']).toMatchObject({ n: 1, bias: -10 });
    expect(day.starts.club['60']).toBeUndefined();
    expect(day.clubMatches).toHaveLength(1);
    expect(day.clubMatches[0]).toMatchObject({ event: 'IM', planErrorMin: -20, errorMin: { '60': null, '30': -10, '15': -10 } });
    expect(JSON.stringify(day)).not.toMatch(/Ana|Rival/);
  });

  it('el motor guarda las fotos de la estimación durante la jornada y no las repite antes de 10 minutos', async () => {
    const db = memDb();
    const src = new FakeSource();
    src.dayRows = [row({ key: 'm1', clock: '10:00' }), row({ key: 'm2', clock: '10:30', names1: [['Otra', 5]], names2: [['Rival', 6]] })];
    createPlayer(db, { name: 'Ana Prueba', profile: PROFILE });
    const now = new Date('2026-11-07T08:00:00+01:00');
    const e = new SyncEngine(db, src, () => now);
    for (let i = 0; i < 6; i++) await e.tick(new Date(now.getTime() + i * 60_000));
    const n1 = (db.prepare('select count(*) n from estimate_log').get() as unknown as { n: number }).n;
    expect(n1).toBe(1);
    expect((db.prepare('select count(*) n from estimate_starts').get() as unknown as { n: number }).n).toBeGreaterThan(0);
    void info; void GUID;
  });
});
