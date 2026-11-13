import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationReleaseStore } from '../payments/registration-release-store.mjs';

const root = 'projects/circ-test/databases/(default)/documents';
const registrationId = 'circ-2027-participant';
const orderId = '11111111-1111-4111-8111-111111111111';
const archiveId = '22222222-2222-4222-8222-222222222222';
const stamp = 'a'.repeat(64);
const creditKey = 'b'.repeat(64);
const transaction = 'transaction-one=';
const archivedAt = '2026-11-01T12:00:00.000Z';
const registrationFields = {
  userId: { stringValue: 'participant' },
  eventId: { stringValue: 'circ-2027' },
  submittedAt: { timestampValue: '2026-10-31T10:30:00.123456Z' },
  payment: { mapValue: { fields: {
    orderId: { stringValue: orderId },
    amountCents: { integerValue: '5500' },
    paidAt: { timestampValue: '2026-11-01T09:00:00Z' },
  } } },
};
const registration = {
  id: registrationId,
  name: `${root}/registrations/${registrationId}`,
  version: '2026-11-01T09:00:01.000001Z',
  fields: registrationFields,
  data: { userId: 'participant', eventId: 'circ-2027' },
};
const payment = {
  id: orderId,
  name: `${root}/payments/${orderId}`,
  version: '2026-11-01T09:00:02.000001Z',
  fields: { status: { stringValue: 'paid' }, amountCents: { integerValue: '5500' } },
  data: { id: orderId, status: 'paid', amountCents: 5500, registrationId },
};
const fiscalDocument = {
  id: orderId,
  name: `${root}/documents/${orderId}`,
  version: '2026-11-01T09:00:03.000001Z',
  fields: { status: { stringValue: 'issued' }, providerDocumentId: { stringValue: 'toc-42' } },
  data: { id: orderId, status: 'issued', providerDocumentId: 'toc-42', registrationId },
};
const commitInput = () => ({
  transaction,
  registration: structuredClone(registration),
  payments: [structuredClone(payment)],
  documents: [structuredClone(fiscalDocument)],
  archiveId,
  archiveFields: {
    kind: { stringValue: 'registration-release' },
    eventId: { stringValue: 'circ-2027' },
    registrationId: { stringValue: registrationId },
    stamp: { stringValue: stamp },
    registration: { mapValue: { fields: structuredClone(registrationFields) } },
  },
  auditFields: { action: { stringValue: 'registration.released' } },
  archivedAt,
});
function fixture(responder = () => Response.json({})) {
  const calls = [];
  const store = createRegistrationReleaseStore({
    projectId: 'circ-test', token: 'admin-id-token',
    fetchImpl: async (url, options = {}) => {
      const call = { url, options, body: options.body ? JSON.parse(options.body) : null };
      calls.push(call);
      return responder(call);
    },
  });
  return { store, calls };
}
const fieldFilters = query => query.where.compositeFilter
  ? query.where.compositeFilter.filters.map(filter => filter.fieldFilter)
  : [query.where.fieldFilter];

test('registration release opens explicit transactions and rolls them back with the admin token', async () => {
  const { store, calls } = fixture(call => call.url.endsWith(':beginTransaction')
    ? Response.json({ transaction }) : Response.json({}));
  assert.equal(await store.begin(), transaction);
  assert.equal(await store.begin({ readOnly: false }), transaction);
  await store.rollback(transaction);
  assert.ok(calls[0].url.endsWith('/documents:beginTransaction'));
  assert.deepEqual(calls[0].body, { options: { readOnly: {} } });
  assert.deepEqual(calls[1].body, { options: { readWrite: {} } });
  assert.ok(calls[2].url.endsWith('/documents:rollback'));
  assert.deepEqual(calls[2].body, { transaction });
  for (const call of calls) {
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers.Authorization, 'Bearer admin-id-token');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.cache, 'no-store');
  }
});

test('release source reads are bound to one transaction and retain raw timestamp fields', async () => {
  const { store, calls } = fixture(call => {
    const path = new URL(call.url).pathname;
    const name = path.replace(/^\/v1\//, '');
    return Response.json({ name, fields: registrationFields, updateTime: registration.version });
  });
  const result = await store.readRegistration(registrationId, transaction);
  await store.readProfile('participant', transaction);
  await store.readCredit(creditKey, transaction);
  await store.readArchive(archiveId, transaction);
  assert.equal(result.id, registrationId);
  assert.equal(result.name, registration.name);
  assert.equal(result.version, registration.version);
  assert.deepEqual(result.fields, registrationFields);
  assert.equal(result.data.submittedAt, registrationFields.submittedAt.timestampValue);
  assert.equal(result.data.payment.amountCents, 5500);
  assert.equal(result.data.payment.paidAt, registrationFields.payment.mapValue.fields.paidAt.timestampValue);
  assert.ok(new URL(calls[1].url).pathname.endsWith('/users/participant'));
  assert.ok(new URL(calls[2].url).pathname.endsWith(`/settings/circ-bank-credit-live-${creditKey}`));
  assert.ok(new URL(calls[3].url).pathname.endsWith(`/settings/circ-registration-release-${archiveId}`));
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(new URL(call.url).searchParams.get('transaction'), transaction);
  }
});

