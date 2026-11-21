/* A network-first app, NOT an offline copy of a personal account.
 * Only the generic, public connection notice is stored by this worker.
 * No Firebase, profile, submission, payment or document request is cached.
 */
const OFFLINE_CACHE = 'my-circ-offline-v1';
const OFFLINE_PAGE = '/my-circ-offline.html';

// Updated only after an explicit opt-in click, never while a form is being edited.
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_PUSH_WORKER') event.waitUntil(self.skipWaiting());
});

function notificationUrl(value) {
  // Notifications may only open known account views, never arbitrary URLs.
  return ['/conta', '/conta/notificacoes', '/conta/programa'].includes(value) ? value : '/conta/notificacoes';
}

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Always display a visible, generic notification. */ }
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 240) : 'Tem uma nova notificação no My CIRC.';
  event.waitUntil(self.registration.showNotification('My CIRC', {
    body, icon: '/circ-icon-20261105-hd-192.png', badge: '/circ-icon-20261105-hd-192.png',
    tag: payload.tag === 'circ-push-test' ? 'circ-push-test' : 'circ-notification',
    data: { url: notificationUrl(payload.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(notificationUrl(event.notification.data?.url), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse only the target page. Do not navigate away from an unsaved registration form.
    const existing = windows.find(client => client.url === target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_PAGE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('my-circ-offline-') && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key))
  )));
  // Do not force a reload or take over a page with an unsaved form.
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const accountPage = url.pathname === '/conta' || url.pathname.startsWith('/conta/')
    || ['/app', '/login', '/registar', '/recuperar-password'].includes(url.pathname);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate'
    || url.origin !== self.location.origin || !accountPage) return;

  event.respondWith(fetch(event.request).catch(async () => (
    await caches.match(OFFLINE_PAGE)
    || new Response('Sem ligação / Offline. Volte a ligar-se para aceder ao My CIRC.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  )));
});
