import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_MS = 60 * 1000;
const empty = (uid, status) => ({ uid, status, registrations: [], payments: [], generatedAt: null, refreshing: false });

function readReport(data) {
  if (!data || !Array.isArray(data.registrations) || !Array.isArray(data.payments)
    || ![...data.registrations, ...data.payments].every(item => item && typeof item === 'object'
      && !Array.isArray(item) && typeof item.id === 'string' && item.id.length > 0)) return null;
  return { registrations: data.registrations, payments: data.payments,
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : null };
}

/** The report is the only cross-participant data source for a consultation account. */
export function useRegistrationReport(user, enabled = false) {
  const uid = user?.uid || null;
  const readable = Boolean(enabled && uid && typeof user?.getIdToken === 'function');
  const current = useRef(null);
  const [state, setState] = useState(() => empty(null, 'idle'));

  const read = useCallback(async scope => {
    if (!scope?.active || scope.busy) return;
    scope.busy = true;
    const controller = new AbortController();
    scope.controller = controller;
    setState(previous => previous.uid === scope.uid && previous.status === 'ready'
      ? { ...previous, refreshing: true }
      : { ...empty(scope.uid, 'loading'), refreshing: true });
    try {
      const token = await scope.user.getIdToken();
      if (!scope.active || current.current !== scope) return;
      const response = await fetch('/api/admin/registrations/report', {
        method: 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('report-unavailable');
      const report = readReport(await response.json());
      if (!report) throw new Error('invalid-report');
      if (scope.active && current.current === scope) setState({ uid: scope.uid, status: 'ready', refreshing: false, ...report });
    } catch (_) {
      if (scope.active && current.current === scope) setState(empty(scope.uid, 'error'));
    } finally {
      if (scope.active && current.current === scope) scope.busy = false;
    }
  }, []);

  const refresh = useCallback(() => {
    const scope = current.current;
    if (readable && scope?.uid === uid) return read(scope);
    return Promise.resolve();
  }, [read, readable, uid]);

  useEffect(() => {
    if (!readable) { setState(empty(null, 'idle')); return undefined; }
    const scope = { uid, user, active: true, busy: false, controller: null };
    current.current = scope;
    read(scope);
    const update = () => { if (document.visibilityState !== 'hidden') read(scope); };
    const interval = window.setInterval(update, REFRESH_MS);
    window.addEventListener('focus', update);
    return () => {
      scope.active = false;
      scope.controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      if (current.current === scope) current.current = null;
    };
    // A session owns its token, response, timer and focus listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, readable, read]);

  const visible = !readable ? empty(uid, 'idle') : state.uid === uid ? state : empty(uid, 'loading');
  return { ...visible, loading: visible.status === 'loading',
    error: visible.status === 'error' ? 'Não foi possível carregar as inscrições. Atualize a consulta para tentar novamente.' : '', refresh };
}
