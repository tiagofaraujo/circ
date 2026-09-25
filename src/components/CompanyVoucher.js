import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { companyError, redeemCompanyVoucher, subscribeCompanyConfig, subscribeCompanyRegistration } from '../auth/companyVouchers';
import './css/CompanyVouchers.css';

export function CompanyRegistrationGate({ children }) {
  const { user } = useAuth();
  const [registration, setRegistration] = useState(null);
  const [lookup, setLookup] = useState('loading');
  useEffect(() => {
    setRegistration(null);
    if (!user?.emailVerified) { setLookup('ready'); return undefined; }
    setLookup('loading');
    return subscribeCompanyRegistration(user, (value) => { setRegistration(value); setLookup('ready'); }, () => setLookup('error'));
  }, [user]);
  if (lookup === 'loading') return <p role="status">A consultar a sua inscrição…</p>;
  if (lookup === 'error') return <p role="alert">Não foi possível consultar a inscrição. Atualize a página para tentar novamente.</p>;
  if (registration && registration.userId === user?.uid) return children(registration);
  return children(null);
}
export default function CompanyVoucher({ eligible }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setEnabled(false);
    if (!user?.emailVerified) return undefined;
    return subscribeCompanyConfig(setEnabled, () => setEnabled(false));
  }, [user]);
  if (!enabled) return null;
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !eligible) return;
    setBusy(true); setError('');
    try { await redeemCompanyVoucher(code); setDone(true); setCode(''); }
    catch (err) { setError(companyError(err)); }
    finally { setBusy(false); }
  };
  return <details className="company-voucher">
    <summary>Tem um voucher?</summary>
    <form onSubmit={submit}>
      <label>Código do voucher<input autoComplete="off" spellCheck="false" maxLength={50} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy || done} required /></label>
      {!eligible && code.trim() && <p>Para utilizar este voucher, selecione «Congressista externo» e «Presencial», sem jantar nem cursos.</p>}
      <button disabled={busy || !eligible || done || !code.trim()}>{busy ? 'A confirmar…' : 'Confirmar inscrição com voucher'}</button>
      <small>O voucher será associado à sua inscrição.</small>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">Inscrição confirmada com voucher.</p>}
    </form>
  </details>;
}
