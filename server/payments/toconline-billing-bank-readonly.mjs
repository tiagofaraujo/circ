import { proposedBankAccount } from './bank-transfer-account.mjs';

// Discovery only. Does not assign bank_account_id, change a rehearsal, or write to a provider.
// The sales API documents company_bank_accounts, not the generic bank_accounts resource.
const SOURCE = 'company_bank_accounts';
const normalise = value => typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : '';
const validIbanShape = value => /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value);
const validId = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));

export async function readBillingBankAccount(providerGet, configuredIban = proposedBankAccount.iban) {
  const expected = normalise(configuredIban);
  const base = {
    source: SOURCE,
    mode: 'read-only',
    commercialWritesEnabled: false,
    assignedToRehearsal: false,
    account: null,
    expectedIbanLast4: validIbanShape(expected) ? expected.slice(-4) : null,
  };
  const result = (status, ok = true, extra = {}) => ({ ...base, ok, status, ...extra });
  if (!validIbanShape(expected)) return result('invalid-configuration', false);
  let rows;
  try {
    // page size 2 is deliberate: multiple filtered results must never pick the first account.
    const query = new URLSearchParams({ 'filter[iban]': expected, 'page[size]': '2' });
    rows = await providerGet(`${SOURCE}?${query.toString()}`);
  } catch (error) {
    // Keep the existing OAuth refresh behaviour in the enclosing read-only API.
    if (error?.code === 'toconline-api-unauthorized') throw error;
    return result('unavailable', false, {
      httpStatus: Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : null,
    });
  }
  if (!Array.isArray(rows)) return result('invalid-response', false);
  if (!rows.length) return result('not-found');
  if (rows.length !== 1) return result('ambiguous');
  const row = rows[0];
  if (!row || !validId(row.id) || !row.attributes || typeof row.attributes !== 'object') return result('invalid-response', false);
  const returnedIban = normalise(row.attributes.iban);
  if (!validIbanShape(returnedIban) || returnedIban !== expected) return result('iban-mismatch');
  if (row.attributes.is_active === false) return result('inactive');
  // is_connected is not a requirement: Open Banking is separate from company account identification.
  // No account names or full IBAN are added to this diagnostic response.
  return result('matched', true, { account: { id: row.id, ibanLast4: returnedIban.slice(-4) } });
}
