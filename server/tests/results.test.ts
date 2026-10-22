import { describe, expect, it } from 'vitest';
import type { PublicDraw } from '../src/publicView';
import { uvaRecord, uvaResults } from '../src/results';

const e = (label: string, uva = false) => ({ label, uva });
const m = (a: string, b: string, winner?: 1 | 2) => ({ a: e(a, a.startsWith('U')), b: e(b, b.startsWith('U')), winner, sets: [] as [number, number][] });
const ko = (base: string, rounds: NonNullable<PublicDraw['rounds']>): PublicDraw => ({ id: 1, name: base, type: 'knockout', base, rounds });

describe('resultados de la UVa', () => {
  it('oro, plata y bronce según el cuadro final', () => {
    const draw = ko('IM', [
      { title: 'Semi final', matches: [m('Ua', 'X', 1), m('Ub', 'Uc', 1)] },
      { title: 'Final', matches: [m('Ua', 'Ub', 1)] },
    ]);
    const r = uvaResults([draw]);
    expect(r.find((x) => x.entrant === 'Ua')).toMatchObject({ place: 1, text: 'Oro', done: true });
    expect(r.find((x) => x.entrant === 'Ub')).toMatchObject({ place: 2, text: 'Plata' });
    expect(r.find((x) => x.entrant === 'Uc')).toMatchObject({ place: 3, text: 'Bronce' });
    expect(r.map((x) => x.place)).toEqual([1, 2, 3]);
  });

  it('indica dónde cae o hacia dónde avanza, y el próximo partido', () => {
    const draw = ko('DX', [
      { title: 'Cuartos de final', matches: [m('Ua', 'X', 2), m('Ub', 'Y', 1), m('Uc', 'Z'), m('P', 'Q', 1)] },
      { title: 'Semi final', matches: [m('Ub', 'W'), m('Q', 'R')] },
      { title: 'Final', matches: [m('?', '?')] },
    ]);
    const r = uvaResults([draw]);
    expect(r.find((x) => x.entrant === 'Ua')).toMatchObject({ text: 'Cae en Cuartos de final', done: true });
    expect(r.find((x) => x.entrant === 'Ub')).toMatchObject({ text: 'Próximo partido: Semi final', done: false });
    expect(r.find((x) => x.entrant === 'Uc')).toMatchObject({ text: 'Próximo partido: Cuartos de final', done: false });
    expect(r.every((x) => x.place === undefined)).toBe(true);
  });

  it('en grupos muestra el puesto y si se clasifica; el cuadro final lo sustituye cuando ya juega', () => {
    const group: PublicDraw = {
      id: 2, name: 'IM - Grupo A', type: 'roundrobin', base: 'IM', group: 'Grupo A', qualify: 1,
      standings: [
        { rank: 1, entrant: e('Ua', true), played: 2, won: 2, lost: 0, matches: '2-0', games: '4-0', points: '84-50', pts: 2 },
        { rank: 2, entrant: e('Ub', true), played: 2, won: 1, lost: 1, matches: '1-1', games: '2-2', points: '60-60', pts: 1 },
      ],
    };
    let r = uvaResults([group]);
    expect(r.find((x) => x.entrant === 'Ua')?.text).toBe('1.º en Grupo A · se clasifica para el cuadro final');
    expect(r.find((x) => x.entrant === 'Ub')?.text).toBe('2.º en Grupo A');
    r = uvaResults([group, ko('IM', [{ title: 'Final', matches: [m('Ua', 'X', 1)] }])]);
    expect(r.find((x) => x.entrant === 'Ua')).toMatchObject({ place: 1, text: 'Oro' });
    expect(r.filter((x) => x.entrant === 'Ua')).toHaveLength(1);
  });

  it('una liguilla única decide el podio por puesto', () => {
    const liga: PublicDraw = {
      id: 3, name: 'DM', type: 'roundrobin', base: 'DM',
      standings: [{ rank: 3, entrant: e('Ua', true), played: 3, won: 1, lost: 2, matches: '1-2', games: '', points: '', pts: 1 }],
    };
    expect(uvaResults([liga])[0]).toMatchObject({ place: 3, done: true });
  });

  it('ignora a quien no es de la UVa', () => {
    expect(uvaResults([ko('IM', [{ title: 'Final', matches: [m('X', 'Y', 1)] }])])).toEqual([]);
  });
});

describe('balance de la UVa en un torneo', () => {
  it('suma partidos ganados y perdidos de grupos y cuadros finales (sin contar «pasa directo» ni a rivales) y las medallas', () => {
    const group: PublicDraw = {
      id: 2, name: 'IM - Grupo A', type: 'roundrobin', base: 'IM', group: 'Grupo A', qualify: 1,
      standings: [
        { rank: 1, entrant: e('Ua', true), played: 2, won: 2, lost: 0, matches: '2-0', games: '4-0', points: '84-50', pts: 2 },
        { rank: 2, entrant: e('X'), played: 2, won: 1, lost: 1, matches: '1-1', games: '2-2', points: '60-60', pts: 1 },
      ],
    };
    const bye = { ...m('Ua', 'Bye', 1), b: { label: 'Bye', uva: false, bye: true } };
    const draw = ko('IM', [
      { title: 'Semi final', matches: [bye, m('Y', 'Z', 1)] },
      { title: 'Final', matches: [m('Ua', 'Y', 1)] },
    ]);
    const results = uvaResults([group, draw]);
    expect(uvaRecord([group, draw], results)).toEqual({ won: 3, lost: 0, gold: 1, silver: 0, bronze: 0 }); // 2 del grupo + la final; el «pasa directo» no cuenta
    expect(uvaRecord([ko('DM', [{ title: 'Final', matches: [m('X', 'Y', 1)] }])], [])).toBeUndefined(); // nadie del club
  });
});
