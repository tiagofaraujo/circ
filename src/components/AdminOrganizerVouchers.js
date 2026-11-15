import React, { useEffect, useState } from 'react';
import { formatVoucher, newVoucherCode } from '../auth/companyVouchers';
import { getFirebaseAuth, isAdminUser } from '../auth/firebaseClient';
import { REGISTRATION_CAPACITY_ENABLED } from '../data/registration2027';

const API = '/api/admin/registration-management/organizer-vouchers/issue';
const QUANTITY = 9;
const BATCH_ID = 'circ-2027-organizers-01';

function savedBatch(key) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key));
    if (Array.isArray(saved?.codes) && saved.codes.length === QUANTITY
      && saved.codes.every(code => typeof code === 'string' && /^[a-f0-9]{32}$/.test(code))
      && new Set(saved.codes).size === QUANTITY) return { ...saved, issued: saved.issued === true };
  } catch { /* The codes can still be copied directly when storage is unavailable. */ }
  return null;
}

async function requestBatch(hashes) {
  const user = getFirebaseAuth()?.currentUser;
  if (!isAdminUser(user) || !user.getIdToken) throw new Error('admin-required');
  const token = await user.getIdToken();
  const response = await fetch(API, {
    method: hashes ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(hashes ? { 'Content-Type': 'application/json' } : {}) },
    ...(hashes ? { body: JSON.stringify({ hashes }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error);
  if (result?.batchId !== BATCH_ID || result.quantity !== QUANTITY || typeof result.issued !== 'boolean'
    || (hashes && !result.issued)) throw new Error('invalid-response');
  return result;
}

async function hashCode(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function AdminOrganizerVouchers() {
  const storageKey = `${BATCH_ID}:${getFirebaseAuth()?.currentUser?.uid}`;
  const [batch, setBatch] = useState(() => savedBatch(storageKey));
  const [issued, setIssued] = useState(null);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (batch) return undefined;
    let active = true;
    requestBatch().then(result => { if (active) setIssued(result.issued); }).catch(() => {
      if (active) setError('Não foi possível consultar o estado do lote.');
    });
    return () => { active = false; };
  }, [batch, statusAttempt]);

  const remember = (next) => {
    setBatch(next);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* The visible list remains available for copying. */ }
  };

  const prepare = () => {
    setError('');
    setMessage('');
    try { remember({ codes: Array.from({ length: QUANTITY }, newVoucherCode), issued: false }); }
    catch { setError('Abra o My CIRC por HTTPS para preparar os códigos em segurança.'); }
  };

  const issue = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const hashes = await Promise.all(batch.codes.map(hashCode));
      await requestBatch(hashes);
      remember({ ...batch, issued: true });
      setIssued(true);
      setMessage('Os 9 vouchers foram emitidos.');
    } catch (failure) {
      if (failure.message === 'organizer-vouchers-already-issued') setIssued(true);
      setError(failure.message === 'organizer-vouchers-already-issued'
        ? 'O lote já foi emitido com outros códigos. Consulte a cópia guardada na emissão original.'
        : 'A emissão não foi confirmada. Volte a tentar com os mesmos códigos.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(batch.codes.map(formatVoucher).join('\n'));
      setMessage('Os 9 códigos foram copiados.');
    } catch { setMessage('Selecione e copie os códigos na lista.'); }
  };

  return <section className="company-voucher" aria-labelledby="organizer-vouchers-title">
    <h2 id="organizer-vouchers-title">Vouchers para organizadores</h2>
    <p>9 códigos de utilização única. Cada código inclui os dois cursos e um bilhete de jantar na inscrição presencial ULS Coimbra{REGISTRATION_CAPACITY_ENABLED ? ', sujeito à lotação dos cursos' : ''}. O organizador usa o código antes de confirmar a inscrição e paga o congresso e os bilhetes de jantar adicionais que selecionar.</p>
    {!batch && issued === null && (error
      ? <button type="button" onClick={() => { setError(''); setStatusAttempt(attempt => attempt + 1); }}>Consultar estado do lote</button>
      : <p role="status">A consultar o estado do lote…</p>)}
    {!batch && issued === false && <button type="button" onClick={prepare}>Preparar 9 códigos</button>}
    {!batch && issued === true && <p>Lote emitido. Consulte a cópia guardada durante a emissão.</p>}
    {batch && <>
      <h3>{batch.issued ? 'Códigos emitidos' : 'Códigos preparados'}</h3>
      <ol>{batch.codes.map(code => <li key={code}><code>{formatVoucher(code)}</code></li>)}</ol>
      <p>Guarde uma cópia privada dos códigos. Depois de emitidos, partilhe um código por organizador.</p>
      <button type="button" onClick={copy}>Copiar 9 códigos</button>
      {!batch.issued && <button type="button" disabled={busy} onClick={issue}>
        {issued === true ? 'Confirmar estes códigos' : 'Emitir 9 vouchers'}
      </button>}
    </>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
