import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createOrganizationDiscountVoucherAdminApi, createOrganizationDiscountVoucherAdminStore } from '../payments/organization-discount-voucher-admin.mjs';

const origin = 'https://circ.test';
const url = `${origin}/api/admin/registration-management/discount-vouchers`;
const env = { FIREBASE_PROJECT_ID: 'test-circ' };
const admin = { sub: 'admin-uid', email: 'circ.chuc@gmail.com', email_verified: true };
const terms = { batchId: '12345678-abcd-4000-a000-123456789abc', label: 'Parceiros científicos', count: 2, discount: { type: 'fixed', value: 1750 } };
const legacyTerms = { ...terms, discount: { type: 'percentage', value: 1250 } };
const legacyCodes = ['d'.repeat(32), 'e'.repeat(32)];

function request({ body = terms, method = 'POST', headers = {}, query = '' } = {}) {
  return new Request(url + query, { method,
    headers: { Origin: origin, Authorization: 'Bearer session', 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

function fixture({ claims = admin, loseCommitResponse = false, withLegacyBatch = false } = {}) {
  const batches = new Map();
  if (withLegacyBatch) {
    const name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/organizationDiscountVoucherBatches/${legacyTerms.batchId}`;
    batches.set(name, { name, fields: {
      eventId: { stringValue: 'circ-2027' }, label: { stringValue: legacyTerms.label },
      count: { integerValue: String(legacyTerms.count) }, createdAt: { stringValue: '2026-11-15T12:00:00.000Z' },
      discount: { mapValue: { fields: { type: { stringValue: legacyTerms.discount.type }, value: { integerValue: String(legacyTerms.discount.value) } } } },
      codes: { arrayValue: { values: legacyCodes.map(stringValue => ({ stringValue })) } },
    } });
  }
  const commits = [];
  const reads = [];
  const api = createOrganizationDiscountVoucherAdminApi({ verify: async () => claims, tokenProvider: async () => 'service',
    now: () => '2026-11-15T12:00:00.000Z', storeFactory: options => createOrganizationDiscountVoucherAdminStore({ ...options,
      fetchImpl: async (url, init) => {
        assert.equal(init.headers.Authorization, 'Bearer service');
        if (init.method === 'POST') {
          assert.match(url, /\/documents:commit$/);
          const { writes } = JSON.parse(init.body);
          commits.push(writes);
          const manifest = writes[0].update;
          assert.ok(!batches.has(manifest.name));
          batches.set(manifest.name, manifest);
          if (loseCommitResponse) throw new Error('ambiguous upstream response');
          return Response.json({});
        }
        assert.match(url, /\/organizationDiscountVoucherBatches\//);
        reads.push(url);
        const manifest = batches.get(url.split('/v1/')[1]);
        return manifest ? Response.json(manifest) : new Response(null, { status: 404 });
      },
    }),
  });
  return { api, commits, reads };
}

test('issues fixed vouchers in an atomic batch and limits plaintext to the private manifest', async () => {
  const { api, commits } = fixture();
  const query = `?batchId=${terms.batchId}`;
  assert.equal((await api(request({ method: 'GET', query }), env)).status, 404);
  const created = await api(request(), env);
  assert.equal(created.status, 201);
  assert.match(created.headers.get('Cache-Control'), /private, no-store/);
  const batch = await created.json();
  assert.equal(batch.count, 2);
  assert.equal(batch.label, terms.label);
  assert.equal(batch.batchId, terms.batchId);
  assert.deepEqual(batch.discount, terms.discount);
  assert.equal(batch.audience, undefined);
  assert.match(batch.codes[0], /^CIRC27-D-(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/);
  assert.equal(new Set(batch.codes).size, 2);
  const [manifest, ...vouchers] = commits[0];
  const rawCodes = batch.codes.map(code => code.replace(/^CIRC27-D-/, '').replaceAll('-', ''));
  assert.ok(manifest.update.name.endsWith(`/organizationDiscountVoucherBatches/${batch.batchId}`));
  assert.deepEqual(manifest.update.fields.codes.arrayValue.values.map(field => field.stringValue), rawCodes);
  assert.ok(commits[0].every(write => write.currentDocument.exists === false));
  vouchers.forEach(({ update: { name, fields } }, index) => {
    const hash = createHash('sha256').update(rawCodes[index]).digest('hex');
    assert.ok(name.endsWith(`/organizationDiscountVouchers/${hash}`));
    assert.equal(fields.batchId.stringValue, batch.batchId);
    assert.equal(fields.status.stringValue, 'available');
    assert.equal(fields.discount.mapValue.fields.type.stringValue, 'fixed');
    assert.equal(fields.discount.mapValue.fields.value.integerValue, '1750');
    assert.ok(rawCodes.every(code => !JSON.stringify(fields).includes(code)));
  });
  assert.deepEqual(await (await api(request({ method: 'GET', query }), env)).json(), batch);

  assert.equal(commits.length, 1);
});

test('rejects new percentage batches and keeps retrieval and identical retries of issued percentage batches', async () => {
  const newBatch = fixture();
  const blocked = await newBatch.api(request({ body: legacyTerms }), env);
  assert.equal(blocked.status, 409);
  assert.deepEqual(await blocked.json(), { error: 'fixed-discount-required' });
  assert.equal(newBatch.commits.length, 0);

  const { api, commits } = fixture({ withLegacyBatch: true });
  const query = `?batchId=${legacyTerms.batchId}`;
  const retrieved = await api(request({ method: 'GET', query }), env);
  const retried = await api(request({ body: legacyTerms }), env);
  assert.equal(retrieved.status, 200);
  assert.equal(retried.status, 200);
  const previous = await retrieved.json();
  assert.deepEqual(await retried.json(), previous);
  assert.deepEqual(previous.discount, legacyTerms.discount);
  assert.deepEqual(previous.codes.map(code => code.replace(/^CIRC27-D-/, '').replaceAll('-', '')), legacyCodes);
  assert.equal((await api(request(), env)).status, 409);
  assert.equal(commits.length, 0);
});

test('issues nine 55 euro vouchers with ULS onsite eligibility on each voucher and the recoverable batch', async () => {
  const { api, commits } = fixture();
  const organizerTerms = { ...terms, label: 'Organizadores · CIRC 2027', count: 9,
    discount: { type: 'fixed', value: 5500 }, audience: 'uls-onsite' };
  const created = await api(request({ body: organizerTerms }), env);
  assert.equal(created.status, 201);
  const batch = await created.json();
  assert.equal(batch.audience, organizerTerms.audience);
  assert.equal(new Set(batch.codes).size, 9);
  assert.equal(commits[0].length, 10);
  assert.ok(commits[0].every(({ update: { fields } }) => fields.audience.stringValue === 'uls-onsite'
    && fields.discount.mapValue.fields.value.integerValue === '5500'));
  assert.deepEqual(await (await api(request({ method: 'GET', query: `?batchId=${terms.batchId}` }), env)).json(), batch);

  const { audience, ...unrestricted } = organizerTerms;
  assert.equal((await api(request({ body: unrestricted }), env)).status, 409);
  assert.equal(commits.length, 1);
});

test('recovers the same codes when a commit response is lost and refuses to overwrite a batch', async () => {
  const { api, commits } = fixture({ loseCommitResponse: true });
  const first = await api(request(), env);
  assert.equal(first.status, 200);
  const retry = await api(request(), env);
  assert.deepEqual(await retry.json(), await first.json());
  const conflicting = await api(request({ body: { ...terms, discount: { type: 'percentage', value: 1500 } } }), env);
  assert.equal(conflicting.status, 409);
  assert.equal(commits.length, 1);
});

test('rejects unprivileged callers and invalid discount inputs before accessing Firestore', async () => {
  for (const claims of [{ ...admin, email_verified: false }, { ...admin, email: 'viewer@circ.test' }]) {
    const { api, reads } = fixture({ claims });
    assert.equal((await api(request(), env)).status, 403);
    assert.equal((await api(request({ method: 'GET', query: `?batchId=${terms.batchId}` }), env)).status, 403);
    assert.equal(reads.length, 0);
  }
  const { api, reads } = fixture();
  assert.equal((await api(request({ headers: { Origin: 'https://other.test' } }), env)).status, 403);
  assert.equal((await api(request({ headers: { Authorization: '' } }), env)).status, 401);
  for (const invalidTerms of [{ count: 51 }, { batchId: '../elsewhere' }, { label: '\u0000' }, { audience: 'uls' }, { audience: null },
    { discount: { type: 'percentage', value: 10000 } }, { discount: { type: 'fixed', value: 0 } },
    { discount: { type: 'fixed', value: 1.25 } }, { discount: { type: 'constructor', value: 50 } }]) {
    assert.equal((await api(request({ body: { ...terms, ...invalidTerms } }), env)).status, 400);
  }
  assert.equal(reads.length, 0);
});
