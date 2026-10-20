/**
 * Actualiza el calendario oficial de torneos ABSOLUTOS (nacionales y territoriales) desde badminton.es.
 *
 *   npm run calendario:actualizar            lee la fuente y regenera src/data/calendario-oficial.json
 *   npm run calendario:actualizar -- --solo-transformar   regenera el JSON desde la última lectura guardada
 *
 * Solo consulta rutas que el robots.txt de badminton.es NO excluye:
 *   - /calendar/192/Calendario-FESBA   (calendario oficial FESBA)
 *   - /tournamentlist.aspx             (buscador de torneos)
 * No lee inscritos, cuadros, partidos ni perfiles (rutas excluidas). Una petición cada ≥ 2,5 s, con parada
 * inmediata ante 429/5xx. Ejecútalo como mucho unas pocas veces al día.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { finderPostBody, parseFesbaCalendar, parseFinder, type FesbaRow, type FinderRow } from './lib/parse';

const BASE = 'https://www.badminton.es';
const RAW = 'data/badminton-es';
const OUT = 'src/data/calendario-oficial.json';
const GAP_MS = 2500;
const UA = 'Mozilla/5.0 (compatible; ClubBadmintonUVa/0.1; lectura puntual del calendario publico; 1 peticion cada 2,5 s)';
const GROUPS = ['593', '253', '276']; // Absoluto nacional, Campeonatos de España, TTR territoriales

type FesbaWithYear = FesbaRow & { year: number; egid: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const log: { at: string; method: string; url: string; status: number; bytes: number }[] = [];

async function request(path: string, init: { method?: 'GET' | 'POST'; body?: string } = {}) {
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'es-ES,es;q=0.9',
      Accept: 'text/html,*/*;q=0.8',
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  log.push({ at: new Date().toISOString(), method: init.method ?? 'GET', url: path, status: res.status, bytes: body.length });
  console.log(res.status, init.method ?? 'GET', path);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}: se detiene la lectura.`);
  return body;
}

async function readSource() {
  const year = new Date().getFullYear();
  const fesba: FesbaWithYear[] = [];
  for (const y of [year, year + 1]) {
    for (const g of GROUPS) {
      const html = await request(`/calendar/192/Calendario-FESBA?year=${y}&egid=${g}`);
      for (const r of parseFesbaCalendar(html, BASE)) fesba.push({ ...r, year: y, egid: g });
    }
  }
  const finder: FinderRow[] = [];
  let html = await request('/tournamentlist.aspx');
  const first = html;
  for (let page = 1; page <= 4; page++) {
    html = await request('/tournamentlist.aspx', {
      method: 'POST',
      body: finderPostBody(page === 1 ? first : html, { page, size: 100 }),
    });
    const parsed = parseFinder(html);
    finder.push(...parsed.rows);
    if (!parsed.pages || page >= parsed.pages) break;
  }
  const meta = { fuente: BASE, extraidoEl: new Date().toISOString(), peticiones: log.length, intervaloMinimoMs: GAP_MS, userAgent: UA };
  mkdirSync(RAW, { recursive: true });
  writeFileSync(`${RAW}/fesba-calendario.json`, JSON.stringify({ meta, filas: fesba }, null, 2));
  writeFileSync(`${RAW}/buscador-torneos.json`, JSON.stringify({ meta, filas: finder }, null, 2));
  writeFileSync(`${RAW}/registro-peticiones.json`, JSON.stringify(log, null, 2));
  return { fesba, finder, meta };
}

function readSaved() {
  const f = JSON.parse(readFileSync(`${RAW}/fesba-calendario.json`, 'utf8'));
  const b = JSON.parse(readFileSync(`${RAW}/buscador-torneos.json`, 'utf8'));
  return { fesba: f.filas as FesbaWithYear[], finder: b.filas as FinderRow[], meta: f.meta };
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const isAbsolute = (name: string, group: string) => group === 'ESP_Absoluto' || /absoluto/i.test(name);

/** Empareja una fila FESBA con la del buscador solo si coinciden la fecha de inicio y la localidad. */
function findMatch(f: FesbaRow, finder: FinderRow[]): FinderRow | undefined {
  const city = norm(f.city ?? '');
  const cands = finder.filter((t) => t.startDate === f.startDate && t.city && city && (norm(t.city).includes(city) || city.includes(norm(t.city))));
  return cands.length === 1 ? cands[0] : undefined;
}

function transform({ fesba, finder, meta }: ReturnType<typeof readSaved>) {
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
      comprobadoEl: meta.extraidoEl,
      alcance: 'Torneos de categoría absoluta, nacionales y territoriales',
      nota: 'Fecha de inicio según el calendario FESBA; la de fin solo cuando el buscador oficial la confirma.',
    },
    tournaments,
  };
}

const data = process.argv.includes('--solo-transformar') ? readSaved() : await readSource();
const out = transform(data);
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`${out.tournaments.length} torneos absolutos → ${OUT}`);
