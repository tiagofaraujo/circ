/* A network-first app, NOT an offline copy of a personal account.
 * Only the generic, public connection notice is stored by this worker.
 * No Firebase, profile, submission, payment or document request is cached.
 */
const OFFLINE_CACHE = 'my-circ-offline-v1';
const OFFLINE_PAGE = '/my-circ-offline.html';

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
