import { useCallback, useEffect, useRef, useState } from 'react';

const resources = ['onsite', 'morningCourse', 'afternoonCourse'];
const empty = (uid, status) => ({ uid, status, limits: null, paid: null, remaining: null });

function readCapacity(value) {
  if (!value || !resources.every(key => Number.isSafeInteger(value.limits?.[key]) && value.limits[key] > 0
    && Number.isSafeInteger(value.paid?.[key]) && value.paid[key] >= 0
    && Number.isSafeInteger(value.remaining?.[key]) && value.remaining[key] >= 0
    && value.remaining[key] <= value.limits[key]
    && value.remaining[key] === Math.max(0, value.limits[key] - value.paid[key]))) return null;
  return Object.fromEntries(['limits', 'paid', 'remaining'].map(group => [group,
    Object.fromEntries(resources.map(key => [key, value[group][key]]))]));
}

export function useRegistrationCapacity(user, enabled = true) {
  const uid = user?.uid || null;
  const readable = Boolean(enabled && uid && typeof user?.getIdToken === 'function');
  const current = useRef(null);
  const [state, setState] = useState(() => empty(null, 'idle'));

  const read = useCallback(function readScope(scope) {
    if (!scope?.active) return Promise.resolve();
    if (scope.busy) return scope.pending || Promise.resolve();
    scope.busy = true;
    const controller = new AbortController();
    scope.controller = controller;
    setState(empty(scope.uid, 'loading'));
    const pending = (async () => {
      try {
        const token = await scope.user.getIdToken();
        if (!scope.active || current.current !== scope) return;
        const response = await fetch('/api/checkout/live/capacity', {
          method: 'GET', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('capacity-unavailable');
        const capacity = readCapacity(await response.json());
        if (!capacity) throw new Error('invalid-capacity');
        if (scope.active && current.current === scope) setState({ uid: scope.uid, status: 'ready', ...capacity });
      } catch (_) {
        if (scope.active && current.current === scope) setState(empty(scope.uid, 'error'));
      } finally {
        if (scope.active && current.current === scope) {
          scope.busy = false; scope.pending = null;
          const queued = scope.queued;
          if (queued && !queued.started) {
            queued.started = true;
            const finish = () => { queued.resolve(); if (scope.queued === queued) scope.queued = null; };
            readScope(scope).then(finish, finish);
          }
        }
      }
    })();
    scope.pending = pending;
    return pending;
  }, []);

  const refresh = useCallback(() => {
    const scope = current.current;
    if (!readable || !scope?.active || scope.uid !== uid) return Promise.resolve();
    if (scope.busy) {
      if (!scope.queued) {
        const queued = { started: false };
        queued.promise = new Promise(resolve => { queued.resolve = resolve; });
        scope.queued = queued;
      }
      return scope.queued.promise;
    }
    return read(scope);
  }, [read, readable, uid]);

  useEffect(() => {
    if (!readable) { setState(empty(null, 'idle')); return undefined; }
    const scope = { uid, user, active: true, busy: false, pending: null, queued: null, controller: null };
    current.current = scope;
    read(scope);
    const focus = () => read(scope);
    window.addEventListener('focus', focus);
    return () => {
      scope.active = false;
      scope.queued?.resolve();
      scope.queued = null;
      scope.controller?.abort();
      window.removeEventListener('focus', focus);
      if (current.current === scope) current.current = null;
    };
    // Each authenticated account owns its reads and focus listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, readable, read]);

  return { ...(!readable ? empty(uid, 'idle') : state.uid === uid ? state : empty(uid, 'loading')), refresh };
}
