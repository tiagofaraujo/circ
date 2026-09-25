import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { companyError, redeemCompanyVoucher, subscribeCompanyConfig, subscribeCompanyRegistration } from '../auth/companyVouchers';
import './css/CompanyVouchers.css';

export function CompanyRegistrationGate({ children }) {
  const { user } = useAuth();
  const [registration, setRegistration] = useState(null);
  useEffect(() => {
    setRegistration(null);
    if (!user?.emailVerified) return undefined;
    return subscribeCompanyRegistration(user, setRegistration, () => setRegistration(null));
  }, [user]);
  if (registration && registration.userId === user?.uid) return <section className="company-voucher" role="status">
    <h2>{registration.status === 'confirmed' ? 'Inscrição confirmada' : 'Estado da inscrição'}</h2>
    <p><strong>{registration.participantName}</strong></p>
    <p>Congressista externo · Presencial · 9 e 10 de abril de 2027</p>
    <p>Paga pela empresa: <strong>{registration.payment?.payer}</strong></p>
    <p>Estado: {registration.status === 'confirmed' ? 'Confirmada' : registration.status}. Sem jantar nem cursos.</p>
    <p>Referência da inscrição: {registration.id}</p>
    <p>O documento de faturação pertence à compra da empresa. Esta é a confirmação da sua inscrição.</p>
    <Link to="/conta/perfil">Rever dados do perfil</Link>
  </section>;
  return children;
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
