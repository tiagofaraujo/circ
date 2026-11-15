import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationReleaseStore, testRegistrationArchiveId } from '../payments/registration-release-store.mjs';

const registrationId = 'circ-2027-participant';
const orderId = '11111111-1111-4111-8111-111111111111';
const stamp = 'a'.repeat(64);
const root = 'projects/circ-test/databases/(default)/documents';
const version = '2026-11-12T23:57:00.000001Z';

test('test archives have a stable UUID bound to the registration and confirmation', () => {
  const id = testRegistrationArchiveId(registrationId, stamp);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(testRegistrationArchiveId(registrationId, stamp), id);
  assert.notEqual(testRegistrationArchiveId(registrationId, 'b'.repeat(64)), id);
  assert.notEqual(testRegistrationArchiveId('circ-2027-another', stamp), id);
});

test('test archive skips transaction endpoints and uses a direct replay lookup', async () => {
  const archiveId = testRegistrationArchiveId(registrationId, stamp);
  const calls = [];
  let archiveExists = false;
  const store = createRegistrationReleaseStore({
    projectId: 'circ-test', token: 'admin-id-token', withoutReadTransaction: true,
    fetchImpl: async (url, options) => {
      const { pathname, search } = new URL(url);
      const body = options.body && JSON.parse(options.body);
      calls.push({ pathname, search, body, method: options.method, authorization: options.headers.Authorization });
      if (pathname.endsWith(':runQuery')) return Response.json([]);
      if (pathname.endsWith(':commit')) return Response.json({});
      if (pathname.endsWith(archiveId) && !archiveExists) return new Response(null, { status: 404 });
      return Response.json({ name: pathname.slice('/v1/'.length), fields: { stamp: { stringValue: stamp } }, updateTime: version });
    },
  });

  const snapshot = await store.begin();
  const registration = await store.readRegistration(registrationId, snapshot);
  assert.equal(registration.version, version);
  await store.related('documents', registrationId, snapshot);
  assert.deepEqual(await store.findArchive(registrationId, stamp, snapshot), []);
  await store.commit({
    registration, archiveId, archivedAt: version, archiveFields: {}, auditFields: {},
    guards: [{ id: 'participant', name: `${root}/users/participant`, version }],
    payments: [{ id: orderId, name: `${root}/payments/${orderId}`, version }],
  });
  archiveExists = true;
  assert.equal((await store.findArchive(registrationId, stamp, snapshot))[0].id, `circ-registration-release-${archiveId}`);
  await store.rollback(snapshot);

  const archivePath = `/v1/${root}/settings/circ-registration-release-${archiveId}`;
  assert.deepEqual(calls.map(call => [call.method, call.pathname]), [
    ['GET', `/v1/${root}/registrations/${registrationId}`],
    ['POST', `/v1/${root}:runQuery`],
    ['GET', archivePath],
    ['POST', `/v1/${root}:commit`],
    ['GET', archivePath],
  ]);
  for (const call of calls) {
    assert.equal(call.search, '');
    assert.equal(call.body?.transaction, undefined);
    assert.equal(call.authorization, 'Bearer admin-id-token');
  }
  const writes = calls[3].body.writes;
  assert.deepEqual(writes.find(write => write.delete), { delete: registration.name, currentDocument: { updateTime: version } });
  assert.deepEqual(writes.find(write => write.verify), { verify: `${root}/users/participant`, currentDocument: { updateTime: version } });
  assert.deepEqual(writes.find(write => `/v1/${write.update?.name}` === archivePath).currentDocument, { exists: false });
});
