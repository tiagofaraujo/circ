import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmUlsCode, requestUlsCode, ulsVerificationEnabled } from '../../auth/ulsEligibilityStore';
import '../css/UlsVerification.css';

export default function UlsVerification({ user, eligibility, en }) {
  const [mec, setMec] = useState('');
  const [code, setCode] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!receipt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [receipt]);

  const retrySeconds = receipt ? Math.max(0, Math.ceil((receipt.retryAtMs - now) / 1000)) : 0;
  const expired = receipt && now >= receipt.expiresAtMs;
  function showError(cause) {
    const messages = {
      'resource-exhausted': ['Atingiu o limite de tentativas. Aguarde e tente mais tarde.', 'Too many attempts. Please wait and try again later.'],
      'failed-precondition': ['Confirme primeiro o email da sua conta e volte a iniciar sessão.', 'Verify your account email and sign in again.'],
      'unauthenticated': ['Volte a iniciar sessão para continuar.', 'Please sign in again to continue.'],
      'permission-denied': ['Código inválido, expirado ou indisponível. Peça um novo código ou contacte o secretariado.', 'Invalid, expired or unavailable code. Request a new code or contact the secretariat.'],
      'invalid-argument': ['Verifique o MEC e o código introduzidos.', 'Check the employee number and code.'],
    };
    setError(messages[cause.message]?.[en ? 1 : 0] || (en
      ? 'The request could not be completed. Try again later or contact the secretariat.'
      : 'Não foi possível concluir o pedido. Tente mais tarde ou contacte o secretariado.'));
  }
  async function send(event) {
    event?.preventDefault();
    if (busy || retrySeconds > 0 || !/^\d{1,12}$/.test(mec.trim())) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await requestUlsCode(mec.trim());
      if (!active.current) return;
      setNow(Date.now()); setCode('');
      if (result.verified) { setMessage(en ? 'Your account is already validated.' : 'A sua conta já está validada.'); return; }
      setReceipt(result);
      setMessage(en
        ? `Request received. If this employee number is eligible, a code will arrive at ${mec.trim()}@ulscoimbra.min-saude.pt. Check your inbox and spam folder.`
        : `Pedido recebido. Se o MEC for elegível, receberá um código em ${mec.trim()}@ulscoimbra.min-saude.pt. Verifique a caixa de entrada e a pasta de spam.`);
    } catch (cause) { if (active.current) showError(cause); }
    finally { if (active.current) setBusy(false); }
  }
  async function confirm(event) {
    event.preventDefault();
    if (busy || !receipt || expired || !/^\d{6}$/.test(code.trim())) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await confirmUlsCode(receipt.challengeId, code.trim());
      if (active.current) { setReceipt(null); setCode(''); setMessage(en ? 'Validation saved. Updating your account…' : 'Validação guardada. A atualizar a sua conta…'); }
    } catch (cause) { if (active.current) showError(cause); }
    finally { if (active.current) setBusy(false); }
  }

  return <section className="uls-verification" aria-labelledby="uls-verification-title">
    <h3 id="uls-verification-title">{en ? 'ULS Coimbra validation' : 'Validação ULS Coimbra'}</h3>
    {eligibility.verified ? <p className="uls-verification__success" role="status"><strong>{en ? 'ULS Coimbra — Validated' : 'ULS Coimbra — Validado'}</strong><span>{eligibility.institutionalEmail}</span></p>
      : !user ? <p>{en ? 'Sign in to validate your employee number.' : 'Inicie sessão para validar o seu MEC.'} <Link to="/login">{en ? 'Sign in' : 'Entrar'}</Link></p>
      : !ulsVerificationEnabled ? <p>{en ? 'Institutional validation is not yet available. You will need to validate your employee number before registering in this category.' : 'A validação institucional ainda não está disponível. Será necessário validar o seu MEC antes de concluir a inscrição nesta categoria.'}</p>
      : eligibility.status === 'loading' ? <p role="status">{en ? 'Checking your validation…' : 'A verificar a sua validação…'}</p>
      : <>
        <p>{en ? 'Enter your employee number. We will send a code to the corresponding institutional email. You can keep your personal email for signing in.' : 'Indique o seu MEC. Enviaremos um código para o email institucional correspondente. Pode manter o seu email pessoal para iniciar sessão.'}</p>
        {eligibility.status === 'error' && <p className="uls-verification__error" role="alert">{en ? 'Could not check your validation. Reload the page or contact the secretariat.' : 'Não foi possível consultar a validação. Atualize a página ou contacte o secretariado.'}</p>}
        <form onSubmit={receipt ? confirm : send}>
          <label htmlFor="uls-mec">{en ? 'Employee number (MEC)' : 'Número mecanográfico (MEC)'}</label>
          <input id="uls-mec" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,12}" maxLength={12} required value={mec} disabled={busy || Boolean(receipt)} onChange={(event) => setMec(event.target.value)} />
          {receipt && <>
            <label htmlFor="uls-code">{en ? 'Verification code' : 'Código de verificação'}</label>
            <input id="uls-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy || expired} onChange={(event) => setCode(event.target.value)} aria-describedby="uls-code-help" />
            <small id="uls-code-help">{expired ? (en ? 'The code has expired. Request a new one.' : 'O código expirou. Peça um novo código.') : (en ? 'Six digits. Valid for 10 minutes and one use only.' : 'Seis algarismos. Válido durante 10 minutos e para uma única utilização.')}</small>
          </>}
          <div className="uls-verification__actions">
            <button type="submit" disabled={busy || (receipt ? expired || !/^\d{6}$/.test(code.trim()) : !/^\d{1,12}$/.test(mec.trim()))}>{busy ? (en ? 'Please wait…' : 'Aguarde…') : receipt ? (en ? 'Confirm code' : 'Confirmar código') : (en ? 'Send code' : 'Enviar código')}</button>
            {receipt && <button type="button" className="uls-verification__secondary" disabled={busy || retrySeconds > 0} onClick={send}>{retrySeconds > 0 ? `${en ? 'Resend in' : 'Reenviar em'} ${retrySeconds}s` : (en ? 'Resend code' : 'Reenviar código')}</button>}
            {receipt && <button type="button" className="uls-verification__secondary" disabled={busy} onClick={() => { setReceipt(null); setCode(''); setMessage(''); setError(''); }}>{en ? 'Change MEC' : 'Alterar MEC'}</button>}
          </div>
        </form>
        {message && <p role="status">{message}</p>}
        {error && <p className="uls-verification__error" role="alert">{error}</p>}
        <small>{en ? 'If your number is missing or associated with another account, ' : 'Se o MEC não constar da lista ou estiver associado a outra conta, '}<a href="mailto:circ.chuc@gmail.com">{en ? 'contact the secretariat' : 'contacte o secretariado'}</a>.</small>
      </>}
  </section>;
}
