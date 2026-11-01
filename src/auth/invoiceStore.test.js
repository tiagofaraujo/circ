import { subscribeToRegistrationInvoices, downloadRegistrationInvoice } from './invoiceStore';
import { getFirebaseFirestore } from './firebaseClient';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));
const id = '649d2dbd-6125-4212-bfa8-22035a3a55e7';
const invoice = { id, userId: 'user', registrationId: 'circ-2027-user', eventId: 'circ-2027', environment: 'production',
  provider: 'toconline', type: 'invoice_receipt', status: 'issued', issuedAt: '2026-11-01', providerDocumentId: 321, providerDocumentNo: 'FR CIRC2027/1' };
afterEach(() => { jest.restoreAllMocks(); });
test('the owner-scoped subscription excludes tests, other registrations and unfinished jobs', () => {
  const docs = [invoice, { ...invoice, registrationId: 'other' }, { ...invoice, environment: 'sandbox' },
    { ...invoice, status: 'outcome_unknown' }, { ...invoice, userId: 'other' }].map((data, index) => ({ id: index === 0 ? id : String(index), data: () => data }));
  const where = jest.fn(() => ({ onSnapshot: callback => { callback({ docs }); return () => {}; } }));
  getFirebaseFirestore.mockReturnValue({ collection: () => ({ where }) });
  const onData = jest.fn();
  subscribeToRegistrationInvoices({ uid: 'user' }, 'circ-2027-user', onData, jest.fn());
  expect(where).toHaveBeenCalledWith('userId', '==', 'user'); expect(onData).toHaveBeenCalledWith([invoice]);
});
test('a foreign registration cannot start a subscription', () => {
  const collection = jest.fn(); getFirebaseFirestore.mockReturnValue({ collection });
  const onError = jest.fn(); subscribeToRegistrationInvoices({ uid: 'user' }, 'circ-2027-other', jest.fn(), onError);
  expect(onError).toHaveBeenCalled(); expect(collection).not.toHaveBeenCalled();
});
test('the PDF request uses a bearer header and never puts credentials into a URL', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, headers: new Headers() }));
  await expect(downloadRegistrationInvoice({ uid: 'user', getIdToken: async () => 'private-token' }, invoice)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledWith(`/api/checkout/live/orders/${id}/invoice.pdf`, expect.objectContaining({
    method: 'GET', headers: { Authorization: 'Bearer private-token' }, cache: 'no-store',
  }));
  expect(fetch.mock.calls[0][0]).not.toContain('private-token');
});
