/* Avisos del Club Bádminton UVa: muestra la notificación enviada por el servidor y abre el partido al pulsarla. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Club Bádminton UVa', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Club Bádminton UVa', {
      body: data.body || '',
      tag: data.tag,
      icon: 'images/logo-uva.png',
      badge: 'images/logo-uva.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.navigate(url).then(() => c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
