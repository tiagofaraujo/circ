// Offline-policy checks; no network calls, real accounts or browser required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const events = {};
const cached = [];
const worker = fs.readFileSync(path.join(root, 'public/my-circ-sw.js'), 'utf8');
const context = {
  self: { location: { origin: 'https://circ.example' }, addEventListener: (event, callback) => { events[event] = callback; } },
  URL, Response,
  fetch: async () => { throw new Error('offline'); },
  caches: {
    open: async () => ({ add: async (url) => { cached.push(url); } }),
    match: async () => new Response('Generic offline page'),
    keys: async () => [],
  },
};
vm.runInNewContext(worker, context);

(async () => {
  let installing;
  events.install({ waitUntil: (work) => { installing = work; } });
  await installing;
  assert.deepEqual(cached, ['/my-circ-offline.html']);
  for (const request of [
    { url: 'https://firestore.googleapis.com/account', mode: 'cors', method: 'GET' },
    { url: 'https://circ.example/api/submissions', mode: 'cors', method: 'POST' },
    { url: 'https://circ.example/conta', mode: 'navigate', method: 'POST' },
    { url: 'https://circ.example/documents/private.pdf', mode: 'navigate', method: 'GET' },
    { url: 'https://circ.example/conta/data', mode: 'cors', method: 'GET' },
    { url: 'https://circ.example/', mode: 'navigate', method: 'GET' },
  ]) {
    events.fetch({ request, respondWith: () => assert.fail('Non-account-navigation request intercepted') });
  }
  let result;
  events.fetch({ request: { url: 'https://circ.example/conta/submissoes', mode: 'navigate', method: 'GET' }, respondWith: (response) => { result = response; } });
  assert.equal(await (await result).text(), 'Generic offline page');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, '/conta');
  assert.equal(manifest.display, 'standalone');
  manifest.icons.forEach((icon) => assert.ok(fs.existsSync(path.join(root, 'public', icon.src))));
  console.log('PWA checks passed: manifest, icons, account fallback and no private/API request caching.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
