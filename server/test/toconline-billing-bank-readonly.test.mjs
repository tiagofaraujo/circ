import test from 'node:test';
import assert from 'node:assert/strict';
import { readBillingBankAccount } from '../payments/toconline-billing-bank-readonly.mjs';

// Synthetic identifiers only; these tests never call a provider.
const IBAN = 'PT50000000000000000001905';
const row = (id = '77', iban = IBAN) => ({ id, type: 'company_bank_accounts', attributes: { iban, name: 'Synthetic account', is_connected: false } });

test('queries exactly the documented filtered resource and keeps the returned ID, not assumed ID 2', async () => {
  const calls = [];
  const found = await readBillingBankAccount(async resource => { calls.push(resource); return [row()]; }, IBAN);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0], 'https://example.test/api/');
  assert.equal(url.pathname, '/api/company_bank_accounts');
  assert.equal(url.searchParams.get('filter[iban]'), IBAN);
  assert.equal(url.searchParams.get('page[size]'), '2');
  assert.equal(found.status, 'matched');
  assert.deepEqual(found.account, { id: '77', ibanLast4: '1905' });
  assert.equal(found.commercialWritesEnabled, false);
  assert.equal(found.assignedToRehearsal, false);
  assert.ok(!JSON.stringify(found).includes(IBAN));
  assert.ok(!JSON.stringify(found).includes('Synthetic account'));
});

test('normalises spaces/case but compares the entire IBAN, not merely its last four digits', async () => {
  const formatted = IBAN.toLowerCase().match(/.{1,4}/g).join(' ');
  assert.equal((await readBillingBankAccount(async () => [row('77', formatted)], IBAN)).status, 'matched');
  const mismatch = await readBillingBankAccount(async () => [row('77', 'PT50000100000000000001905')], IBAN);
  assert.equal(mismatch.status, 'iban-mismatch');
  assert.equal(mismatch.account, null);
});

test('empty, multiple and malformed results never confirm a company account', async () => {
  for (const [rows, expected] of [
    [[], 'not-found'], [[row(), row('88')], 'ambiguous'], [null, 'invalid-response'],
    [[row('0')], 'invalid-response'], [[row('bad')], 'invalid-response'],
    [[{ id: '77' }], 'invalid-response'], [[row('77', '')], 'iban-mismatch'],
  ]) {
    const check = await readBillingBankAccount(async () => rows, IBAN);
    assert.equal(check.status, expected); assert.equal(check.account, null);
    assert.equal(check.commercialWritesEnabled, false); assert.equal(check.assignedToRehearsal, false);
  }
});

test('explicit inactive account fails; an unconnected Open Banking account can still match', async () => {
  const inactive = row(); inactive.attributes.is_active = false;
  assert.equal((await readBillingBankAccount(async () => [inactive], IBAN)).status, 'inactive');
  assert.equal((await readBillingBankAccount(async () => [row()], IBAN)).status, 'matched');
});

test('failures never fall back to generic bank_accounts and never echo credential-bearing errors', async () => {
  let calls = 0;
  const failed = await readBillingBankAccount(async () => { calls++; throw Object.assign(new Error('private token and IBAN'), { status: 404 }); }, IBAN);
  assert.equal(calls, 1); assert.equal(failed.status, 'unavailable'); assert.equal(failed.httpStatus, 404);
  assert.equal(failed.account, null); assert.ok(!JSON.stringify(failed).includes('private token'));
  await assert.rejects(readBillingBankAccount(async () => { throw Object.assign(new Error('unauthorized'), { code: 'toconline-api-unauthorized', status: 401 }); }, IBAN), { code: 'toconline-api-unauthorized' });
});

test('invalid server configuration causes no request', async () => {
  let calls = 0;
  const check = await readBillingBankAccount(async () => { calls++; return [row()]; }, '');
  assert.equal(calls, 0); assert.equal(check.status, 'invalid-configuration');
});
