import { getFirebaseFirestore } from './firebaseClient';
import { subscribeToRegistrations, subscribeToRegistrationPayments } from './adminStore';

jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));

function queryWith(documents) {
  const stop = jest.fn();
  const query = { where: jest.fn(), onSnapshot: jest.fn(), orderBy: jest.fn(), limit: jest.fn() };
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.onSnapshot.mockImplementation(onData => { onData({ docs: documents.map(({ id, ...data }) => ({ id, data: () => data })) }); return stop; });
  getFirebaseFirestore.mockReturnValue({ collection: jest.fn(() => query) });
  return { query, stop };
}

afterEach(() => jest.clearAllMocks());

test('loads every registration beyond 500, including missing timestamps, sorted without server ordering or limits', () => {
  const documents = Array.from({ length: 600 }, (_, index) => ({ id: `r-${index}`, eventId: 'circ-2027', createdAt: `2026-11-${String(index % 5 + 1).padStart(2, '0')}` }));
  documents.push({ id: 'without-date', eventId: 'circ-2027' });
  const { query, stop } = queryWith(documents);
  const onData = jest.fn();
  expect(subscribeToRegistrations(onData, jest.fn())).toBe(stop);
  const loaded = onData.mock.calls[0][0];
  expect(loaded).toHaveLength(601);
  expect(loaded.at(-1).id).toBe('without-date');
  expect(loaded[0].createdAt).toBe('2026-11-05');
  expect(query.where).toHaveBeenCalledWith('eventId', '==', 'circ-2027');
  expect(query.orderBy).not.toHaveBeenCalled();
  expect(query.limit).not.toHaveBeenCalled();
});

test('hides tests and archived rows from management but preserves real historical rows for explicit review', () => {
  queryWith([{ id: 'real' }, { id: 'test', isTest: true }, { id: 'mode', testMode: true },
    { id: 'archive', archived: true }, { id: 'released', registrationArchiveId: 'archive' },
    { id: 'released-date', registrationArchivedAt: '2026-11-01' }]);
  const onData = jest.fn();
  subscribeToRegistrations(onData, jest.fn());
  expect(onData.mock.calls[0][0].map(item => item.id)).toEqual(['real']);
});

test('the actual Firestore document ID overrides a stored id for canonical statistics', () => {
  const query = { where: jest.fn(), onSnapshot: jest.fn() };
  query.where.mockReturnValue(query);
  query.onSnapshot.mockImplementation(onData => onData({ docs: [{ id: 'actual-id', data: () => ({ id: 'forged-id' }) }] }));
  getFirebaseFirestore.mockReturnValue({ collection: () => query });
  const onData = jest.fn();
  subscribeToRegistrations(onData, jest.fn());
  expect(onData.mock.calls[0][0][0].id).toBe('actual-id');
});

test('loads production payment details with no truncation and removes archived or sandbox orders', () => {
  const { query, stop } = queryWith([{ id: 'real', environment: 'production' },
    { id: 'sandbox', environment: 'sandbox' }, { id: 'test', environment: 'production', isTest: true },
    { id: 'archive', environment: 'production', registrationArchiveId: 'archive' },
    { id: 'released-date', environment: 'production', registrationArchivedAt: '2026-11-01' }]);
  const onData = jest.fn();
  expect(subscribeToRegistrationPayments(onData, jest.fn())).toBe(stop);
  expect(onData.mock.calls[0][0].map(item => item.id)).toEqual(['real']);
  expect(query.where).toHaveBeenCalledWith('eventId', '==', 'circ-2027');
  expect(query.limit).not.toHaveBeenCalled();
});

test.each([subscribeToRegistrations, subscribeToRegistrationPayments])('reports missing Firebase through subscription error and returns a safe cleanup', subscribe => {
  getFirebaseFirestore.mockReturnValue(null);
  const onError = jest.fn();
  expect(subscribe(jest.fn(), onError)).toEqual(expect.any(Function));
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'firestore/not-configured' }));
});
