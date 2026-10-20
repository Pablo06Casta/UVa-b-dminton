import { asset } from './asset';
import { fetchPushKey, postJson } from './api';

const KEY = 'uva-avisos';

/** Avisos activados en este navegador (jugador → minutos de antelación). Solo una comodidad: la verdad está en el navegador y el servidor. */
export function activeAlerts(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<number, number>;
  } catch {
    return {};
  }
}
const saveAlerts = (a: Record<number, number>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
};

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type EnableResult = 'ok' | 'unsupported' | 'denied' | 'disabled' | 'error';

/** Activa el aviso «N minutos antes» para un jugador. Debe llamarse desde un clic (el navegador pide el permiso). */
export async function enableAlert(playerId: number, minutes: number): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  try {
    const key = await fetchPushKey();
    if (!key.enabled || !key.publicKey) return 'disabled';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.register(asset('sw.js'));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) }));
    await postJson('/api/public/push/subscribe', { subscription: sub.toJSON(), playerId, minutesBefore: minutes });
    saveAlerts({ ...activeAlerts(), [playerId]: minutes });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function disableAlert(playerId: number): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await postJson('/api/public/push/unsubscribe', { endpoint: sub.endpoint, playerId });
  } catch {
    /* si el servidor no responde, al menos se quita localmente */
  }
  const rest = { ...activeAlerts() };
  delete rest[playerId];
  saveAlerts(rest);
}
