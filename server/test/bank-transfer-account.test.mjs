import test from 'node:test';
import assert from 'node:assert/strict';
import { proposedBankAccount, sandboxBankAccount } from '../payments/bank-transfer-account.mjs';

test('records the organiser-supplied holder and IBAN without enabling payments', () => {
  assert.equal(proposedBankAccount.beneficiary, 'Associação Hemisfério Disciplinado');
  assert.equal(proposedBankAccount.iban, 'PT50003300004567422451905');
  assert.equal(proposedBankAccount.status, 'awaiting_activation');
  assert.equal(proposedBankAccount.enabled, false);
  assert.equal(Object.isFrozen(proposedBankAccount), true);
});
test('sandbox exposes the holder name but never the real bank destination', () => {
  const account = sandboxBankAccount();
  assert.deepEqual(account, { environment: 'sandbox', enabled: false, iban: null,
    beneficiary: 'Associação Hemisfério Disciplinado', setupStatus: 'awaiting_activation' });
  assert.ok(!JSON.stringify(account).includes(proposedBankAccount.iban));
});
test('caller arguments cannot activate the sandbox account or reveal its IBAN', () => {
  const account = sandboxBankAccount({ environment: 'production', enabled: true, status: 'approved' });
  assert.equal(account.iban, null); assert.equal(account.environment, 'sandbox'); assert.equal(account.enabled, false);
});
test('mutating a response does not change the stored account or later responses', () => {
  const result = sandboxBankAccount(); result.enabled = true; result.iban = 'changed'; result.beneficiary = 'changed';
  assert.equal(sandboxBankAccount().enabled, false); assert.equal(sandboxBankAccount().iban, null);
  assert.equal(sandboxBankAccount().beneficiary, 'Associação Hemisfério Disciplinado');
  assert.equal(proposedBankAccount.enabled, false);
});
