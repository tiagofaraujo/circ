import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { saveParticipantProfile } from '../auth/profileStore';
import { useLanguage } from '../context/LanguageContext';
import '../auth.css';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.24-.2-1.79h-9.2v3.34h5.4a4.61 4.61 0 0 1-2 3.03l-.02.11 2.91 2.25.2.02c1.84-1.7 2.91-4.2 2.91-6.96Z" />
      <path fill="#34A853" d="M12.2 21.8c2.63 0 4.84-.87 6.45-2.37l-3.09-2.38c-.83.56-1.94.95-3.36.95a5.84 5.84 0 0 1-5.52-4.04l-.1.01-3.03 2.35-.04.1A9.74 9.74 0 0 0 12.2 21.8Z" />
      <path fill="#FBBC05" d="M6.68 13.96a6 6 0 0 1-.32-1.96c0-.69.12-1.35.31-1.96v-.12L3.61 7.54l-.1.05A9.8 9.8 0 0 0 2.45 12c0 1.59.38 3.08 1.06 4.41l3.17-2.45Z" />
      <path fill="#EA4335" d="M12.2 6c1.83 0 3.06.79 3.76 1.44l2.75-2.68C17.03 3.19 14.83 2.2 12.2 2.2a9.74 9.74 0 0 0-8.69 5.39l3.16 2.45A5.86 5.86 0 0 1 12.2 6Z" />
    </svg>
  );
}

function friendlyError(error, isEnglish) {
  const code = error?.code || error?.message || '';
  const messages = {
    'auth/email-already-in-use': isEnglish ? 'An account already exists for this email.' : 'Já existe uma conta associada a este email.',
    'auth/invalid-email': isEnglish ? 'Enter a valid email address.' : 'Introduza um endereço de email válido.',
    'auth/weak-password': isEnglish ? 'Use a stronger password.' : 'Utilize uma palavra-passe mais segura.',
    'auth/popup-closed-by-user': isEnglish ? 'Google sign-in was cancelled.' : 'O acesso Google foi cancelado.',
    'auth/popup-blocked': isEnglish ? 'Your browser blocked the Google sign-in window.' : 'O browser bloqueou a janela de acesso Google.',
  };
  return messages[code] || (isEnglish ? 'The operation could not be completed.' : 'Não foi possível concluir a operação.');
}

export default function RegisterWithPhotoPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { configured, user, registerWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/conta" replace />;

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(isEnglish ? 'Use a password with at least 8 characters.' : 'Utilize uma palavra-passe com pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError(isEnglish ? 'The passwords do not match.' : 'As palavras-passe não coincidem.');
      return;
    }

    setBusy(true);
    try {
      const createdUser = await registerWithEmail(name, email, password, language);
      await saveParticipantProfile(createdUser, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        photoURL: '',
      });
      navigate('/conta', { replace: true, state: { newAccount: true } });
    } catch (registerError) {
      setError(friendlyError(registerError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogle(language);
      if (result) {
        await saveParticipantProfile(result, {
          name: result.displayName || '',
          email: result.email || '',
          photoURL: result.photoURL || '',
        });
        navigate('/conta', { replace: true });
      }
    } catch (googleError) {
      setError(friendlyError(googleError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-panel">
          <div className="auth-panel__heading">
            <p className="eyebrow">{isEnglish ? 'My CIRC · New participant' : 'My CIRC · Novo participante'}</p>
            <h1>{isEnglish ? 'Create your CIRC account' : 'Criar conta CIRC'}</h1>
            <p>{isEnglish ? 'Create a secure account to manage your participation in CIRC 2027.' : 'Crie uma conta segura para acompanhar a sua participação no CIRC 2027.'}</p>
          </div>

          <button className="auth-google-button" type="button" onClick={handleGoogleRegister} disabled={busy || !configured}>
            <GoogleIcon />
            <span>{isEnglish ? 'Create account with Google' : 'Criar conta com Google'}</span>
          </button>

          <div className="auth-divider"><span>{isEnglish ? 'or' : 'ou'}</span></div>

          <form className="auth-form" onSubmit={handleRegister}>
            <label htmlFor="register-name">{isEnglish ? 'Full name' : 'Nome completo'}</label>
            <input id="register-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />

            <label htmlFor="register-email">Email</label>
            <input id="register-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

            <label htmlFor="register-password">{isEnglish ? 'Password' : 'Palavra-passe'}</label>
            <div className="auth-password-field">
              <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? (isEnglish ? 'Hide' : 'Ocultar') : (isEnglish ? 'Show' : 'Mostrar')}</button>
            </div>
            <small className="auth-help">{isEnglish ? 'Minimum 8 characters.' : 'Mínimo de 8 caracteres.'}</small>

            <label htmlFor="register-password-confirm">{isEnglish ? 'Confirm password' : 'Confirmar palavra-passe'}</label>
            <input id="register-password-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />

            {error && <div className="auth-notice auth-notice--error" role="alert">{error}</div>}

            <button className="auth-primary-button" type="submit" disabled={busy || !configured}>{busy ? (isEnglish ? 'Creating account…' : 'A criar conta…') : (isEnglish ? 'Create account' : 'Criar conta')}</button>
          </form>

          <p className="auth-switch">{isEnglish ? 'Already have an account?' : 'Já tem conta?'}{' '}<Link to="/login">{isEnglish ? 'Sign in' : 'Entrar'}</Link></p>
        </div>

        <aside className="auth-aside">
          <div><span className="auth-aside__date">08—10</span><p className="eyebrow">{isEnglish ? 'April 2027 · Coimbra' : 'Abril 2027 · Coimbra'}</p></div>
          <div><h2>{isEnglish ? 'One account for the complete CIRC experience.' : 'Uma conta para toda a experiência CIRC.'}</h2><p>{isEnglish ? 'Google accounts use the Google profile avatar. Email accounts use a simple initials avatar for now.' : 'As contas Google utilizam o avatar do perfil Google. As contas por email utilizam, para já, um avatar simples com iniciais.'}</p></div>
        </aside>
      </section>
    </main>
  );
}
