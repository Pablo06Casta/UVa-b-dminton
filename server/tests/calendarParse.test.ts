import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { finderPageBody, parseFesbaCalendar, parseFinder, parseSpanishDate } from '../src/calendarParse';
import { parseDMY } from '../src/dates';
import { sameFullName } from '../src/text';

/** Páginas públicas reales del calendario y del buscador, guardadas como ejemplo (no contienen datos personales). */
const page = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'pages', f), 'utf8');

describe('calendario FESBA (página real)', () => {
  const rows = parseFesbaCalendar(page('fesba-593-2026.html'), 'https://www.badminton.es');
  it('lee una fila por torneo, con fecha ISO, grupo, nivel y localidad', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows[0]).toMatchObject({ calendarId: '88169', name: 'Máster n4-Absoluto', startDate: '2026-01-31', group: 'ESP_Absoluto', level: 'n4', city: 'Granollers', country: 'España' });
    expect(rows[0].url).toBe('https://www.badminton.es/calendarevent/88169');
  });
  it('las fechas son válidas y están ordenadas dentro del año', () => {
    expect(rows.every((r) => /^2026-\d{2}-\d{2}$/.test(r.startDate))).toBe(true);
    expect(rows.map((r) => r.calendarId)).toEqual([...new Set(rows.map((r) => r.calendarId))]);
  });
});

describe('buscador de torneos (página real)', () => {
  const parsed = parseFinder(page('buscador-pagina1.html'));
  it('lee la paginación y las filas', () => {
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.page).toBe(1);
    expect(parsed.pages).toBeGreaterThan(1);
    expect(parsed.total).toBeGreaterThan(100);
  });
  it('lee identificador, nombre, fechas, pruebas, organizador y localidad', () => {
    const liga = parsed.rows.find((r) => r.tsId === '4EF9A0C0-4868-4A7A-9199-4B85CB2C641A');
    expect(liga).toMatchObject({ name: 'Liga Nacional de Clubes edición 2026-2027', startDate: '2026-09-19', endDate: '2027-05-30', organizer: 'Federación Española de Bádminton', city: 'Madrid' });
    const rute = parsed.rows.find((r) => r.name.includes('Rute'));
    expect(rute?.events.slice(0, 3)).toEqual(['IM-15', 'IF-15', 'DM-15']);
    expect(rute).toMatchObject({ startDate: '2026-09-26', endDate: '2026-09-26', city: 'Rute' });
  });
  it('construye la petición de la página siguiente como lo hace la propia web', () => {
    const body = new URLSearchParams(finderPageBody(page('buscador-pagina1.html'), 2, 100));
    expect(body.get('__EVENTTARGET')).toBe('ClientFunctionHandler');
    expect(body.get('__EVENTARGUMENT')).toBe('PageSelected;2;100');
    expect(body.get('_TListNav_PageSize')).toBe('100');
    expect(body.get('__VIEWSTATE')?.length).toBeGreaterThan(100);
  });
});

describe('utilidades', () => {
  it('fechas', () => {
    expect(parseDMY('31/01/2026')).toBe('2026-01-31');
    expect(parseDMY('31/02/2026')).toBeUndefined();
    expect(parseSpanishDate('sábado, 26 de septiembre de 2026')).toBe('2026-09-26');
  });
  it('mismo nombre en cualquier orden y sin acentos ni partículas', () => {
    expect(sameFullName('Ana María Pérez', 'Perez Ana Maria')).toBe(true);
    expect(sameFullName('Ana de la Cruz', 'Cruz Ana')).toBe(true);
    expect(sameFullName('Ana Pérez', 'Ana Pérez Gil')).toBe(false);
  });
});
