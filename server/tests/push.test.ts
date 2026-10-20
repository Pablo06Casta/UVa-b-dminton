import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../src/engine';
import { notifyUpcoming, subscribe, unsubscribe, type PushSender, type Subscription } from '../src/push';
import { createPlayer, updatePlayer, ValidationError } from '../src/roster';
import { FakeSource, memDb, PROFILE, row } from './helpers/fakes';

const NOW = new Date('2026-11-07T10:00:00Z');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const sub: Subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } };

class Sender implements PushSender {
  sent: { sub: Subscription; payload: { title: string; body: string; url: string } }[] = [];
  fail?: number;
  async send(s: Subscription, payload: string) {
    if (this.fail) throw Object.assign(new Error('push'), { statusCode: this.fail });
    this.sent.push({ sub: s, payload: JSON.parse(payload) });
  }
}

async function scene(plannedInMin: number) {
  const db = memDb();
  const src = new FakeSource();
  const p = createPlayer(db, { name: 'Ana Prueba', profile: PROFILE, public: true, consentBy: 'Ella', consentAt: '2026-10-01' });
  const planned = min(plannedInMin).toISOString();
  src.dayRows = [{ ...row({ clock: '10:20' }), plannedUtc: planned } as ReturnType<typeof row>];
  const engine = new SyncEngine(db, src, () => NOW);
  for (let i = 0; i < 6; i++) await engine.tick(new Date(NOW.getTime() + i * 1000));
  return { db, p, src, engine };
}

describe('avisos antes del partido', () => {
  it('solo se puede suscribir a jugadores públicos y con datos válidos', async () => {
    const { db, p } = await scene(30);
    const hidden = createPlayer(db, { name: 'Carla Prueba' });
    expect(() => subscribe(db, { subscription: sub, playerId: hidden.id })).toThrow(ValidationError);
    expect(() => subscribe(db, { subscription: { ...sub, endpoint: 'http://inseguro' }, playerId: p.id })).toThrow(ValidationError);
    expect(() => subscribe(db, { subscription: sub, playerId: p.id, minutesBefore: 3 })).toThrow(/entre 5 y 120/);
    subscribe(db, { subscription: sub, playerId: p.id });
    expect((db.prepare('select minutes_before m from push_subs').get() as { m: number }).m).toBe(20);
  });

  it('avisa 20 min antes (ni antes ni después de la ventana) y solo una vez', async () => {
    const { db, p } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id });
    const s = new Sender();
    expect(await notifyUpcoming(db, NOW, s)).toBe(0); // faltan 30 min
    expect(await notifyUpcoming(db, min(9), s)).toBe(0); // faltan 21
    expect(await notifyUpcoming(db, min(11), s)).toBe(1); // faltan 19
    expect(s.sent[0].payload.title).toBe('Ana Prueba juega en ~19 min');
    expect(s.sent[0].payload.body).toContain('IM · Octavos');
    expect(s.sent[0].payload.url).toContain('/directo?partido=');
    expect(await notifyUpcoming(db, min(15), s)).toBe(0); // ya enviado
  });

  it('respeta la antelación elegida', async () => {
    const { db, p } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id, minutesBefore: 10 });
    const s = new Sender();
    expect(await notifyUpcoming(db, min(15), s)).toBe(0); // faltan 15
    expect(await notifyUpcoming(db, min(21), s)).toBe(1); // faltan 9
  });

  it('usa la hora estimada, no la programada, cuando el torneo va con retraso', async () => {
    const { db, p, engine } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id });
    // El motor ya calculó una estimación; la forzamos 45 min más tarde que la programada.
    const key = (db.prepare('select key from matches').get() as { key: string }).key;
    db.prepare("update kv set v = ? where k like 'estimate:%'").run(JSON.stringify({ date: '2026-11-07', starts: { [key]: min(75).toISOString() } }));
    const s = new Sender();
    expect(await notifyUpcoming(db, min(11), s)).toBe(0); // por la hora programada tocaría; por la estimada, no
    expect(await notifyUpcoming(db, min(56), s)).toBe(1);
    void engine;
  });

  it('un navegador que ya no admite avisos (410) se da de baja', async () => {
    const { db, p } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id });
    const s = new Sender();
    s.fail = 410;
    await notifyUpcoming(db, min(15), s);
    expect(db.prepare('select count(*) n from push_subs').get()).toEqual({ n: 0 });
  });

  it('al dejar de ser público se borran sus avisos', async () => {
    const { db, p } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id });
    updatePlayer(db, p.id, { public: false });
    expect(db.prepare('select count(*) n from push_subs').get()).toEqual({ n: 0 });
  });

  it('se puede cancelar el aviso', async () => {
    const { db, p } = await scene(30);
    subscribe(db, { subscription: sub, playerId: p.id });
    unsubscribe(db, sub.endpoint, p.id);
    expect(db.prepare('select count(*) n from push_subs').get()).toEqual({ n: 0 });
  });
});
