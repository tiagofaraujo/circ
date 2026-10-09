import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutSandboxStore } from '../payments/checkout-sandbox-store.mjs';
const ID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const root = 'projects/circ-coimbra/databases/(default)/documents';
const name = `${root}/settings/circ-checkout-sandbox-admin-${ID}`;
const record = { id: ID, owner: 'admin', environment: 'sandbox', kind: 'checkout-test', eventId: 'circ-2027', orders: [], createdAt: '2026-10-09T10:00:00Z' };
const doc = (r = record) => ({ name, fields: { payload: { stringValue: JSON.stringify(r) } }, updateTime: '2026-10-09T10:00:00.000001Z' });
const make = fn => createCheckoutSandboxStore({ projectId: 'circ-coimbra', token: 'private-test-token', uid: 'admin', fetchImpl: fn });
test('reads and writes stay in the owner sandbox settings namespace with conditional versions', async () => {
  const requests = [];
  const store = make(async (url, options) => { requests.push({ url, options }); return Response.json(doc()); });
  assert.deepEqual((await store.read(ID)).record, record);
  await store.create(ID, record); await store.replace(ID, record, doc().updateTime);
  assert.equal(requests[0].options.method, 'GET');
  assert.match(requests[1].url, /currentDocument.exists=false$/); assert.equal(requests[1].options.method, 'PATCH');
  assert.match(requests[2].url, /currentDocument.updateTime=/);
  for (const { url, options } of requests) { assert.ok(url.startsWith(`https://firestore.googleapis.com/v1/${name}`)); assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Authorization, 'Bearer private-test-token'); }
});
test('data for another owner, environment or kind is neither read nor written', async () => {
  for (const fields of [{ owner: 'other' }, { environment: 'production' }, { kind: 'registration' }, { id: 'different' }]) {
    const store = make(async () => Response.json(doc({ ...record, ...fields })));
    await assert.rejects(store.read(ID)); await assert.rejects(store.create(ID, { ...record, ...fields }));
  }
});
test('malformed paths never cause network requests', async () => {
  const store = make(() => assert.fail('must not fetch'));
  for (const id of ['../registrations', 'a/b', 'not-a-uuid']) await assert.rejects(store.read(id));
  assert.throws(() => createCheckoutSandboxStore({ projectId: 'circ-coimbra', token: 'x', uid: '../admin' }));
});
test('permission and transport errors do not expose raw response or tokens', async () => {
  for (const status of [401, 403, 409, 412, 503, 302]) {
    const store = make(async () => new Response('private provider response with tokens', { status }));
    await assert.rejects(store.read(ID), error => !JSON.stringify(error).includes('tokens') && error.code.startsWith(status === 409 || status === 412 ? 'conflict' : 'storage_'));
  }
});
test('history uses only the document-name index in the owner namespace', async () => {
  const store = make(async (url, options) => {
    assert.ok(url.endsWith('/documents:runQuery')); const body = JSON.parse(options.body);
    assert.equal(body.structuredQuery.from[0].collectionId, 'settings');
    const filters = body.structuredQuery.where.compositeFilter.filters;
    assert.equal(filters[0].fieldFilter.value.referenceValue, `${root}/settings/circ-checkout-sandbox-admin-`);
    assert.equal(filters[1].fieldFilter.value.referenceValue, `${root}/settings/circ-checkout-sandbox-admin-~`);
    return Response.json([{ document: doc() }]);
  });
  assert.deepEqual((await store.list()).records, [record]);
});
test('external-category context requires no private-record reads', async () => {
  const store = make(() => assert.fail('external rate must not query eligibility'));
  assert.deepEqual(await store.context({ email_verified: true }, 'external'), { context: { uid: 'admin', emailVerified: true }, guards: [] });
});
test('student context comes from typed Firestore records, with read versions', async () => {
  const store = make(async url => {
    const path = url.split('/v1/')[1];
    const fields = path.includes('/users/') ? { name: { stringValue: 'Participante   Teste' } } : { status: { stringValue: 'approved' }, userId: { stringValue: 'admin' } };
    return Response.json({ name: path, updateTime: 'v1', fields });
  });
  const { context, guards } = await store.context({ email_verified: true }, 'student');
  assert.equal(context.profileName, 'Participante Teste'); assert.equal(context.student.status, 'approved');
  assert.deepEqual(guards.map(g => g.name), [`${root}/users/admin`, `${root}/studentVerifications/admin`]);
  assert.ok(guards.every(g => g.version === 'v1'));
});
test('ULS context reads only the matched MEC, claim and private roster', async () => {
  const paths = [];
  const store = make(async url => {
    const path = url.split('/v1/')[1]; paths.push(path);
    const fields = path.includes('/ulsEligibility/') ? { mec: { stringValue: '1234' } } : { active: { booleanValue: true } };
    return Response.json({ name: path, updateTime: 'v1', fields });
  });
  const { context, guards } = await store.context({ email_verified: true }, 'uls');
  assert.equal(context.uls.mec, '1234'); assert.equal(context.roster.active, true); assert.equal(guards.length, 3);
  assert.ok(paths.includes(`${root}/ulsMecClaims/circ-2027_1234`)); assert.ok(paths.includes(`${root}/ulsRoster/1234`));
});
test('eligibility guards are re-read in a transaction that writes only the checkout document', async () => {
  const guard = { name: `${root}/studentVerifications/admin`, version: 'original-version' };
  const calls = [];
  const store = make(async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    if (url.endsWith(':batchGet')) {
      assert.deepEqual(body.documents, [guard.name, name]); assert.deepEqual(body.newTransaction, { readWrite: {} });
      return Response.json([{ transaction: 'dGVzdA==' }, { found: { ...doc(), updateTime: 'v1' } }, { found: { name: guard.name, updateTime: guard.version } }]);
    }
    assert.ok(url.endsWith(':commit')); assert.equal(body.transaction, 'dGVzdA==');
    assert.equal(body.writes.length, 1); assert.equal(body.writes[0].update.name, name);
    assert.equal(body.writes[0].verify, undefined); assert.deepEqual(body.writes[0].currentDocument, { updateTime: 'v1' });
    return Response.json({ writeResults: [{ updateTime: 'v2' }] });
  });
  assert.equal((await store.replace(ID, record, 'v1', [guard])).version, 'v2'); assert.equal(calls.length, 2);
});
test('a changed eligibility record rolls back without committing or writing the source', async () => {
  const calls = [];
  const guard = { name: `${root}/ulsRoster/1234`, version: 'before' };
  const store = make(async (url, options) => {
    calls.push(url);
    if (url.endsWith(':rollback')) return Response.json({});
    assert.ok(url.endsWith(':batchGet'));
    return Response.json([{ transaction: 'dGVzdA==' }, { found: { ...doc(), updateTime: 'v1' } }, { found: { name: guard.name, updateTime: 'after' } }]);
  });
  await assert.rejects(store.replace(ID, record, 'v1', [guard]), error => error.code === 'conflict');
  assert.ok(calls.at(-1).endsWith(':rollback')); assert.ok(!calls.some(url => url.endsWith(':commit')));
});
test('a missing eligibility document is checked as missing inside the transaction', async () => {
  const guard = { name: `${root}/studentVerifications/admin`, version: null };
  const store = make(async url => url.endsWith(':batchGet') ? Response.json([
    { transaction: 'dGVzdA==' }, { missing: guard.name }, { found: { ...doc(), updateTime: 'v1' } },
  ]) : Response.json({ writeResults: [{ updateTime: 'v2' }] }));
  assert.equal((await store.replace(ID, record, 'v1', [guard])).version, 'v2');
});
test('commit failures remain uncertain and never initiate a payment from the store', async () => {
  const guard = { name: `${root}/users/admin`, version: 'v1' };
  const calls = [];
  const store = make(async url => {
    calls.push(url);
    if (url.endsWith(':batchGet')) return Response.json([{ transaction: 'dGVzdA==' }, { found: { ...doc(), updateTime: 'v1' } }, { found: { name: guard.name, updateTime: 'v1' } }]);
    if (url.endsWith(':commit')) throw new Error('private error');
    return Response.json({});
  });
  await assert.rejects(store.replace(ID, record, 'v1', [guard]), error => error.code === 'storage_unavailable');
  assert.ok(calls.at(-1).endsWith(':rollback')); assert.ok(calls.every(url => url.startsWith('https://firestore.googleapis.com/')));
});

test('registration-copy derives its canonical ID from the authenticated document path', async () => {
  const store = make(async url => {
    assert.equal(url, `https://firestore.googleapis.com/v1/${root}/registrations/circ-2027-admin`);
    return Response.json({ name: `${root}/registrations/circ-2027-admin`, updateTime: 'v1', fields: {
      id: { stringValue: 'untrusted-field' }, isTest: { booleanValue: true },
      payment: { mapValue: { fields: { status: { stringValue: 'paid' } } } },
    } });
  });
  const { data } = await store.sourceRegistration();
  assert.equal(data.id, 'circ-2027-admin'); assert.equal(data.isTest, true);
  assert.equal(data.payment.status, 'paid');
});