test('release queries all financial links inside the transaction with a truncation sentinel', async () => {
  const { store, calls } = fixture(call => {
    const collection = call.body.structuredQuery.from[0].collectionId;
    return Response.json([{ document: {
      name: `${root}/${collection}/${orderId}`, fields: payment.fields, updateTime: payment.version,
    } }]);
  });
  for (const collection of ['payments', 'documents', 'registrationOrders']) {
    const rows = await store.related(collection, registrationId, transaction);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, orderId);
    assert.equal(rows[0].data.amountCents, 5500);
    assert.deepEqual(rows[0].fields, payment.fields);
    assert.equal(rows[0].version, payment.version);
    const call = calls.at(-1);
    assert.ok(call.url.endsWith('/documents:runQuery'));
    assert.equal(call.body.transaction, transaction);
    assert.deepEqual(call.body.structuredQuery.from, [{ collectionId: collection }]);
    assert.equal(call.body.structuredQuery.limit, 26);
    assert.deepEqual(fieldFilters(call.body.structuredQuery), [{
      field: { fieldPath: 'registrationId' }, op: 'EQUAL', value: { stringValue: registrationId },
    }]);
  }
});

test('archive replay lookup is restricted to the original registration and exact stamp', async () => {
  const { store, calls } = fixture(() => Response.json([{ document: {
    name: `${root}/settings/circ-registration-release-${archiveId}`,
    fields: { stamp: { stringValue: stamp } }, updateTime: 'archive-version',
  } }]));
  const rows = await store.findArchive(registrationId, stamp, transaction);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, `circ-registration-release-${archiveId}`);
  const { structuredQuery: query, transaction: queryTransaction } = calls[0].body;
  assert.equal(queryTransaction, transaction);
  assert.deepEqual(query.from, [{ collectionId: 'settings' }]);
  assert.equal(query.limit, 2);
  assert.deepEqual(fieldFilters(query).map(filter => [filter.field.fieldPath, filter.op, filter.value.stringValue]), [
    ['kind', 'EQUAL', 'registration-release'],
    ['eventId', 'EQUAL', 'circ-2027'],
    ['registrationId', 'EQUAL', registrationId],
    ['stamp', 'EQUAL', stamp],
  ]);
});

