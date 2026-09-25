import { loadHotelOffers } from './hotelOffers';
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn(); });
afterAll(() => { global.fetch = originalFetch; });

test('does not request protected offers without a signed-in user', async () => {
  await expect(loadHotelOffers(null)).rejects.toThrow('sign_in_required');
  expect(fetch).not.toHaveBeenCalled();
});

test('uses an ID token with no-store and refreshes it once after a rejected session', async () => {
  const user = { getIdToken: jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('renewed') };
  fetch.mockResolvedValueOnce({ status: 401, ok: false }).mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ hotels: [{ id: 'fixture' }] }) });
  await expect(loadHotelOffers(user)).resolves.toEqual([{ id: 'fixture' }]);
  expect(user.getIdToken.mock.calls).toEqual([[false], [true]]);
  expect(fetch).toHaveBeenLastCalledWith('/api/accommodation/hotels', expect.objectContaining({ headers: { Authorization: 'Bearer renewed' }, cache: 'no-store' }));
});

test('invalid sessions fail after one refresh without returning hotel data', async () => {
  const user = { getIdToken: jest.fn().mockResolvedValue('rejected') };
  fetch.mockResolvedValue({ status: 401, ok: false });
  await expect(loadHotelOffers(user)).rejects.toThrow('invalid_session');
  expect(fetch).toHaveBeenCalledTimes(2);
});
