import { beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/config';
import { captureImage, itineraryPages, itinerarySvg, renderItinerary, renderItineraryStories, sendDueItineraries } from '../src/itinerary';
import type { PublicMatch, PublicState, PublicTournament } from '../src/publicView';
import { memDb } from './helpers/fakes';

const NOW = new Date('2026-10-24T07:57:00Z'); // 09:57 en Madrid
const m = (id: string, state: PublicMatch['state'], plannedStart: string, extra: Partial<PublicMatch> = {}): PublicMatch =>
  ({ id, state, players: ['Samuel Muñoz Sanz'], event: 'IM · Grupo F', court: 'P4', date: '2026-10-24', time: '09:00', plannedStart, ...extra }) as PublicMatch;
const T = {
  id: 'G1', name: 'Torneo de prueba', startDate: '2026-10-24', city: 'Valladolid', uvaPlayers: [], results: [], entries: [], draws: [], manual: false, stale: false,
  matches: [
    m('a', 'finished', '2026-10-24T07:00:00Z', { score: '21-15 21-14', outcome: 'win' }),
    m('b', 'finished', '2026-10-24T07:45:00Z', { players: ['Pablo Martín Castañeda'], score: 'W.O.', outcome: 'win', court: undefined }),
    m('c', 'live', '2026-10-24T08:00:00Z'),
    m('d', 'scheduled', '2026-10-24T09:00:00Z', { players: ['Marta Fernández Polo', 'Cristina Rivera Zapatero'], estimatedStart: '2026-10-24T09:15:00Z', event: 'DF · Grupo B' }),
  ],
} as unknown as PublicTournament;
const state = { tournaments: [T] } as unknown as PublicState;

beforeEach(() => {
  settings.itinerary.email = 'club@example.com';
  settings.itinerary.baseUrl = 'https://servidor.example';
  settings.itinerary.minutesBefore = 15;
});

describe('captura del itinerario en vivo', () => {
  it('dibuja la jornada por horas con resultados, partido en juego, estimadas y la línea de «ahora»', () => {
    const svg = itinerarySvg(T, '2026-10-24', NOW);
    expect(svg).toContain('PARTIDOS POR HORAS');
    expect(svg).toContain('HOY');
    expect(svg).toContain('EN JUEGO');
    expect(svg).toContain('PROGRAMADO');
    expect(svg).toContain('VICTORIA');
    expect(svg).toContain('09:57'); // la hora actual en la línea roja
    expect(svg).toContain('EST');
    expect(svg).not.toMatch(/rival/i);
    const png = renderItinerary(T, '2026-10-24', NOW);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('en formato historia (1080×1920) cabe en una página; si hay muchos partidos, se reparte en varias y la hora se repite al empezar página', () => {
    const one = itineraryPages(T, '2026-10-24', NOW, 'story');
    expect(one).toHaveLength(1);
    expect(one[0]).toContain('width="1080" height="1920"');
    const many = { ...T, matches: [...T.matches, ...Array.from({ length: 12 }, (_, i) => m(`x${i}`, 'scheduled', '2026-10-24T11:00:00Z', { estimatedStart: `2026-10-24T${String(11 + (i >> 2)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00Z` }))] } as PublicTournament;
    const pages = itineraryPages(many, '2026-10-24', NOW, 'story');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[1]).toContain('continúa');
    expect(pages[0]).toContain(`1/${pages.length}`);
    expect(renderItineraryStories(many, '2026-10-24', NOW)).toHaveLength(pages.length);
  });

  it('se envía una sola vez, 15 min antes del primer partido, con el enlace a la imagen guardada', async () => {
    const db = memDb();
    const sent: { url: string; body: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init: { body: string }) => (sent.push({ url, body: JSON.parse(init.body) }), { ok: true, status: 200 })) as unknown as typeof fetch;
    // Primer partido a las 07:00Z (09:00 Madrid): a las 08:40 faltan 20 min → aún no.
    expect(await sendDueItineraries(db, state, new Date('2026-10-24T06:40:00Z'), { fetchImpl })).toBe(0);
    // A las 06:46Z faltan 14 min → se envía.
    expect(await sendDueItineraries(db, state, new Date('2026-10-24T06:46:00Z'), { fetchImpl })).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://formsubmit.co/ajax/club@example.com');
    const link = /https:\/\/servidor\.example\/captura\/([0-9a-f]{24})\.png/.exec(sent[0].body.mensaje);
    expect(sent[0].body._subject).toBe('HISTORIAS RRSS DIRECTO TORNEOS JORNADA');
    expect(sent[0].body.mensaje).toContain('Historia 1');
    expect(link).toBeTruthy();
    expect(captureImage(db, link![1])?.subarray(0, 4).toString('hex')).toBe('89504e47');
    // No se repite.
    expect(await sendDueItineraries(db, state, new Date('2026-10-24T06:50:00Z'), { fetchImpl })).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('si el correo falla, no se da por enviado y se reintenta; pasada media hora ya no se envía', async () => {
    const db = memDb();
    const bad = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(sendDueItineraries(db, state, new Date('2026-10-24T06:50:00Z'), { fetchImpl: bad })).rejects.toThrow();
    const good = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    expect(await sendDueItineraries(db, state, new Date('2026-10-24T06:51:00Z'), { fetchImpl: good })).toBe(1);
    const db2 = memDb();
    expect(await sendDueItineraries(db2, state, new Date('2026-10-24T07:40:00Z'), { fetchImpl: good })).toBe(0);
  });

  it('sin correo configurado no hace nada', async () => {
    settings.itinerary.email = '';
    expect(await sendDueItineraries(memDb(), state, new Date('2026-10-24T06:50:00Z'))).toBe(0);
  });
});
