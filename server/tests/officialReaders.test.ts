import { describe, expect, it } from 'vitest';
import { bracketHtml, dayHtml, drawsHtml, G, page, profileHtml, readers, standingsHtml, tournamentHtml } from './helpers/pages';

describe('lectores oficiales (páginas ficticias con la estructura de badminton.es)', () => {
  it('ficha de torneo: nombre, localidad, sede y días', async () => {
    const { r, calls } = readers([[/tournament\.aspx/, tournamentHtml]]);
    const t = await r.tournament(G, 1);
    expect(t).toMatchObject({ id: G.toUpperCase(), name: 'Torneo de Prueba Absoluto', city: 'Villa Ejemplo', venue: 'Polideportivo de Prueba', days: ['2026-10-03', '2026-10-04'], tz: 'Europe/Madrid' });
    expect(calls[0].url).toBe(`https://fuente.test/sport/tournament.aspx?id=${G}`);
  });

  it('una página de error o sin el contenedor esperado falla con un error claro', async () => {
    const { r } = readers([[/tournament\.aspx/, '<html><body>Mantenimiento</body></html>']]);
    await expect(r.tournament(G, 1)).rejects.toThrow(/contenedor esperado/);
  });

  it('perfil: nombre y torneos en curso y recientes, sin repetir', async () => {
    const { r } = readers([[/profile\/overview/, profileHtml]]);
    const p = await r.profile('AAAA', 1);
    expect(p.name).toBe('ANA PRUEBA GIL');
    expect(p.tournamentIds.sort()).toEqual(['AAAAAAAA-0000-0000-0000-000000000001', G.toUpperCase()].sort());
  });

  it('lista de cuadros con su tipo', async () => {
    const { r } = readers([[/draws\.aspx/, drawsHtml]]);
    expect(await r.draws(G, 2)).toMatchObject([
      { drawId: 24, name: 'IM - Grupo A', type: 'roundrobin' },
      { drawId: 32, name: 'IM', type: 'knockout' },
    ]);
  });

  it('clasificación de grupo: club, jugador y cifras (pide el fragmento AJAX)', async () => {
    const { r, calls } = readers([[/GetStandings/, standingsHtml]]);
    const rows = await r.standings(G, 24, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rank: 1, names: ['Ana Prueba'], ids: [45], club: 'UNIVERSIDAD DE VALLADOLID', played: 2, won: 2, matches: '2-0', points: '84-40', pts: 4, form: ['W', 'W'] });
    expect(calls[0].url).toBe(`https://fuente.test/tournament/${G}/Draw/24/GetStandings`.replace(G, G.toLowerCase()));
    expect(calls[0].headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('cuadro eliminatorio: rondas, jugadores, ganador, sets, bye y plazas por decidir', async () => {
    const { r } = readers([[/GetDrawContent/, bracketHtml]]);
    const rounds = await r.bracket(G, 32, 2);
    expect(rounds.map((x) => x.title)).toEqual(['Semifinales', 'Final']);
    const m = rounds[0].matches[0];
    expect(m.a).toMatchObject({ names: ['Ana Prueba'], ids: [45], club: 'UNIVERSIDAD DE VALLADOLID', seed: '1, Q' });
    expect(m).toMatchObject({ winner: 1, sets: [[21, 11], [21, 10]], whenIso: '2026-10-03T15:05' });
    expect(rounds[0].matches[1].a.bye).toBe(true);
    expect(rounds[1].matches[0].b).toMatchObject({ placeholder: 'Ganador semifinal 2', names: [] });
  });

  describe('orden de juego del día', () => {
    const load = async () => {
      const { r, calls } = readers([[/matches\.aspx/, dayHtml]]);
      return { rows: await r.day(G, '2026-10-03', 'Europe/Madrid', 1), calls };
    };
    it('pide la página del día', async () => {
      const { calls } = await load();
      expect(calls[0].url).toBe(`https://fuente.test/sport/matches.aspx?id=${G}&d=20261003`);
    });
    it('partido terminado: jugadores, ganador, sets, duración, pista y hora en UTC', async () => {
      const { rows } = await load();
      expect(rows).toHaveLength(6);
      expect(rows[0]).toMatchObject({ drawName: 'IM - Grupo A', eventCode: 'IM', round: 'Grupo A', plannedClock: '09:35', plannedUtc: '2026-10-03T07:35:00Z', winner: 1, sets: [[21, 10], [21, 14]], durationMin: 27, court: 'Pabellón - 2', status: 'finished' });
      expect(rows[0].team1.players).toMatchObject([{ name: 'Ana Prueba', tsPlayerId: 45 }]);
    });
    it('W.O., dobles con tres sets, en juego (etiqueta), pendiente y retirada', async () => {
      const { rows } = await load();
      expect(rows[1].status).toBe('walkover');
      expect(rows[2]).toMatchObject({ eventCode: 'DM', sets: [[18, 21], [21, 19], [21, 15]], winner: 1, durationMin: 65 });
      expect(rows[2].team1.players.map((p) => p.name)).toEqual(['Ana Prueba', 'Luis Prueba']);
      expect(rows[3].status).toBe('on_court');
      expect(rows[4]).toMatchObject({ status: 'scheduled', court: undefined });
      expect(rows[5]).toMatchObject({ status: 'retired', sets: [[21, 18], [5, 3]] });
    });
    it('las claves son únicas y estables entre lecturas', async () => {
      const a = await load();
      const b = await load();
      expect(new Set(a.rows.map((x) => x.key)).size).toBe(a.rows.length);
      expect(b.rows.map((x) => x.key)).toEqual(a.rows.map((x) => x.key));
    });
    it('un día sin tabla de partidos da lista vacía', async () => {
      const { r } = readers([[/matches\.aspx/, page('<div>Sin partidos</div>')]]);
      expect(await r.day(G, '2026-10-05', 'Europe/Madrid', 1)).toEqual([]);
    });
  });

  it('respeta la separación mínima entre peticiones (≥ 2,5 s)', async () => {
    const { r, calls } = readers([[/tournament\.aspx/, tournamentHtml], [/draws\.aspx/, drawsHtml], [/profile/, profileHtml]]);
    await Promise.all([r.tournament(G, 1), r.draws(G, 2), r.profile('X', 1)]);
    expect(calls).toHaveLength(3);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(2500);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(2500);
  });

  it('una caída de la fuente (500) se reintenta con espera y acaba en error, sin bucles', async () => {
    const { r, calls } = readers([[/tournament\.aspx/, () => new Response('', { status: 503 })]]);
    await expect(r.tournament(G, 1)).rejects.toThrow(/503/);
    expect(calls).toHaveLength(3);
  });
});
