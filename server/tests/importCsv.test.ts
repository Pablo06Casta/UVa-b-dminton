import { describe, expect, it } from 'vitest';
import { importPlayersCsv } from '../src/importCsv';
import { listPlayers } from '../src/roster';
import { memDb } from './helpers/fakes';

describe('importación de la lista de jugadores (CSV)', () => {
  it('crea a todos ocultos, con categoría y marca de menor; admite «;» y comillas', () => {
    const db = memDb();
    const r = importPlayersCsv(db, '﻿nombre;categoría;perfil;menor\r\nAna Prueba;Absoluto;;no\r\n"Prueba Gil, Beto";Sub-17;;sí\r\n');
    expect(r).toEqual({ created: 2, skipped: 0, errors: [] });
    const ps = listPlayers(db);
    expect(ps.every((p) => !p.public)).toBe(true);
    expect(ps.find((p) => p.name.startsWith('Ana'))).toMatchObject({ category: 'Absoluto', isMinor: false });
    expect(ps.find((p) => p.name.includes('Beto'))).toMatchObject({ category: 'Sub-17', isMinor: true });
  });

  it('no duplica y avisa de las filas inválidas sin parar la importación', () => {
    const db = memDb();
    importPlayersCsv(db, 'nombre,categoria\nAna Prueba,Absoluto');
    const r = importPlayersCsv(db, 'nombre,categoria,perfil\nana prueba,,\nSolo,,\nCarla Prueba,,no-es-un-guid\nLuis Prueba,,');
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(listPlayers(db)).toHaveLength(2);
  });

  it('exige la columna nombre', () => {
    expect(importPlayersCsv(memDb(), 'categoria\nAbsoluto').errors[0].message).toMatch(/nombre/);
  });
});
