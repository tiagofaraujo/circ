import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushStore } from '../push.mjs';
import { createPushRetentionJob } from '../push-retention.mjs';

const time = Date.parse('2026-11-21T09:00:00Z');
const root = 'projects/circ-coimbra/databases/(default)/documents';
const expired = (collection, n = 'a') => ({ name: `${root}/${collection}/${n.repeat(64)}`, updateTime: 'revision',
  fields: { expiresAt: { timestampValue: '2026-11-20T00:00:00Z' } } });

test('retention runs independently of paused delivery, only on the scheduled hour', async () => {
  const calls = [];
  const run = createPushRetentionJob({ now: () => time, tokenProvider: async () => 'token',
    storeFactory: () => ({ removeExpired: async value => { calls.push(value); return { removed: 1 }; } }) });
  assert.equal((await run(time, {})).skipped, 'disabled');
  const env = { PUSH_RETENTION_ENABLED: 'true', PUSH_ENABLED: 'false' };
  assert.equal((await run(time - 60000, env)).skipped, 'outside-window');
  assert.equal((await run(time - 3600000, env)).skipped, 'outside-window');
  assert.equal((await run(time, env)).removed, 1);
  assert.deepEqual(calls, [time]);
});

test('cleanup projects expiry only, guards each deletion revision and preserves renewed records', async () => {
  const calls = [];
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, opts) => {
    const body = JSON.parse(opts.body); calls.push({ url, body });
    if (url.endsWith(':runQuery')) {
      const collection = body.structuredQuery.from[0].collectionId;
      return Response.json(collection === 'pushSubscriptions' ? [{ document: expired(collection) }, { document: expired(collection, 'b') }] : []);
    }
    return Response.json({ status: [{}, { code: 9, message: 'renewed' }] });
  } });
  assert.deepEqual(await store.removeExpired(time), { removed: 1, changed: 1, failed: 0, fullBatches: 0 });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.filter(c => c.url.endsWith(':runQuery')).map(c => c.body.structuredQuery.from[0].collectionId),
    ['pushSubscriptions', 'pushBirthdayDeliveries', 'pushAnnouncementDeliveries']);
  for (const call of calls.filter(c => c.url.endsWith(':runQuery'))) {
    const q = call.body.structuredQuery;
    assert.deepEqual(q.select, { fields: [{ fieldPath: 'expiresAt' }] });
    assert.equal(q.limit, 100);
    assert.equal(q.where.fieldFilter.op, 'LESS_THAN_OR_EQUAL');
  }
  for (const write of calls[1].body.writes) {
    assert.deepEqual(write.currentDocument, { updateTime: 'revision' });
    assert.match(write.delete, /\/pushSubscriptions\/[ab]{64}$/);
  }
});

test('cleanup refuses foreign paths, future/missing expiry and missing revisions before any delete', async () => {
  for (const bad of [
    { ...expired('users') },
    { ...expired('pushSubscriptions'), name: `${root}/pushSubscriptions/not-a-hash` },
    { ...expired('pushSubscriptions'), fields: { expiresAt: { timestampValue: '2028-01-01' } } },
    { ...expired('pushSubscriptions'), updateTime: undefined },
    { ...expired('pushSubscriptions'), fields: {} },
  ]) {
    let calls = 0;
    const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async () => {
      calls++; return Response.json([{ document: bad }]);
    } });
    await assert.rejects(store.removeExpired(time));
    assert.equal(calls, 1);
  }
});

test('partial delete failures are counted, and invalid batch responses are rejected', async () => {
  let statuses = [{ code: 7 }];
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, opts) => {
    const q = JSON.parse(opts.body).structuredQuery;
    if (q) return Response.json(q.from[0].collectionId === 'pushSubscriptions' ? [{ document: expired('pushSubscriptions') }] : []);
    return Response.json({ status: statuses });
  } });
  assert.equal((await store.removeExpired(time)).failed, 1);
  statuses = [];
  await assert.rejects(store.removeExpired(time));
});

test('daily cursor uses compare-and-swap so a late execution cannot rewind progress', async () => {
  const calls = [];
  const data = { day: '2026-11-21', cursor: `${root}/pushSubscriptions/${'a'.repeat(64)}`, done: false };
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, opts) => {
    calls.push({ url, ...opts });
    if (!opts.method) return Response.json({ name: `${root}/pushJobs/birthday`, updateTime: 'revision', fields: { record: { stringValue: JSON.stringify(data) } } });
    return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
  } });
  const previous = await store.birthdayProgress();
  assert.equal(await store.saveBirthdayProgress({ ...data, done: true }, previous), false);
  assert.match(calls[1].url, /currentDocument.updateTime=revision/);
  assert.deepEqual(Object.keys(JSON.parse(calls[1].body).fields), ['record']);
});
