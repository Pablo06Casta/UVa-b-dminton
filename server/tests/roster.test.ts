import { describe, expect, it } from 'vitest';
import { memDb } from './helpers/fakes';
import { createPlayer, deletePlayer, getPlayer, listPlayers, updatePlayer, ValidationError } from '../src/roster';

describe('lista de jugadores y consentimiento', () => {
  it('por defecto nadie es público', () => {
    const db = memDb();
    expect(createPlayer(db, { name: 'Ana Prueba' }).public).toBe(false);
  });

  it('no se puede publicar sin registrar quién consintió y cuándo', () => {
    const db = memDb();
    expect(() => createPlayer(db, { name: 'Ana Prueba', public: true })).toThrow(ValidationError);
    expect(createPlayer(db, { name: 'Ana Prueba', public: true, consentBy: 'Ella misma', consentAt: '2026-10-01' }).public).toBe(true);
  });

  it('un menor solo es público con el consentimiento de su familia', () => {
    const db = memDb();
    const base = { name: 'Beto Prueba', isMinor: true, public: true, consentBy: 'Madre', consentAt: '2026-10-01' };
    expect(() => createPlayer(db, base)).toThrow(/menor/);
    expect(createPlayer(db, { ...base, guardianConsent: true }).public).toBe(true);
  });

  it('retirar el consentimiento de la familia obliga a ocultar', () => {
    const db = memDb();
    const p = createPlayer(db, { name: 'Beto Prueba', isMinor: true, guardianConsent: true, public: true, consentBy: 'Madre', consentAt: '2026-10-01' });
    expect(() => updatePlayer(db, p.id, { guardianConsent: false })).toThrow(ValidationError);
    expect(updatePlayer(db, p.id, { guardianConsent: false, public: false }).public).toBe(false);
  });

  it('la base de datos rechaza un público sin consentimiento aunque falle la validación', () => {
    const db = memDb();
    const now = new Date().toISOString();
    expect(() =>
      db.prepare("insert into players(name, name_norm, public, created_at, updated_at) values('X Y','x y',1,?,?)").run(now, now),
    ).toThrow();
  });

  it('exige nombre y apellidos y un perfil válido', () => {
    const db = memDb();
    expect(() => createPlayer(db, { name: 'Ana' })).toThrow(ValidationError);
    expect(() => createPlayer(db, { name: 'Ana Prueba', profile: 'no-es-un-guid' })).toThrow(/perfil/);
    const p = createPlayer(db, { name: 'Ana Prueba', profile: 'https://www.badminton.es/profile/overview.aspx?id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(p.profileGuid).toBe('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
  });

  it('borrar a una persona elimina sus participaciones y los partidos en los que figura', () => {
    const db = memDb();
    const p = createPlayer(db, { name: 'Ana Prueba' });
    const other = createPlayer(db, { name: 'Carla Prueba' });
    const now = new Date().toISOString();
    db.prepare('insert into entrants values(?,?,?,?,?,?)').run('G', 1, 'Ana Prueba', 'UVA', p.id, now);
    const put = (key: string, rosterId: number) =>
      db.prepare('insert into matches(key,tournament_guid,json,hash,state,first_seen_at,updated_at,last_seen_at) values(?,?,?,?,?,?,?,?)')
        .run(key, 'G', JSON.stringify({ sides: [{ players: [{ rosterId }] }, { players: [] }] }), 'h', 'scheduled', now, now, now);
    put('a', p.id);
    put('b', other.id);
    expect(deletePlayer(db, p.id)).toBe(true);
    expect(getPlayer(db, p.id)).toBeUndefined();
    expect((db.prepare('select count(*) n from entrants').get() as { n: number }).n).toBe(0);
    expect((db.prepare('select key from matches').all() as { key: string }[]).map((r) => r.key)).toEqual(['b']);
    expect(listPlayers(db)).toHaveLength(1);
  });
});
