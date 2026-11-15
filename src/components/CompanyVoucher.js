import React, { useEffect, useRef, useState } from 'react';
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
export default function CompanyVoucher({ eligible, onDiscountCode }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(isRegistrationOpen);
  const detailsRef = useRef(null);
  const isDiscountCode = /^CIRC27-D-/i.test(code.trim());
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
    if (busy || done || !isRegistrationOpen()) return;
    if (isDiscountCode) {
      if (!onDiscountCode) return;
      const discountCode = code.trim();
      setCode(''); setError('');
      detailsRef.current.open = false;
      onDiscountCode(discountCode);
      return;
    }
    if (!eligible) return;
    setBusy(true); setError('');
    try { await redeemCompanyVoucher(code); setDone(true); setCode(''); }
    catch (err) { setError(companyError(err)); }
    finally { setBusy(false); }
  };
  return <details className="company-voucher" ref={detailsRef}>
    <summary>Tem um voucher de empresa?</summary>
    <form onSubmit={submit} aria-label="Confirmar inscrição com voucher de empresa">
      {!eligible && !isDiscountCode && <p>Para utilizar um voucher de empresa, selecione «Congressista externo» e «Congresso presencial» e deixe os cursos e o jantar por selecionar.</p>}
      <label>Código do voucher de empresa<input autoComplete="off" spellCheck="false" maxLength={80} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} disabled={busy || done} required /></label>
      {!registrationOpen && <p role="status">As inscrições com voucher abrem a 15 de novembro de 2026, às 00h00 de Lisboa.</p>}
      <button disabled={busy || (isDiscountCode ? !onDiscountCode : !eligible) || done || !code.trim() || !registrationOpen}>
        {busy ? 'A confirmar…' : isDiscountCode ? 'Usar código de desconto' : 'Confirmar inscrição com voucher de empresa'}
      </button>
      <small>{isDiscountCode
        ? onDiscountCode ? 'Este código é um desconto da organização. Reveja o desconto e o total na inscrição.' : 'Selecione o congresso presencial ou virtual para usar este desconto.'
        : 'Os códigos CIRC27-D- são aplicados em «Tem um código de desconto?». O voucher de empresa será associado à sua inscrição.'}</small>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">Inscrição confirmada com voucher.</p>}
    </form>
  </details>;
}
