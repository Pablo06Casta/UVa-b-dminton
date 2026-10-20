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

describe('importación con consentimiento declarado por el club', () => {
  it('registra quién y cuándo y publica a quien se indica', () => {
    const db = memDb();
    const r = importPlayersCsv(db, 'nombre;consentimiento;fecha;publico\nAna Prueba;Declarado por el club;2026-10-20;sí\nLuis Prueba;;;no');
    expect(r.errors).toEqual([]);
    const ps = listPlayers(db);
    expect(ps.find((p) => p.name.startsWith('Ana'))).toMatchObject({ public: true, consentBy: 'Declarado por el club', consentAt: '2026-10-20' });
    expect(ps.find((p) => p.name.startsWith('Luis'))?.public).toBe(false);
  });

  it('las reglas se mantienen: sin consentimiento registrado no se publica; un menor necesita a su familia', () => {
    const db = memDb();
    const r = importPlayersCsv(db, 'nombre;menor;consentimiento;fecha;familia;publico\nAna Prueba;no;;;;sí\nBeto Prueba;sí;Madre;2026-10-20;no;sí\nCarla Prueba;sí;Madre;2026-10-20;sí;sí');
    expect(r.created).toBe(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(listPlayers(db).map((p) => p.name)).toEqual(['Carla Prueba']);
  });
});
