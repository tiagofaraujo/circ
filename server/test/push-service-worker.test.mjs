import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../public/my-circ-sw.js', import.meta.url), 'utf8');
function worker() {
  const events = {}, displayed = [], opened = [];
  const context = { URL, self: { addEventListener: (type, fn) => { events[type] = fn; },
    location: { origin: 'https://circ-coimbra.org' },
    registration: { showNotification: async (...args) => displayed.push(args) },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
  } };
  vm.runInNewContext(source, context);
  return { events, displayed, opened, context };
}
test('every push displays a visible notification, including malformed JSON', async () => {
  const w = worker(); let done;
  w.events.push({ data: { json() { throw new Error(); } }, waitUntil(p) { done = p; } }); await done;
  assert.equal(w.displayed.length, 1);
  assert.equal(w.displayed[0][0], 'My CIRC');
});
test('private birthday greetings use a separate annual tag and keep the personalised text', async () => {
  const w = worker(); let done;
  w.events.push({ data: { json: () => ({ body: 'Parabéns, Tiago!', tag: 'circ-birthday-2026', url: '/conta/notificacoes' }) },
    waitUntil(p) { done = p; } }); await done;
  assert.equal(w.displayed[0][1].body, 'Parabéns, Tiago!');
  assert.equal(w.displayed[0][1].tag, 'circ-birthday-2026');
});
test('different announcements have distinct tags and refresh open account windows', async () => {
  const w = worker(); let done; const messages = [];
  w.context.self.clients.matchAll = async () => [{ postMessage: message => messages.push(message) }];
  const tag = 'circ-announcement-7e4121c9-a990-44c8-9751-a438e77fd910';
  w.events.push({ data: { json: () => ({ body: 'Programa atualizado', tag }) }, waitUntil(p) { done = p; } }); await done;
  assert.equal(w.displayed[0][1].tag, tag);
  assert.equal(messages[0].type, 'CIRC_NOTIFICATION');
});
test('notification click cannot open an external, javascript or payment URL', async () => {
  for (const value of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/conta/inscricoes?pay=1']) {
    const w = worker(); let done;
    w.events.notificationclick({ notification: { close() {}, data: { url: value } }, waitUntil(p) { done = p; } }); await done;
    assert.equal(w.opened[0], 'https://circ-coimbra.org/conta/notificacoes');
  }
});
test('click focuses the target without replacing an unfinished registration form', async () => {
  const w = worker(); let done, focused = false;
  w.context.self.clients.matchAll = async () => [{ url: 'https://circ-coimbra.org/conta/inscricoes', focus() { throw new Error('wrong page'); } },
    { url: 'https://circ-coimbra.org/conta/notificacoes', focus() { focused = true; } }];
  w.events.notificationclick({ notification: { close() {}, data: { url: '/conta/notificacoes' } }, waitUntil(p) { done = p; } }); await done;
  assert.equal(focused, true); assert.equal(w.opened.length, 0);
});
