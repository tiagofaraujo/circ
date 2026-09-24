import { getFirebaseAuth, getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { confirmCompanyTransfer, createCompanyPurchase, formatVoucher, normalizeVoucher, redeemCompanyVoucher } from './companyVouchers';
jest.mock('./firebaseClient', () => ({ getFirebaseAuth: jest.fn(), getFirebaseFirestore: jest.fn(), isAdminUser: jest.fn() }));
const user = { uid: 'alice', email: 'alice@example.test', emailVerified: true };
const code = 'a'.repeat(32);
let records, tx;
beforeEach(() => {
  jest.clearAllMocks();
  getFirebaseAuth.mockReturnValue({ currentUser: user }); isAdminUser.mockReturnValue(false);
  records = { 'settings/circ-2027-company-vouchers': { enabled: true }, 'users/alice': { name: 'Pessoa Teste' },
    [`companyVouchers/${code}`]: { status: 'available', purchaseId: 'purchase', companyName: 'Empresa Teste', unitAmountCents: 9500 } };
  tx = { get: jest.fn(async (ref) => ({ exists: Boolean(records[ref]), data: () => records[ref] })), set: jest.fn(), update: jest.fn() };
  getFirebaseFirestore.mockReturnValue({ collection: (name) => ({ doc: (id = 'new') => `${name}/${id}` }), runTransaction: async (f) => f(tx) });
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
});
test('normalizes grouped codes without accepting arbitrary document paths', () => {
  expect(normalizeVoucher(formatVoucher(code).toUpperCase())).toBe(code);
  for (const invalid of ['', 'abc', '../admin', 'g'.repeat(32)]) expect(() => normalizeVoucher(invalid)).toThrow('company/invalid-code');
});
test('redemption writes only paid external onsite registration and its consumed code', async () => {
  await expect(redeemCompanyVoucher(code)).resolves.toBe('circ-2027-alice');
  const registration = tx.set.mock.calls[0][1];
  expect(registration).toMatchObject({ status: 'confirmed', isTest: false, companyPurchaseId: 'purchase',
    selection: { profile: 'external', congressMode: 'onsite', dinnerQuantity: 0, morningCourse: false, afternoonCourse: false },
    payment: { amountCents: 0, coveredAmountCents: 9500, status: 'paid', method: 'company_voucher' } });
  expect(tx.update).toHaveBeenCalledWith(`companyVouchers/${code}`, expect.objectContaining({ redeemedBy: 'alice', status: 'redeemed', registrationId: 'circ-2027-alice' }));
});
test('retry after successful redemption does not consume or charge again', async () => {
  records['registrations/circ-2027-alice'] = { voucherId: code };
  await redeemCompanyVoucher(code);
  expect(tx.set).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled();
  records['registrations/circ-2027-alice'] = { voucherId: 'b'.repeat(32) };
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/existing');
});
test('closed or used code and incomplete profile never create an inscription', async () => {
  records['settings/circ-2027-company-vouchers'].enabled = false;
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/closed');
  records['settings/circ-2027-company-vouchers'].enabled = true;
  records[`companyVouchers/${code}`].status = 'cancelled';
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/invalid-code');
  records[`companyVouchers/${code}`].status = 'available'; records['users/alice'].name = '';
  await expect(redeemCompanyVoucher(code)).rejects.toThrow('company/profile'); expect(tx.set).not.toHaveBeenCalled();
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
