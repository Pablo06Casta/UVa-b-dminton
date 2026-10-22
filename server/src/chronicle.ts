import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { settings } from './config';
import type { Db } from './db';
import { nowIso } from './db';
import { todayIn } from './dates';
import { eventName, finished, type PublicNews } from './news';
import type { PublicState, PublicTournament } from './publicView';
import { invalidatePublicState } from './publicView';

/**
 * Crónicas de torneos redactadas por IA, con aprobación humana:
 *  1. Al terminar un torneo con resultados del club, un modelo redacta una crónica corta SOLO con los datos públicos ya filtrados
 *     (jugadores con consentimiento, resultados y medallas; nunca rivales).
 *  2. Se guarda como borrador y se envía por correo al responsable con un enlace de aprobación (código secreto por borrador).
 *  3. Solo cuando se aprueba sustituye el texto de plantilla de la noticia automática de ese torneo.
 */
export interface Chronicle {
  title: string;
  summary: string;
  paragraphs: string[];
}

export interface ChronicleDeps {
  fetchImpl?: typeof fetch;
}

const TZ = 'Europe/Madrid';

/** Datos que se le dan al modelo: lo mismo que ya es público de ese torneo, sin rivales ni datos de terceros. */
export function factsOf(t: PublicTournament) {
  return {
    torneo: t.name,
    ciudad: t.city,
    fechas: { inicio: t.startDate, fin: t.endDate ?? t.startDate },
    jugadoresDelClub: t.uvaPlayers,
    medallas: { oro: t.results.filter((r) => r.place === 1).length, plata: t.results.filter((r) => r.place === 2).length, bronce: t.results.filter((r) => r.place === 3).length },
    balance: t.record ? { partidosGanados: t.record.won, partidosPerdidos: t.record.lost } : undefined,
    resultados: t.results.map((r) => ({ prueba: eventName(r.event), jugadorOPareja: r.entrant, medalla: r.place === 1 ? 'oro' : r.place === 2 ? 'plata' : r.place === 3 ? 'bronce' : undefined, resultado: r.text, marcadorFinal: r.score })),
  };
}

const SYSTEM = `Eres el redactor de noticias del Club Bádminton Universidad de Valladolid (UVa). Escribes una crónica breve en español de un torneo ya terminado.
Reglas estrictas:
- Usa EXCLUSIVAMENTE los datos del JSON que se te da. No inventes nombres, marcadores, rondas, rivales, clasificaciones, citas ni cifras. Si un dato no está, no lo menciones.
- No nombres a rivales ni a nadie que no esté en "jugadoresDelClub" o en "resultados".
- Tono deportivo, cercano y orgulloso, sin exageraciones, sin emojis y sin hashtags.
- Estructura: un titular (máximo 90 caracteres), un resumen de una o dos frases (máximo 220 caracteres) y de 2 a 4 párrafos (cada uno de máximo 450 caracteres). Empieza por lo más importante (medallas si las hay).
- Si hay balance de partidos ganados y perdidos, puedes mencionarlo.
Responde SOLO con un objeto JSON: {"title": string, "summary": string, "paragraphs": string[]}`;

/** Los números del texto deben salir de los datos: si el modelo inventa una cifra, se descarta el borrador. */
export function validateChronicle(raw: unknown, facts: unknown): Chronicle | undefined {
  const c = raw as Partial<Chronicle> | undefined;
  if (!c || typeof c.title !== 'string' || typeof c.summary !== 'string' || !Array.isArray(c.paragraphs) || !c.paragraphs.every((p) => typeof p === 'string')) return undefined;
  const paragraphs = c.paragraphs.map((p) => p.trim()).filter(Boolean).slice(0, 4);
  const title = c.title.trim();
  const summary = c.summary.trim();
  if (!title || !summary || paragraphs.length === 0 || title.length > 140 || summary.length > 320 || paragraphs.some((p) => p.length > 700)) return undefined;
  const known = new Set(JSON.stringify(facts).match(/\d+/g) ?? []);
  const numbers = `${title} ${summary} ${paragraphs.join(' ')}`.match(/\d+/g) ?? [];
  if (numbers.some((n) => !known.has(n))) return undefined;
  return { title, summary, paragraphs };
}

