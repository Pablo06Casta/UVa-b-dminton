import webpush from 'web-push';
import { settings } from './config';
import { type Db, kvGet, nowIso } from './db';
import type { Estimate } from './estimate';
import { toPublicMatch } from './publicView';
import { getPlayer, ValidationError } from './roster';
import type { StoredMatch } from './uva';

export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushSender {
  send(sub: Subscription, payload: string): Promise<void>;
}

export const pushConfigured = () => !!(settings.vapid.publicKey && settings.vapid.privateKey && settings.vapid.subject);

/** Emisor real (Web Push con claves VAPID). `undefined` si no hay claves: los avisos quedan desactivados. */
export function realSender(): PushSender | undefined {
  if (!pushConfigured()) return undefined;
  webpush.setVapidDetails(settings.vapid.subject, settings.vapid.publicKey, settings.vapid.privateKey);
  return { send: async (sub, payload) => void (await webpush.sendNotification(sub, payload, { TTL: 15 * 60 })) };
}

/** Alta de un aviso: solo para jugadores públicos. Cada navegador (endpoint) tiene un único aviso por jugador. */
export function subscribe(db: Db, body: { subscription?: Subscription; playerId?: number; minutesBefore?: number }) {
  const sub = body.subscription;
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new ValidationError('Suscripción no válida.');
  const player = typeof body.playerId === 'number' ? getPlayer(db, body.playerId) : undefined;
  if (!player || !player.public) throw new ValidationError('Ese jugador no está disponible para avisos.');
  const minutes = Math.round(Number(body.minutesBefore ?? 20));
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 120) throw new ValidationError('Los minutos de antelación deben estar entre 5 y 120.');
  db.prepare('delete from push_subs where endpoint = ? and player_id = ?').run(sub.endpoint, player.id);
  db.prepare('insert into push_subs(endpoint, p256dh, auth, player_id, minutes_before, created_at) values(?,?,?,?,?,?)').run(
    sub.endpoint, sub.keys.p256dh, sub.keys.auth, player.id, minutes, nowIso(),
  );
}

export function unsubscribe(db: Db, endpoint: string, playerId?: number) {
  if (playerId) db.prepare('delete from push_subs where endpoint = ? and player_id = ?').run(endpoint, playerId);
  else db.prepare('delete from push_subs where endpoint = ?').run(endpoint);
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));

interface SubRow { id: number; endpoint: string; p256dh: string; auth: string; player_id: number; minutes_before: number }

/**
 * Envía el aviso «tu partido empieza en ~N min» una sola vez por partido y suscripción, cuando falta el tiempo elegido
 * (por defecto 20 min) para la hora estimada de inicio (o la programada, si aún no hay estimación).
 */
export async function notifyUpcoming(db: Db, now: Date, sender: PushSender): Promise<number> {
  const subs = db.prepare('select * from push_subs').all() as unknown as SubRow[];
  if (subs.length === 0) return 0;
  const publicIds = new Set((db.prepare('select id from players where public = 1').all() as unknown as { id: number }[]).map((r) => r.id));
  const rows = db.prepare("select key, tournament_guid, json from matches where state in ('scheduled','on_court')").all() as unknown as { key: string; tournament_guid: string; json: string }[];
  let sent = 0;

  for (const sub of subs) {
    const player = getPlayer(db, sub.player_id);
    if (!player?.public) {
      db.prepare('delete from push_subs where id = ?').run(sub.id); // ya no es público: se borra el aviso
      continue;
    }
    for (const r of rows) {
      const stored = JSON.parse(r.json) as StoredMatch;
      if (!stored.sides.some((s) => s.players.some((p) => p.rosterId === player.id))) continue;
      const est = kvGet<Estimate>(db, `estimate:${r.tournament_guid}`);
      const pub = toPublicMatch(stored, publicIds, est ?? { starts: {} });
      if (!pub || pub.state !== 'scheduled') continue;
      const start = pub.estimatedStart ?? pub.plannedStart;
      if (!start) continue;
      const minutes = (Date.parse(start) - now.getTime()) / 60_000;
      if (minutes > sub.minutes_before || minutes < -5) continue;
      if (db.prepare('select 1 from push_sent where sub_id = ? and match_key = ?').get(sub.id, r.key)) continue;

      const payload = JSON.stringify({
        title: `${player.name} juega en unos ${Math.max(1, Math.round(minutes))} min`,
        body: [pub.event, pub.court && `Pista ${pub.court}`, `EST ${clock(start)}`].filter(Boolean).join(' · '),
        url: `${settings.siteUrl}/directo?partido=${encodeURIComponent(r.key)}`,
        tag: r.key,
      });
      try {
        await sender.send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        db.prepare('insert into push_sent(sub_id, match_key, sent_at) values(?,?,?)').run(sub.id, r.key, nowIso());
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          db.prepare('delete from push_subs where id = ?').run(sub.id); // el navegador ya no la admite
          break;
        }
        // Otros fallos (red, 5xx): se reintenta en el siguiente ciclo.
      }
    }
  }
  return sent;
}
