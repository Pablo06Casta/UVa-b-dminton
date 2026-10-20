import type { FesbaCalendarRow } from './source';
import type { FinderRow } from '@/lib/org/parse';
import type { FesbaRow } from '@/lib/org/parse';

const BASE = 'https://www.badminton.es';

/** Torneos absolutos (nacionales y territoriales) a partir del calendario FESBA y del buscador oficial. Misma lógica que `npm run calendario:actualizar` de la web. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const isAbsolute = (name: string, group: string) => group === 'ESP_Absoluto' || /absoluto/i.test(name);

/** Empareja una fila FESBA con la del buscador solo si coinciden la fecha de inicio y la localidad. */
function findMatch(f: FesbaRow, finder: FinderRow[]): FinderRow | undefined {
  const city = norm(f.city ?? '');
  const cands = finder.filter((t) => t.startDate === f.startDate && t.city && city && (norm(t.city).includes(city) || city.includes(norm(t.city))));
  return cands.length === 1 ? cands[0] : undefined;
}

export function transformCalendar(fesba: FesbaCalendarRow[], finder: FinderRow[], checkedAt: string) {
  const scopeOf = (egid: string) => (egid === '276' ? 'Territorial' : 'Nacional');
  const used = new Set<string>();
  const tournaments = [] as Record<string, unknown>[];

  for (const f of fesba) {
    if (!isAbsolute(f.name, f.group) || (f.country && !/espa/i.test(f.country))) continue;
    const t = findMatch(f, finder);
    if (t) used.add(t.tsId);
    tournaments.push({
      id: `fesba-${f.calendarId}`,
      name: f.name,
      startDate: f.startDate,
      ...(t?.endDate && t.endDate !== f.startDate ? { endDate: t.endDate } : {}),
      city: f.city && !/determinar/i.test(f.city) ? f.city : 'Localidad por determinar',
      category: scopeOf(f.egid),
      level: f.level && f.level !== '-' ? f.level : undefined,
      externalUrl: f.url,
      source: 'official',
      externalId: f.calendarId,
    });
  }
  // Torneos del buscador con prueba absoluta que no están en el calendario FESBA.
  for (const t of finder) {
    if (used.has(t.tsId) || !t.startDate || !/absoluto|abs/i.test(`${t.name} ${t.events.join(' ')}`)) continue;
    if (tournaments.some((x) => x.startDate === t.startDate && norm(String(x.city)) === norm(t.city ?? '~'))) continue;
    tournaments.push({
      id: `ts-${t.tsId.slice(0, 8).toLowerCase()}`,
      name: t.name,
      startDate: t.startDate,
      ...(t.endDate && t.endDate !== t.startDate ? { endDate: t.endDate } : {}),
      city: t.city ?? 'Localidad por determinar',
      category: /castilla y le/i.test(t.name) || /territorial|autonom/i.test(t.name) ? 'Territorial' : 'Nacional',
      externalUrl: `${BASE}/sport/tournament.aspx?id=${t.tsId}`,
      source: 'official',
      externalId: t.tsId,
    });
  }
  tournaments.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.name).localeCompare(String(b.name), 'es'));
  return {
    meta: {
      fuente: 'badminton.es (FESBA · calendario y buscador de torneos)',
      comprobadoEl: checkedAt,
      alcance: 'Torneos de categoría absoluta, nacionales y territoriales',
      nota: 'Fecha de inicio según el calendario FESBA; la de fin solo cuando el buscador oficial la confirma.',
    },
    tournaments,
  };
}