test('release commit archives the raw source and deletes only its active registration with version guards', async () => {
  const { store, calls } = fixture(() => Response.json({ writeResults: [] }));
  const input = commitInput();
  await store.commit(input);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/documents:commit'));
  assert.equal(calls[0].body.transaction, transaction);
  const writes = calls[0].body.writes;
  assert.equal(writes.length, 5);
  const archive = writes.find(write => write.update?.name === `${root}/settings/circ-registration-release-${archiveId}`);
  const audit = writes.find(write => write.update?.name === `${root}/auditLogs/registration-release-${archiveId}`);
  const paymentWrite = writes.find(write => write.update?.name === payment.name);
  const documentWrite = writes.find(write => write.update?.name === fiscalDocument.name);
  const deletion = writes.find(write => write.delete);
  assert.ok(archive);
  assert.deepEqual(archive.currentDocument, { exists: false });
  assert.deepEqual(archive.update.fields, input.archiveFields);
  assert.deepEqual(archive.update.fields.registration.mapValue.fields.submittedAt,
    { timestampValue: '2026-10-31T10:30:00.123456Z' });
  assert.ok(audit);
  assert.deepEqual(audit.currentDocument, { exists: false });
  assert.deepEqual(audit.update.fields, input.auditFields);
  assert.deepEqual(paymentWrite.currentDocument, { updateTime: payment.version });
  assert.deepEqual(paymentWrite.updateMask.fieldPaths.slice().sort(), ['registrationArchiveId', 'registrationArchivedAt'].sort());
  assert.deepEqual(Object.keys(paymentWrite.update.fields).sort(), ['registrationArchiveId', 'registrationArchivedAt'].sort());
  assert.equal(paymentWrite.update.fields.registrationArchiveId.stringValue, archiveId);
  assert.equal(paymentWrite.update.fields.registrationArchivedAt.stringValue
    ?? paymentWrite.update.fields.registrationArchivedAt.timestampValue, archivedAt);
  assert.deepEqual(documentWrite.currentDocument, { updateTime: fiscalDocument.version });
  assert.deepEqual(documentWrite.updateMask.fieldPaths.slice().sort(), ['registrationArchiveId', 'registrationArchivedAt'].sort());
  assert.deepEqual(Object.keys(documentWrite.update.fields).sort(), ['registrationArchiveId', 'registrationArchivedAt'].sort());
  assert.equal(documentWrite.update.fields.registrationArchiveId.stringValue, archiveId);
  assert.equal(documentWrite.update.fields.registrationArchivedAt.stringValue
    ?? documentWrite.update.fields.registrationArchivedAt.timestampValue, archivedAt);
  assert.deepEqual(deletion, { delete: registration.name, currentDocument: { updateTime: registration.version } });
  assert.equal(writes.filter(write => write.delete).length, 1);
  assert.ok(writes.every(write => !/^(users|registrationOrders)\//.test((write.update?.name ?? write.delete ?? '').slice(root.length + 1))));
  assert.ok(writes.every(write => !(write.update?.name ?? '').includes('/settings/circ-bank-credit-live-')));
});

test('invalid document paths, collection names and absent transaction cannot issue storage calls', async () => {
  const { store, calls } = fixture();
  const invalid = [
    () => store.readRegistration('../other', transaction),
    () => store.readProfile('../other', transaction),
    () => store.readCredit('../other', transaction),
    () => store.readArchive('../other', transaction),
    () => store.related('users', registrationId, transaction),
    () => store.related('payments/other', registrationId, transaction),
    () => store.related('payments', '../other', transaction),
    () => store.findArchive(registrationId, 'bad-stamp', transaction),
    () => store.readRegistration(registrationId, ''),
    () => store.related('payments', registrationId, ''),
    () => store.findArchive(registrationId, stamp, ''),
    () => store.commit({ ...commitInput(), transaction: '' }),
    () => store.commit({ ...commitInput(), registration: { ...registration, name: `${root}/users/participant` } }),
    () => store.commit({ ...commitInput(), payments: [{ ...payment, name: `${root}/documents/${orderId}` }] }),
    () => store.commit({ ...commitInput(), documents: [{ ...fiscalDocument, name: `${root}/payments/${orderId}` }] }),
    () => store.commit({ ...commitInput(), archiveId: '../other' }),
    () => store.commit({ ...commitInput(), registration: { ...registration, version: null } }),
    () => store.commit({ ...commitInput(), payments: [{ ...payment, version: null }] }),
    () => store.commit({ ...commitInput(), documents: [{ ...fiscalDocument, version: null }] }),
    () => store.commit({ ...commitInput(), payments: [] }),
    () => store.commit({ ...commitInput(), payments: [payment, payment] }),
    () => store.commit({ ...commitInput(), payments: [{ ...payment, data: { ...payment.data, registrationArchiveId: archiveId } }] }),
    () => store.commit({ ...commitInput(), documents: [{ ...fiscalDocument, data: { ...fiscalDocument.data, registrationArchivedAt: archivedAt } }] }),
  ];
  for (const operation of invalid) await assert.rejects(operation, error => ['storage_invalid', 'invalid_request'].includes(error.code));
  assert.equal(calls.length, 0);
});

test('release commit conflicts and transport failures are surfaced without retries or partial writes', async () => {
  for (const status of [409, 412]) {
    const { store, calls } = fixture(() => new Response('', { status }));
    await assert.rejects(store.commit(commitInput()), error => error.code === 'conflict');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.writes.length, 5);
  }
  const { store, calls } = fixture(() => { throw new Error('connection lost'); });
  await assert.rejects(store.commit(commitInput()), error => error.code === 'storage_unavailable' && error.supportCause === 'network');
  assert.equal(calls.length, 1);
});

test('release store provides bounded causes without retaining the upstream response body', async () => {
  for (const [status, cause] of [[403, 'http-403'], [429, 'http-429'], [504, 'http-504'], [418, 'response']]) {
    const { store } = fixture(() => new Response('sensitive upstream data', { status }));
    await assert.rejects(store.findArchive(registrationId, stamp, transaction), error =>
      error.code === 'storage_unavailable' && error.supportCause === cause && error.message === 'storage_unavailable');
  }
  const timeout = fixture(() => { throw new DOMException('private timeout detail', 'TimeoutError'); });
  await assert.rejects(timeout.store.commit(commitInput()), error => error.code === 'storage_unavailable' && error.supportCause === 'timeout');
  const unreadable = fixture(() => new Response('private malformed response'));
  await assert.rejects(unreadable.store.commit(commitInput()), error => error.code === 'storage_unavailable' && error.supportCause === 'response');
});
