import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  claimUlsEligibility,
  isUlsPilotUser,
  ulsVerificationEnabled,
} from '../../auth/ulsEligibilityStore';
import '../css/UlsVerification.css';

export default function UlsVerification({ user, eligibility, en }) {
  const [mec, setMec] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  function showError(cause) {
    const code = cause?.code || cause?.message || '';
    const messages = {
      'uls/invalid-mec': ['Introduza um MEC válido.', 'Enter a valid employee number.'],
      'uls/missing-profile-name': [
        'Complete e guarde primeiro o nome completo no seu perfil.',
        'Complete and save your full name in your profile first.',
      ],
      'uls/email-not-verified': [
        'Confirme primeiro o email da sua conta e volte a iniciar sessão.',
        'Verify your account email and sign in again.',
      ],
      'uls/unauthenticated': ['Volte a iniciar sessão para continuar.', 'Please sign in again to continue.'],
      'uls/not-authorised': [
        'Esta validação está limitada à conta autorizada para o piloto.',
        'This validation is limited to the authorised pilot account.',
      ],
      'uls/no-match': [
        'Não foi possível confirmar os dados. Verifique o MEC e o nome completo guardado no perfil ou contacte o secretariado.',
        'The details could not be matched. Check the employee number and the full name saved in your profile, or contact the secretariat.',
      ],
    };
    setError(messages[code]?.[en ? 1 : 0] || (en
      ? 'The validation could not be completed. Try again later or contact the secretariat.'
      : 'Não foi possível concluir a validação. Tente mais tarde ou contacte o secretariado.'));
  }

  async function confirm(event) {
    event.preventDefault();
    if (busy || !/^\d{1,12}$/.test(mec.trim())) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await claimUlsEligibility(mec.trim());
      if (active.current) {
        setMessage(en
          ? 'Match confirmed. Updating your registration options…'
          : 'Correspondência confirmada. A atualizar as opções de inscrição…');
      }
    } catch (cause) {
      if (active.current) showError(cause);
    } finally {
      if (active.current) setBusy(false);
    }
  }

  return <section className="uls-verification" aria-labelledby="uls-verification-title">
    <h3 id="uls-verification-title">{en ? 'ULS Coimbra eligibility' : 'Elegibilidade ULS Coimbra'}</h3>
    {eligibility.verified ? (
      <p className="uls-verification__success" role="status">
        <strong>{en ? 'ULS Coimbra — Match confirmed' : 'ULS Coimbra — Correspondência confirmada'}</strong>
        <span>{eligibility.mec ? 'MEC ' + eligibility.mec : ''}</span>
      </p>
    ) : !user ? (
      <p>{en ? 'Sign in to check your employee number.' : 'Inicie sessão para confirmar o seu MEC.'} <Link to="/login">{en ? 'Sign in' : 'Entrar'}</Link></p>
    ) : !ulsVerificationEnabled ? (
      <p>{en ? 'This check is not yet available.' : 'Esta verificação ainda não está disponível.'}</p>
    ) : !isUlsPilotUser(user) ? (
      <p>{en ? 'This check is currently limited to the authorised pilot account.' : 'Esta verificação está, nesta fase, limitada à conta autorizada para o piloto.'}</p>
    ) : eligibility.status === 'loading' ? (
      <p role="status">{en ? 'Checking your eligibility…' : 'A verificar a sua elegibilidade…'}</p>
    ) : <>
      <p>{en
        ? 'Enter your employee number. It must match the full name saved in your My CIRC profile and the private ULS Coimbra eligibility list.'
        : 'Indique o seu MEC. O número tem de corresponder ao nome completo guardado no perfil My CIRC e na lista privada de elegíveis da ULS Coimbra.'}</p>
      <p><Link to="/conta/perfil">{en ? 'Review the full name saved in your profile' : 'Rever o nome completo guardado no perfil'}</Link></p>
      {eligibility.status === 'error' && <p className="uls-verification__error" role="alert">{en ? 'Could not check a previous match. Reload the page or contact the secretariat.' : 'Não foi possível consultar uma correspondência anterior. Atualize a página ou contacte o secretariado.'}</p>}
      <form onSubmit={confirm}>
        <label htmlFor="uls-mec">{en ? 'Employee number (MEC)' : 'Número mecanográfico (MEC)'}</label>
        <input
          id="uls-mec"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{1,12}"
          maxLength={12}
          required
          value={mec}
          disabled={busy}
          onChange={(event) => setMec(event.target.value)}
        />
        <div className="uls-verification__actions">
          <button type="submit" disabled={busy || !/^\d{1,12}$/.test(mec.trim())}>
            {busy ? (en ? 'Checking…' : 'A verificar…') : (en ? 'Check employee number' : 'Confirmar MEC')}
          </button>
        </div>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p className="uls-verification__error" role="alert">{error}</p>}
      <small>{en
        ? 'If the details do not match or the number has already been used, '
        : 'Se os dados não corresponderem ou o MEC já tiver sido utilizado, '}<a href="mailto:circ.chuc@gmail.com">{en ? 'contact the secretariat' : 'contacte o secretariado'}</a>.</small>
    </>}
  </section>;
}
