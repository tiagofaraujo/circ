import {
  describeUlsEligibilitySnapshot,
  ULS_ELIGIBILITY_SNAPSHOT_OPTIONS,
} from './ulsEligibilityStore';

const UID = 'pilot';
const VALID = {
  userId: UID,
  eventId: 'circ-2027',
  status: 'matched',
  method: 'mec-name-match',
  mec: '4206',
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
