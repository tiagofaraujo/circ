import { canonicalizeProfileName, mergeParticipantProfileSources, saveParticipantProfile } from './profileStore';
import { getFirebaseFirestore } from './firebaseClient';

jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));

test('cleared foreign tax and postal fields do not resurrect stale local or legacy billing data', () => {
  const stored = { name: 'International Guest', billingCountry: 'GB', taxNumber: '', billingPostalCode: '', nif: '203821432', postalCode: '3000-001' };
  const stale = { taxNumber: '203821432', billingPostalCode: '3000-001' };
  const result = mergeParticipantProfileSources(stale, stale, stored, { firebaseUid: 'guest', email: 'guest@example.test' });
  expect(result.taxNumber).toBe('');
  expect(result.billingPostalCode).toBe('');
  expect(result.billingCountry).toBe('GB');
});

test('saving cleared optional billing fields explicitly clears their Firestore values', async () => {
  const set = jest.fn().mockResolvedValue(undefined);
  getFirebaseFirestore.mockReturnValue({ collection: () => ({ doc: () => ({ set }) }) });
  const previous = window.firebase;
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } };
  try {
    await saveParticipantProfile({ uid: 'guest', email: 'guest@example.test' }, {
      name: 'International Guest', billingCountry: 'AE', taxNumber: '', billingPostalCode: '',
      nif: '203821432', postalCode: '3000-001',
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ taxNumber: '', billingPostalCode: '', billingCountry: 'AE' }), { merge: true });
  } finally {
    window.firebase = previous;
    localStorage.clear();
  }
});

describe('participant profile name storage', () => {
  test('trims and collapses whitespace before persistence', () => {
    expect(canonicalizeProfileName('  Tiago   Fernando\nConde  de Araújo  '))
      .toBe('Tiago Fernando Conde de Araújo');
  });

  test('returns an empty value for a whitespace-only name', () => {
    expect(canonicalizeProfileName('   \n\t  ')).toBe('');
  });
});


describe('participant profile source priority', () => {
  test('keeps the stored Firestore name when Firebase Auth is stale', () => {
    expect(mergeParticipantProfileSources(
      { name: 'Local Name' },
      { name: 'Cached Name' },
      { name: 'Canonical Firestore Name' },
      {
        firebaseUid: 'participant',
        email: 'current@example.test',
        name: 'Stale Auth Name',
        photoURL: 'https://example.test/avatar.png',
      }
    )).toMatchObject({
      firebaseUid: 'participant',
      email: 'current@example.test',
      name: 'Canonical Firestore Name',
      photoURL: 'https://example.test/avatar.png',
    });
  });

  test('prefers the cached profile to stale Auth data during an outage', () => {
    expect(mergeParticipantProfileSources(
      {},
      { name: 'Cached Firestore Name' },
      {},
      { firebaseUid: 'participant', name: 'Stale Auth Name' }
    )).toMatchObject({
      firebaseUid: 'participant',
      name: 'Cached Firestore Name',
    });
  });
});
