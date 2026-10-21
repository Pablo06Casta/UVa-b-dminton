import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { kvGet, kvSet, openDb } from '../src/db';
import { resetSnapshotState, restoreIfMissing, saveSnapshot } from '../src/remoteBackup';

/** Upstash simulado en memoria. */
function fakeUpstash() {
  const store = new Map<string, string>();
  let writes = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const [op, key, value] = JSON.parse(String(init.body)) as string[];
    if (op === 'SET') { store.set(key, value); writes++; return Response.json({ result: 'OK' }); }
    return Response.json({ result: store.get(key) ?? null });
  }) as typeof fetch;
  return { cfg: { url: 'https://upstash.test', token: 't', fetchImpl }, store, writes: () => writes };
}

beforeEach(() => resetSnapshotState());

describe('copia remota de la base de datos', () => {
  it('guarda la base y la restaura en un disco vacío, con todos sus datos', async () => {
    const up = fakeUpstash();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
    const db = openDb(path.join(dir, 'a.sqlite'));
    kvSet(db, 'prueba', { hola: 'mundo', grande: 'x'.repeat(2_000_000) }); // obliga a usar varios trozos si no comprime
    db.prepare("insert into players(name, name_norm, created_at, updated_at) values('Ana Prueba','ana prueba','x','x')").run();
    expect(await saveSnapshot(db, up.cfg)).toBe(true);

    const restored = path.join(dir, 'b', 'club.sqlite');
    expect(await restoreIfMissing(restored, up.cfg)).toBe(true);
    const db2 = openDb(restored);
    expect(kvGet<{ hola: string }>(db2, 'prueba')?.hola).toBe('mundo');
    expect(db2.prepare('select name from players').get()).toEqual({ name: 'Ana Prueba' });
  });

  it('no restaura si ya hay base de datos, ni reenvía si no ha cambiado', async () => {
    const up = fakeUpstash();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
    const file = path.join(dir, 'c.sqlite');
    const db = openDb(file);
    expect(await saveSnapshot(db, up.cfg)).toBe(true);
    const w = up.writes();
    expect(await saveSnapshot(db, up.cfg)).toBe(false);
    expect(up.writes()).toBe(w);
    expect(await restoreIfMissing(file, up.cfg)).toBe(false); // ya existe
  });

  it('sin configuración o sin copia previa, no hace nada y no falla', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
    expect(await restoreIfMissing(path.join(dir, 'd.sqlite'), undefined)).toBe(false);
    expect(await restoreIfMissing(path.join(dir, 'e.sqlite'), fakeUpstash().cfg)).toBe(false);
    expect(await saveSnapshot(openDb(path.join(dir, 'f.sqlite')), undefined)).toBe(false);
  });
});
