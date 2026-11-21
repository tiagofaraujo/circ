import { activatePushWorker, disablePush, enablePush } from './pushNotifications';

function worker(state) {
  const listeners = new Set();
  return { state, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    postMessage: jest.fn(), move(next) { this.state = next; for (const fn of [...listeners]) fn(); } };
}
const tick = () => Promise.resolve();
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('an update which is still installing cannot use the previous active worker', async () => {
  const previous = worker('activated'), replacement = worker('installing');
  const registration = { active: previous, installing: null, waiting: null,
    update: jest.fn(async () => { registration.installing = replacement; }) };
  let done = false;
  const pending = activatePushWorker(registration).then(() => { done = true; });
  await tick(); await tick();
  expect(done).toBe(false);
  registration.installing = null; registration.waiting = replacement;
  replacement.move('installed'); await tick();
  expect(replacement.postMessage).toHaveBeenCalledWith('ACTIVATE_PUSH_WORKER');
  expect(done).toBe(false);
  registration.waiting = null; registration.active = replacement;
  replacement.move('activated'); await pending;
  expect(done).toBe(true);
});

test('first-time installation waits for activation without an old active worker', async () => {
  const first = worker('installing');
  const registration = { active: null, installing: first, waiting: null, update: jest.fn() };
  let done = false;
  const pending = activatePushWorker(registration).then(() => { done = true; });
  first.move('installed'); await tick(); expect(done).toBe(false);
  registration.installing = null; registration.active = first; first.move('activated');
  await pending; expect(done).toBe(true);
  expect(registration.update).not.toHaveBeenCalled();
});

test('a failed worker installation cannot be reported as ready', async () => {
  const broken = worker('installing');
  const pending = activatePushWorker({ installing: broken });
  broken.move('redundant');
  await expect(pending).rejects.toThrow('worker-not-ready');
});

test('denied permission never registers a worker or a subscription', async () => {
  const register = jest.fn();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
  await expect(enablePush({}, 'key', 'pt', Promise.resolve('denied'))).rejects.toThrow('permission-not-granted');
  expect(register).not.toHaveBeenCalled();
});

test('unsubscribe stops browser delivery before attempting a remote delete', async () => {
  const unsubscribe = jest.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({
    pushManager: { getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/id', unsubscribe }) },
  }) } });
  const user = { getIdToken: async () => { expect(unsubscribe).toHaveBeenCalledTimes(1); throw new Error('offline'); } };
  await expect(disablePush(user)).rejects.toThrow('offline');
});
