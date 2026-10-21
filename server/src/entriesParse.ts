/** Lectores de las páginas públicas de jugadores e inscritos de un torneo (formato «Apellido, Nombre»). */

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Lista de jugadores del torneo: identificador del torneo y nombre en formato normal («Nombre Apellido»). */
export function parsePlayersList(html: string): { tsPlayerId: number; name: string }[] {
  const out: { tsPlayerId: number; name: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href="[^"]*player\.aspx\?[^"]*?player=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tsPlayerId = Number(m[1]);
    const listName = clean(m[2]);
    if (!tsPlayerId || !listName || out.some((o) => o.tsPlayerId === tsPlayerId)) continue;
    const [last, first] = listName.split(',').map((x) => x.trim());
    out.push({ tsPlayerId, name: first ? `${first} ${last}` : listName });
  }
  return out;
}

/** GUID del perfil oficial que enlaza la ficha de un jugador dentro del torneo: identifica a la persona sin dudas con homónimos. */
export function parsePlayerPageProfile(html: string): string | undefined {
  return html.match(/profile\/default\.aspx\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]?.toUpperCase();
}

/** Pruebas del torneo: enlaces a `event.aspx?...&event=N` de la página de categorías. */
export function parseEventsList(html: string): { eventId: number; name: string }[] {
  const out: { eventId: number; name: string }[] = [];
  for (const m of html.matchAll(/<a[^>]+href="[^"]*event\.aspx\?[^"]*?event=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const eventId = Number(m[1]);
    const name = clean(m[2]);
    if (eventId && name && !out.some((o) => o.eventId === eventId)) out.push({ eventId, name });
  }
  return out;
}
