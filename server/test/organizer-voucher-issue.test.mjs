import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createOrganizerVoucherIssueApi, createOrganizerVoucherIssueStore } from '../payments/organizer-voucher-issue.mjs';

const origin = 'https://circ.test';
const url = `${origin}/api/admin/registration-management/organizer-vouchers/issue`;
const env = { FIREBASE_PROJECT_ID: 'test-circ' };
const batchId = 'circ-2027-organizers-01';
const codes = Array.from({ length: 9 }, (_, index) => (index + 1).toString(16).padStart(32, '0'));
const hashes = codes.map(code => createHash('sha256').update(code).digest('hex'));
const admin = { sub: 'admin-uid', email: 'circ.chuc@gmail.com', email_verified: true };

function request({ method = 'POST', body = { hashes }, headers = {} } = {}) {
  return new Request(url, { method,
    headers: { Origin: origin, Authorization: 'Bearer session', 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

function fixture({ claims = admin, loseCommitResponse = false } = {}) {
  let batch;
  const commits = [];
  const reads = [];
  const api = createOrganizerVoucherIssueApi({ verify: async () => claims, tokenProvider: async () => 'service',
    now: () => '2026-11-14T12:00:00.000Z', storeFactory: options => createOrganizerVoucherIssueStore({ ...options,
      fetchImpl: async (url, init) => {
        assert.equal(init.headers.Authorization, 'Bearer service');
        if (init.method === 'POST') {
          assert.match(url, /\/documents:commit$/);
          assert.equal(batch, undefined);
          const { writes } = JSON.parse(init.body);
          commits.push(writes);
          batch = writes[0].update;
          if (loseCommitResponse) throw new Error('ambiguous upstream response');
          return Response.json({});
        }
        assert.ok(url.endsWith(`/organizerVoucherBatches/${batchId}`));
        reads.push(url);
        return batch ? Response.json(batch) : new Response(null, { status: 404 });
      },
    }),
  });
  return { api, commits, reads };
}

test('issue one private batch and nine single-use vouchers in the same write using only hashes', async () => {
  const { api, commits } = fixture();
  const before = await api(request({ method: 'GET' }), env);
  assert.deepEqual(await before.json(), { batchId, quantity: 9, issued: false });
  const issued = await api(request(), env);
  assert.equal(issued.status, 200);
  assert.match(issued.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await issued.json(), { batchId, quantity: 9, issued: true, duplicate: false });
  assert.equal(commits.length, 1);
  const [batch, ...vouchers] = commits[0];
  assert.equal(vouchers.length, 9);
  assert.deepEqual(batch.update.fields.hashes.arrayValue.values.map(field => field.stringValue), hashes);
  assert.ok(commits[0].every(write => write.currentDocument.exists === false));
  vouchers.forEach(({ update: { name, fields } }, index) => {
    assert.ok(name.endsWith(`/organizerVouchers/${hashes[index]}`));
    assert.equal(fields.eventId.stringValue, 'circ-2027');
    assert.equal(fields.batchId.stringValue, batchId);
    assert.equal(fields.createdBy.stringValue, admin.sub);
    assert.equal(fields.status.stringValue, 'available');
    assert.equal(fields.index.integerValue, String(index + 1));
  });
  assert.ok(codes.every(code => !JSON.stringify(commits).includes(code)));
  assert.deepEqual(await (await api(request({ method: 'GET' }), env)).json(), { batchId, quantity: 9, issued: true });
});

test('retry the same prepared batch after a lost commit response without creating other vouchers', async () => {
  const { api, commits } = fixture({ loseCommitResponse: true });
  const first = await api(request(), env);
  assert.deepEqual(await first.json(), { batchId, quantity: 9, issued: true, duplicate: true });
  const retry = await api(request(), env);
  assert.deepEqual(await retry.json(), { batchId, quantity: 9, issued: true, duplicate: true });
  const differentBatch = await api(request({ body: { hashes: [...hashes].reverse() } }), env);
  assert.equal(differentBatch.status, 409);
  assert.equal(commits.length, 1);
});

test('refuse non-administrators, other origins, cleartext codes and malformed batches before reading storage', async () => {
  const denied = fixture({ claims: { ...admin, email: 'paulojaneiro77@gmail.com' } });
  assert.equal((await denied.api(request(), env)).status, 403);
  assert.equal(denied.reads.length, 0);
  const unverified = fixture({ claims: { ...admin, email_verified: false } });
  assert.equal((await unverified.api(request(), env)).status, 403);
  assert.equal(unverified.reads.length, 0);
  const { api, reads } = fixture();
  assert.equal((await api(request({ headers: { Authorization: '' } }), env)).status, 401);
  assert.equal((await api(request({ headers: { Origin: 'https://other.test' } }), env)).status, 403);
  for (const body of [{ codes }, { hashes: codes }, { hashes: hashes.slice(1) }, { hashes: Array(9).fill(hashes[0]) }, { hashes, codes }]) {
    assert.equal((await api(request({ body }), env)).status, 400);
  }
  assert.equal(reads.length, 0);
});
