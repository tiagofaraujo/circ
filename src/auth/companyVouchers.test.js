import { getFirebaseAuth, getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { companyError, confirmCompanyTransfer, createCompanyPurchase, formatVoucher, normalizeVoucher, redeemCompanyVoucher } from './companyVouchers';
jest.mock('./firebaseClient', () => ({ getFirebaseAuth: jest.fn(), getFirebaseFirestore: jest.fn(), isAdminUser: jest.fn() }));
const user = { uid: 'alice', email: 'alice@example.test', emailVerified: true, getIdToken: jest.fn(async () => 'verified-token') };
const code = 'a'.repeat(32);
let records, tx;
beforeEach(() => {
  jest.clearAllMocks();
  user.getIdToken.mockResolvedValue('verified-token');
  getFirebaseAuth.mockReturnValue({ currentUser: user }); isAdminUser.mockReturnValue(false);
  records = { 'settings/circ-2027-company-vouchers': { enabled: true }, 'users/alice': { name: 'Pessoa Teste' },
    [`companyVouchers/${code}`]: { status: 'available', purchaseId: 'purchase', companyName: 'Empresa Teste', unitAmountCents: 9500 } };
  tx = { get: jest.fn(async (ref) => ({ exists: Boolean(records[ref]), data: () => records[ref] })), set: jest.fn(), update: jest.fn() };
  getFirebaseFirestore.mockReturnValue({ collection: (name) => ({ doc: (id = 'new') => `${name}/${id}` }), runTransaction: async (f) => f(tx) });
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ registrationId: 'circ-2027-alice', duplicate: false }) }));
});
test('normalizes grouped codes without accepting arbitrary document paths', () => {
  expect(normalizeVoucher(formatVoucher(code).toUpperCase())).toBe(code);
  for (const invalid of ['', 'abc', '../admin', 'g'.repeat(32)]) expect(() => normalizeVoucher(invalid)).toThrow('company/invalid-code');
});
test('redemption sends only the normalized code to the authenticated server and never writes Firestore', async () => {
  await expect(redeemCompanyVoucher(formatVoucher(code).toUpperCase())).resolves.toBe('circ-2027-alice');
  expect(fetch).toHaveBeenCalledWith('/api/checkout/live/company-voucher/redeem', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Authorization: 'Bearer verified-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  expect(tx.set).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled();
});
test('server recognizes retries and a failed response is not automatically posted again', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ registrationId: 'circ-2027-alice', duplicate: true }) });
  await expect(redeemCompanyVoucher(code)).resolves.toBe('circ-2027-alice');
  fetch.mockRejectedValueOnce(new Error('response lost'));
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/unavailable');
  expect(fetch).toHaveBeenCalledTimes(2); expect(tx.set).not.toHaveBeenCalled();
});
test('capacity, profile and eligibility rejections are provided by the server', async () => {
  for (const error of ['company/capacity-full', 'company/closed', 'company/invalid-code', 'company/profile', 'company/existing']) {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error }) });
    await expect(redeemCompanyVoucher(code)).rejects.toThrow(error);
  }
  expect(companyError(new Error('company/capacity-full'))).toMatch(/lotação.*esgotada/);
  expect(tx.set).not.toHaveBeenCalled();
});
test('unverified identity, invalid codes and malformed server replies fail without a client write', async () => {
  getFirebaseAuth.mockReturnValueOnce({ currentUser: { ...user, emailVerified: false } });
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/auth');
  await expect(redeemCompanyVoucher('../invalid')).rejects.toThrow('company/invalid-code'); expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ registrationId: 'circ-2027-another', duplicate: false }) });
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/unavailable');
  fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('html'); } });
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/unavailable');
  expect(tx.set).not.toHaveBeenCalled();
});
test('only administrators can record purchases or confirm transfers', async () => {
  await expect(createCompanyPurchase({})).rejects.toThrow('company/auth');
  await expect(confirmCompanyTransfer('id', 'bank-ref')).rejects.toThrow('company/auth');
  expect(tx.set).not.toHaveBeenCalled();
});
test('confirmed purchases cannot issue a second set of codes', async () => {
  isAdminUser.mockReturnValue(true); records['companyPurchases/id'] = { status: 'paid' };
  await expect(confirmCompanyTransfer('id', 'bank-ref')).rejects.toThrow('company/conflict');
  expect(tx.update).not.toHaveBeenCalled();
});
