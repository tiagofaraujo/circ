import {
  describeUlsEligibilitySnapshot,
  describeUlsRosterSnapshot,
  isValidUlsRoster,
  ULS_ELIGIBILITY_SNAPSHOT_OPTIONS,
} from './ulsEligibilityStore';

const UID = 'pilot';
const VALID = {
  userId: UID,
  eventId: 'circ-2027',
  status: 'matched',
  method: 'mec-name-match',
  mec: '4206',
  nameKey: 'TIAGO FERNANDO CONDE ARAUJO',
};

function snapshot({ exists, fromCache = false, data = null }) {
  return {
    exists,
    metadata: { fromCache },
    data: () => data,
  };
}

describe('ULS eligibility snapshot state', () => {
  test('listens for metadata-only server confirmation', () => {
    expect(ULS_ELIGIBILITY_SNAPSHOT_OPTIONS).toEqual({ includeMetadataChanges: true });
  });

  test('does not treat a cached miss as confirmed absence', () => {
    expect(describeUlsEligibilitySnapshot(snapshot({
      exists: false,
      fromCache: true,
    }), UID)).toMatchObject({
      status: 'loading',
      verified: false,
      documentExists: false,
      confirmedAbsent: false,
    });
  });

  test('unlocks only after a server-confirmed missing document', () => {
    expect(describeUlsEligibilitySnapshot(snapshot({
      exists: false,
      fromCache: false,
    }), UID)).toMatchObject({
      status: 'ready',
      verified: false,
      documentExists: false,
      confirmedAbsent: true,
    });
  });

  test('keeps an invalid or revoked existing document distinct from absence', () => {
    expect(describeUlsEligibilitySnapshot(snapshot({
      exists: true,
      data: { ...VALID, status: 'revoked' },
    }), UID)).toMatchObject({
      status: 'ready',
      verified: false,
      documentExists: true,
      confirmedAbsent: false,
    });
  });

  test('recognises a valid persisted match', () => {
    expect(describeUlsEligibilitySnapshot(snapshot({
      exists: true,
      data: VALID,
    }), UID)).toMatchObject({
      status: 'ready',
      verified: true,
      documentExists: true,
      confirmedAbsent: false,
      mec: '4206',
    });
  });
});


describe('ULS roster-backed eligibility state', () => {
  const eligibility = describeUlsEligibilitySnapshot(snapshot({
    exists: true,
    data: VALID,
  }), UID);
  const activeRoster = {
    eventId: 'circ-2027',
    active: true,
    nameKey: VALID.nameKey,
  };

  test('confirms a match only from an active server roster snapshot', () => {
    expect(isValidUlsRoster(activeRoster, eligibility)).toBe(true);
    expect(describeUlsRosterSnapshot(snapshot({
      exists: true,
      data: activeRoster,
    }), eligibility)).toMatchObject({
      status: 'ready',
      verified: true,
      revoked: false,
      rosterConfirmed: true,
    });
  });

  test('does not trust a cached roster snapshot', () => {
    expect(describeUlsRosterSnapshot(snapshot({
      exists: true,
      fromCache: true,
      data: activeRoster,
    }), eligibility)).toMatchObject({
      status: 'loading',
      verified: false,
      revoked: false,
      rosterConfirmed: false,
    });
  });

  test.each([
    ['deactivated', { ...activeRoster, active: false }],
    ['identity changed', { ...activeRoster, nameKey: 'OUTRA PESSOA' }],
  ])('marks a %s roster entry as revoked', (_label, roster) => {
    expect(describeUlsRosterSnapshot(snapshot({
      exists: true,
      data: roster,
    }), eligibility)).toMatchObject({
      status: 'ready',
      verified: false,
      revoked: true,
      rosterConfirmed: true,
    });
  });
});
