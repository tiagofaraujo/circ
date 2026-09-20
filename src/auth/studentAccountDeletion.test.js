import { deleteParticipantData } from './profileStore';
import { getFirebaseFirestore } from './firebaseClient';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));
test('account deletion removes private proof, request and profile in one batch', async () => {
  const remove = jest.fn();
  const commit = jest.fn().mockResolvedValue();
  getFirebaseFirestore.mockReturnValue({ collection: (name) => ({ doc: (uid) => `${name}/${uid}` }), batch: () => ({ delete: remove, commit }) });
  await deleteParticipantData({ uid: 'student' });
  expect(remove.mock.calls.map(([ref]) => ref)).toEqual(['studentProofs/student', 'studentVerifications/student', 'users/student']);
  expect(commit).toHaveBeenCalledTimes(1);
  commit.mockRejectedValueOnce(new Error('Firestore unavailable'));
  await expect(deleteParticipantData({ uid: 'student' })).rejects.toThrow('Firestore unavailable');
});
