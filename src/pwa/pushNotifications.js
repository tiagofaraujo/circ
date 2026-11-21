export function pushSupported() {
  return Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

export function needsHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia('(display-mode: standalone)').matches && navigator.standalone !== true;
}

export function keyBytes(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export async function pushRequest(user, action, body, method = 'POST') {
  const token = await user.getIdToken();
  const response = await fetch(`/api/push/${action}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'push-unavailable');
  return result;
}

export async function loadPushConfig() {
  const response = await fetch('/api/push/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('push-unavailable');
  const config = await response.json();
  if (typeof config.enabled !== 'boolean' || typeof config.testOnly !== 'boolean'
    || (config.enabled && !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey || ''))) throw new Error('push-unavailable');
  return config;
}

export async function currentPushSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration?.pushManager ? registration.pushManager.getSubscription() : null;
}

function waitForWorker(worker, states) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('worker-not-ready')), 15000);
    function changed() {
      if (states.includes(worker.state)) finish();
      else if (worker.state === 'redundant') finish(new Error('worker-not-ready'));
    }
    worker.addEventListener('statechange', changed);
    changed();
  });
}

export async function activatePushWorker(registration) {
  // register()/update() resolve before the install handler (including its cache fetch).
  // Wait for that worker, rather than accidentally using an older active worker.
  const firstInstall = registration.installing;
  if (firstInstall) await waitForWorker(firstInstall, ['installed', 'activated']);
  if (registration.active) await registration.update();
  if (registration.installing) await waitForWorker(registration.installing, ['installed', 'activated']);
  if (registration.waiting) {
    const waiting = registration.waiting;
    const activated = waitForWorker(waiting, ['activated']);
    waiting.postMessage('ACTIVATE_PUSH_WORKER');
    await activated;
  } else if (!registration.active && firstInstall) {
    await waitForWorker(firstInstall, ['activated']);
  }
  if (!registration.active) throw new Error('worker-not-ready');
  await waitForWorker(registration.active, ['activated']);
}

export async function enablePush(user, publicKey, locale, permission) {
  // The permission promise is created synchronously by the click handler for Safari.
  if (await permission !== 'granted') throw new Error('permission-not-granted');
  const registration = await navigator.serviceWorker.register('/my-circ-sw.js', { updateViaCache: 'none' });
  await activatePushWorker(registration);
  let subscription = await registration.pushManager.getSubscription();
  const key = keyBytes(publicKey);
  const oldKey = subscription?.options?.applicationServerKey;
  if (subscription && (!oldKey || Array.from(new Uint8Array(oldKey)).join() !== Array.from(key).join())) {
    await pushRequest(user, 'subscriptions', { endpoint: subscription.endpoint }, 'DELETE');
    if (!await subscription.unsubscribe()) throw new Error('unsubscribe-failed');
    subscription = null;
  }
  const created = !subscription;
  if (created) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    await pushRequest(user, 'subscriptions', { subscription: subscription.toJSON(), locale, consent: true });
  } catch (error) {
    // Never leave a new browser subscription looking enabled after a failed save.
    if (created) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return subscription;
}

export async function disablePush(user) {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  // Stop delivery on this device first, including if the server is temporarily offline.
  if (!await subscription.unsubscribe()) throw new Error('unsubscribe-failed');
  await pushRequest(user, 'subscriptions', { endpoint: subscription.endpoint }, 'DELETE');
}
