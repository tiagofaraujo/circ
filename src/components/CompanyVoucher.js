import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { companyError, redeemCompanyVoucher, subscribeCompanyConfig, subscribeCompanyRegistration } from '../auth/companyVouchers';
import { isRegistrationOpen, REGISTRATION_OPEN_AT } from '../data/registration2027';
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
  const [registrationOpen, setRegistrationOpen] = useState(isRegistrationOpen);
  useEffect(() => {
    let timer;
    const refresh = () => {
      const open = isRegistrationOpen();
      setRegistrationOpen(open);
      if (!open) timer = window.setTimeout(refresh, Math.min(Date.parse(REGISTRATION_OPEN_AT) - Date.now() + 25, 2147483647));
    };
    refresh();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    setEnabled(false);
    if (!user?.emailVerified) return undefined;
    return subscribeCompanyConfig(setEnabled, () => setEnabled(false));
  }, [user]);
  if (!enabled) return null;
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !eligible || !isRegistrationOpen()) return;
    setBusy(true); setError('');
    try { await redeemCompanyVoucher(code); setDone(true); setCode(''); }
    catch (err) { setError(companyError(err)); }
    finally { setBusy(false); }
  };
  return <details className="company-voucher">
    <summary>Tem um voucher?</summary>
    <form onSubmit={submit} aria-label="Confirmar inscrição com voucher">
      <label>Código do voucher<input autoComplete="off" spellCheck="false" maxLength={50} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy || done} required /></label>
      {!eligible && code.trim() && <p>Para utilizar este voucher, selecione «Congressista externo» e «Presencial», sem jantar nem cursos.</p>}
      {!registrationOpen && <p role="status">As inscrições com voucher abrem a 15 de novembro de 2026, às 00h00 de Lisboa.</p>}
      <button disabled={busy || !eligible || done || !code.trim() || !registrationOpen}>{busy ? 'A confirmar…' : 'Confirmar inscrição com voucher'}</button>
      <small>O voucher será associado à sua inscrição.</small>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">Inscrição confirmada com voucher.</p>}
    </form>
  </details>;
}
