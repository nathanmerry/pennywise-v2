/* No offline cache: this worker only handles notifications. */
function safeDestination(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch { /* Use the app home for malformed destinations. */ }
  return `${self.location.origin}/`;
}
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Show a generic notification. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Pennywise', {
    body: payload.body || 'Open Pennywise for an update.',
    icon: '/icons/icon-192.png',
    tag: payload.tag || 'pennywise',
    data: { url: safeDestination(payload.url) },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeDestination(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