/** Pide la crónica al modelo (API de Anthropic). */
export async function writeChronicle(t: PublicTournament, deps: ChronicleDeps = {}): Promise<Chronicle | undefined> {
  const facts = factsOf(t);
  const res = await (deps.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': settings.chronicle.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: settings.chronicle.model, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify(facts) }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`API de crónicas: HTTP ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;
  try {
    return validateChronicle(JSON.parse(json), facts);
  } catch {
    return undefined;
  }
}

/** Envía el borrador por correo (FormSubmit) con el enlace de aprobación. */
async function emailDraft(t: PublicTournament, c: Chronicle, code: string, deps: ChronicleDeps) {
  const link = `${settings.chronicle.baseUrl}/aprobar-cronica/${encodeURIComponent(t.id)}?code=${code}`;
  const msg = `BORRADOR DE CRÓNICA para ${t.name}. No se publica hasta que la apruebes.\n\nTITULAR: ${c.title}\n\nRESUMEN: ${c.summary}\n\n${c.paragraphs.join('\n\n')}\n\nREVISAR Y PUBLICAR (o descartar): ${link}\n\nSi no haces nada, no se publica y la noticia sigue con el texto automático.`;
  const site = settings.siteUrl || 'https://badmiton-uva.github.io/UVa-b-dminton';
  const res = await (deps.fetchImpl ?? fetch)(`https://formsubmit.co/ajax/${settings.chronicle.email}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: new URL(site).origin, referer: `${site}/contacto` },
    body: JSON.stringify({ nombre: 'Crónicas', apellidos: 'Borrador', email: settings.chronicle.email, mensaje: msg, _subject: `Crónica para revisar · ${t.name}`, _template: 'table', _captcha: 'false' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Correo del borrador: HTTP ${res.status}`);
}

/** Redacta y envía un borrador por cada torneo terminado con resultados que aún no tenga crónica. Devuelve cuántos creó. */
export async function draftChronicles(db: Db, state: PublicState, now: Date, deps: ChronicleDeps = {}): Promise<number> {
  const c = settings.chronicle;
  if (!c.apiKey || !c.email || !c.baseUrl) return 0;
  const today = todayIn(TZ, now);
  let created = 0;
  for (const t of state.tournaments) {
    if (!finished(t, today) || t.results.length === 0) continue;
    if (db.prepare('select 1 from chronicles where tournament_guid = ?').get(t.id)) continue;
    const chronicle = await writeChronicle(t, deps);
    if (!chronicle) {
      // El modelo no dio un texto válido: se anota para no insistir cada 15 minutos; sigue la noticia de plantilla.
      db.prepare('insert into chronicles(tournament_guid, status, title, summary, body_json, code, created_at) values(?,?,?,?,?,?,?)').run(t.id, 'discarded', '', '', '[]', '', nowIso());
      continue;
    }
    const code = randomBytes(16).toString('hex');
    await emailDraft(t, chronicle, code, deps);
    db.prepare('insert into chronicles(tournament_guid, status, title, summary, body_json, code, created_at) values(?,?,?,?,?,?,?)').run(t.id, 'draft', chronicle.title, chronicle.summary, JSON.stringify(chronicle.paragraphs), createHash('sha256').update(code).digest('hex'), nowIso());
    created++;
  }
  return created;
}

interface Row { tournament_guid: string; status: string; title: string; summary: string; body_json: string; code: string }
const get = (db: Db, guid: string) => db.prepare('select * from chronicles where tournament_guid = ?').get(guid) as unknown as Row | undefined;
const codeOk = (row: Row, code: string) => !!code && timingSafeEqual(Buffer.from(createHash('sha256').update(code).digest('hex')), Buffer.from(row.code));

/** Borrador para mostrar en la página de aprobación (solo con el código correcto). */
export function draftFor(db: Db, guid: string, code: string): { status: string; chronicle: Chronicle } | undefined {
  const row = get(db, guid);
  if (!row || row.status === 'discarded' && !row.title || !codeOk(row, code)) return undefined;
  return { status: row.status, chronicle: { title: row.title, summary: row.summary, paragraphs: JSON.parse(row.body_json) as string[] } };
}

/** Publica o descarta un borrador (con su código). Devuelve `false` si no existe o el código no es válido. */
export function decide(db: Db, guid: string, code: string, action: 'publish' | 'discard'): boolean {
  const row = get(db, guid);
  if (!row || row.status === 'discarded' && !row.title || !codeOk(row, code)) return false;
  db.prepare('update chronicles set status = ?, decided_at = ? where tournament_guid = ?').run(action === 'publish' ? 'published' : 'discarded', nowIso(), guid);
  invalidatePublicState(db);
  return true;
}

/** Sustituye el texto de plantilla de la noticia automática de un torneo por su crónica aprobada. */
export function applyChronicles(db: Db, news: PublicNews[]): PublicNews[] {
  if (news.length === 0) return news;
  const rows = db.prepare("select tournament_guid, title, summary, body_json from chronicles where status = 'published'").all() as unknown as Row[];
  if (rows.length === 0) return news;
  const by = new Map(rows.map((r) => [r.tournament_guid, r]));
  return news.map((n) => {
    const r = by.get(n.tournamentGuid);
    return r ? { ...n, title: r.title, summary: r.summary, body: JSON.parse(r.body_json) as string[] } : n;
  });
}
