import { canonicalizeProfileName, mergeParticipantProfileSources } from './profileStore';

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
