import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getProfileCompletion } from '../auth/profileCompletion';
import { loadParticipantProfileResult } from '../auth/profileStore';
import { useLanguage } from '../context/LanguageContext';
import '../auth.css';

function getErrorCode(error) {
  return error?.code || error?.message || '';
}

function authErrorMessage(error, isEnglish = false) {
  const code = getErrorCode(error);
  const pt = {
    'auth/invalid-credential': 'Email ou palavra-passe incorretos.',
    'auth/user-not-found': 'Não encontramos uma conta com estes dados.',
    'auth/wrong-password': 'Email ou palavra-passe incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta associada a este email.',
    'auth/invalid-email': 'Introduza um endereço de email válido.',
    'auth/weak-password': 'A palavra-passe não cumpre os requisitos mínimos de segurança.',
    'auth/too-many-requests': 'Foram efetuadas demasiadas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/popup-closed-by-user': 'A janela de autenticação Google foi fechada antes de concluir o acesso.',
    'auth/popup-blocked': 'O browser bloqueou a janela do Google. Autorize pop-ups para este site e tente novamente.',
    'auth/cancelled-popup-request': 'O pedido de autenticação anterior foi cancelado. Tente novamente.',
    'auth/network-request-failed': 'Não foi possível contactar o serviço de autenticação. Verifique a ligação à internet.',
    'auth/unauthorized-domain': 'Este domínio ainda não está autorizado no serviço de autenticação.',
    'auth/not-configured': 'A autenticação ainda não está ligada ao ambiente de produção.',
  };
  const en = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'We could not find an account with these details.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'The password does not meet the minimum security requirements.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before completion.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request': 'The previous authentication request was cancelled. Please try again.',
    'auth/network-request-failed': 'The authentication service could not be reached. Check your internet connection.',
    'auth/unauthorized-domain': 'This domain is not yet authorized by the authentication service.',
    'auth/not-configured': 'Authentication is not yet connected to the production environment.',
  };
  const messages = isEnglish ? en : pt;
  return messages[code] || (isEnglish ? 'Authentication failed. Please try again.' : 'Não foi possível concluir a autenticação. Tente novamente.');
}

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

function AuthLayout({ eyebrow, title, subtitle, children, asideTitle, asideText }) {
  const { language } = useLanguage();
  const isEnglish = language === 'en';

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-panel">
          <div className="auth-panel__heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <aside className="auth-aside">
          <div>
            <span className="auth-aside__date">08—10</span>
            <p className="eyebrow">{isEnglish ? 'April 2027 · Coimbra' : 'Abril 2027 · Coimbra'}</p>
          </div>
          <div>
            <h2>{asideTitle}</h2>
            <p>{asideText}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function ConfigurationNotice({ isEnglish }) {
  return (
    <div className="auth-notice auth-notice--warning" role="status">
      <strong>{isEnglish ? 'Authentication setup pending' : 'Configuração de autenticação pendente'}</strong>
      <span>
        {isEnglish
          ? 'The complete login interface is ready. It will become active as soon as the Firebase production credentials are configured.'
          : 'A interface completa está pronta. O login ficará ativo assim que forem configurados os dados de produção do Firebase.'}
      </span>
    </div>
  );
}

export function LoginPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { configured, user, signInWithEmail, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = location.state?.from || '/conta';

  if (user) return <Navigate to={destination} replace />;

  const handleEmailLogin = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmail(email, password, language);
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogle(language);
      if (result) navigate(destination, { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={isEnglish ? 'My CIRC · Participant' : 'My CIRC · Participante'}
      title={isEnglish ? 'Sign in to My CIRC' : 'Entrar no My CIRC'}
      subtitle={isEnglish ? 'Use your Google account or sign in with email and password.' : 'Utilize a sua conta Google ou entre com email e palavra-passe.'}
      asideTitle={isEnglish ? 'One account for the complete CIRC experience.' : 'Uma conta para toda a experiência CIRC.'}
      asideText={isEnglish ? 'Registration, professional details, digital ticket and, in the future, certificates in one secure account.' : 'Inscrição, dados profissionais, bilhete digital e, futuramente, certificados reunidos num único acesso.'}
    >
      {!configured && <ConfigurationNotice isEnglish={isEnglish} />}

      <button className="auth-google-button" type="button" onClick={handleGoogleLogin} disabled={busy || !configured}>
        <GoogleIcon />
        <span>{isEnglish ? 'Continue with Google' : 'Continuar com Google'}</span>
      </button>

      <div className="auth-divider"><span>{isEnglish ? 'or' : 'ou'}</span></div>

      <form className="auth-form" onSubmit={handleEmailLogin}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={isEnglish ? 'email@example.com' : 'email@exemplo.com'} required />

        <div className="auth-password-row">
          <label htmlFor="login-password">{isEnglish ? 'Password' : 'Palavra-passe'}</label>
          <Link to="/recuperar-password">{isEnglish ? 'Forgot password?' : 'Esqueceu-se?'}</Link>
        </div>
        <div className="auth-password-field">
          <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isEnglish ? 'Your password' : 'A sua palavra-passe'} required />
          <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? (isEnglish ? 'Hide password' : 'Ocultar palavra-passe') : (isEnglish ? 'Show password' : 'Mostrar palavra-passe')}>
            {showPassword ? (isEnglish ? 'Hide' : 'Ocultar') : (isEnglish ? 'Show' : 'Mostrar')}
          </button>
        </div>

        {error && <div className="auth-notice auth-notice--error" role="alert">{error}</div>}

        <button className="auth-primary-button" type="submit" disabled={busy || !configured}>
          {busy ? (isEnglish ? 'Signing in…' : 'A entrar…') : (isEnglish ? 'Sign in' : 'Entrar')}
        </button>
      </form>

      <p className="auth-switch">
        {isEnglish ? 'New to CIRC?' : 'Ainda não tem conta?'}{' '}
        <Link to="/registar">{isEnglish ? 'Create account' : 'Criar conta'}</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
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
      await registerWithEmail(name, email, password, language);
      navigate('/conta', { replace: true, state: { newAccount: true } });
    } catch (authError) {
      setError(authErrorMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithGoogle(language);
      if (result) navigate('/conta', { replace: true });
    } catch (authError) {
      setError(authErrorMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={isEnglish ? 'My CIRC · New participant' : 'My CIRC · Novo participante'}
      title={isEnglish ? 'Create your CIRC account' : 'Criar conta CIRC'}
      subtitle={isEnglish ? 'Create a secure account to manage your participation in CIRC 2027.' : 'Crie uma conta segura para acompanhar a sua participação no CIRC 2027.'}
      asideTitle={isEnglish ? 'Start now. Complete your profile later.' : 'Comece agora. Complete o perfil depois.'}
      asideText={isEnglish ? 'You can create your account before registration opens. Participation details will be added progressively.' : 'A conta poderá ser criada antes da abertura das inscrições. Os dados de participação serão acrescentados progressivamente.'}
    >
      {!configured && <ConfigurationNotice isEnglish={isEnglish} />}

      <button className="auth-google-button" type="button" onClick={handleGoogleRegister} disabled={busy || !configured}>
        <GoogleIcon />
        <span>{isEnglish ? 'Create account with Google' : 'Criar conta com Google'}</span>
      </button>

      <div className="auth-divider"><span>{isEnglish ? 'or' : 'ou'}</span></div>

      <form className="auth-form" onSubmit={handleRegister}>
        <label htmlFor="register-name">{isEnglish ? 'Full name' : 'Nome completo'}</label>
        <input id="register-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />

        <label htmlFor="register-email">Email</label>
        <input id="register-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={isEnglish ? 'email@example.com' : 'email@exemplo.com'} aria-describedby="register-email-help" required />
        <small id="register-email-help" className="auth-help">{isEnglish ? 'Personal and institutional email addresses are accepted.' : 'São aceites endereços de email pessoais e institucionais.'}</small>

        <label htmlFor="register-password">{isEnglish ? 'Password' : 'Palavra-passe'}</label>
        <div className="auth-password-field">
          <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="password-help" required />
          <button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? (isEnglish ? 'Hide' : 'Ocultar') : (isEnglish ? 'Show' : 'Mostrar')}</button>
        </div>
        <small id="password-help" className="auth-help">{isEnglish ? 'Minimum 8 characters.' : 'Mínimo de 8 caracteres.'}</small>

        <label htmlFor="register-password-confirm">{isEnglish ? 'Confirm password' : 'Confirmar palavra-passe'}</label>
        <input id="register-password-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />

        {error && <div className="auth-notice auth-notice--error" role="alert">{error}</div>}

        <button className="auth-primary-button" type="submit" disabled={busy || !configured}>
          {busy ? (isEnglish ? 'Creating account…' : 'A criar conta…') : (isEnglish ? 'Create account' : 'Criar conta')}
        </button>
      </form>

      <p className="auth-switch">
        {isEnglish ? 'Already have an account?' : 'Já tem conta?'}{' '}
        <Link to="/login">{isEnglish ? 'Sign in' : 'Entrar'}</Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { configured, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleReset = async (event) => {
    event.preventDefault();
    setError('');
    setSent(false);
    setBusy(true);
    try {
      await sendPasswordReset(email, language);
      setSent(true);
    } catch (authError) {
      setError(authErrorMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={isEnglish ? 'My CIRC · Security' : 'My CIRC · Segurança'}
      title={isEnglish ? 'Reset your password' : 'Recuperar palavra-passe'}
      subtitle={isEnglish ? 'Enter your account email. We will send you secure recovery instructions.' : 'Indique o email da sua conta. Enviaremos as instruções de recuperação.'}
      asideTitle={isEnglish ? 'Recover access securely.' : 'Recupere o acesso com segurança.'}
      asideText={isEnglish ? 'Your password is never sent by email. You will receive a secure link to create a new one.' : 'A palavra-passe nunca é enviada por email. Receberá um link seguro para definir uma nova.'}
    >
      {!configured && <ConfigurationNotice isEnglish={isEnglish} />}
      <form className="auth-form" onSubmit={handleReset}>
        <label htmlFor="reset-email">Email</label>
        <input id="reset-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={isEnglish ? 'email@example.com' : 'email@exemplo.com'} required />

        {sent && <div className="auth-notice auth-notice--success" role="status">{isEnglish ? 'If an account exists for this address, you will receive an email with recovery instructions.' : 'Se existir uma conta associada a este endereço, receberá um email com as instruções de recuperação.'}</div>}
        {error && <div className="auth-notice auth-notice--error" role="alert">{error}</div>}

        <button className="auth-primary-button" type="submit" disabled={busy || !configured}>{busy ? (isEnglish ? 'Sending…' : 'A enviar…') : (isEnglish ? 'Send instructions' : 'Enviar instruções')}</button>
      </form>
      <p className="auth-switch"><Link to="/login">{isEnglish ? '← Back to sign in' : '← Voltar ao login'}</Link></p>
    </AuthLayout>
  );
}

export function AuthenticatedAccountPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, isAdmin, signOut, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [verificationSent, setVerificationSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [participantProfile, setParticipantProfile] = useState(null);
  const [profileLoadState, setProfileLoadState] = useState('loading');

  const isPasswordAccount = user?.providerData?.some((provider) => provider.providerId === 'password');
  const displayName = user?.displayName || user?.email?.split('@')[0] || (isEnglish ? 'Participant' : 'Participante');
  const profileCompletion = profileLoadState === 'ready' && participantProfile
    ? getProfileCompletion({
        country: 'Portugal',
        profession: 'radiographer',
        billingCountry: 'Portugal',
        email: user?.email || '',
        name: user?.displayName || '',
        ...participantProfile,
      })
    : null;

  useEffect(() => {
    let active = true;
    let retryTimer;

    setParticipantProfile(null);
    setProfileLoadState('loading');

    const loadProfile = async (attempt = 0) => {
      const result = await loadParticipantProfileResult(user);
      if (!active) return;

      if (!result.remoteAvailable && attempt < 2) {
        retryTimer = window.setTimeout(
          () => loadProfile(attempt + 1),
          350 * (attempt + 1)
        );
        return;
      }

      setParticipantProfile(result.profile);
      setProfileLoadState(result.remoteAvailable ? 'ready' : 'unavailable');
    };

    loadProfile();

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [user]);

  const handleSignOut = async () => {
    setBusy(true);
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleVerification = async () => {
    setBusy(true);
    try {
      await resendVerification(language);
      setVerificationSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="account-page auth-account-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Participant' : 'My CIRC · Participante'}</p>
          <h1>{isEnglish ? 'Hello' : 'Olá'}, {displayName}</h1>
          <p>{isEnglish ? 'CIRC 2027 · Coimbra · 8–10 April' : 'CIRC 2027 · Coimbra · 8–10 abril'}</p>
        </div>
        {user?.photoURL ? <img className="auth-account-avatar" src={user.photoURL} alt="" /> : <div className="auth-account-avatar auth-account-avatar--initials">{displayName.slice(0, 1).toUpperCase()}</div>}
      </section>

      {isPasswordAccount && !user.emailVerified && (
        <section className="auth-verification-banner">
          <div>
            <strong>{isEnglish ? 'Confirm your email address.' : 'Confirme o seu endereço de email.'}</strong>
            <p>{isEnglish ? `We sent a verification message to ${user.email}. Verification adds an extra layer of security to your account.` : `Enviámos uma mensagem de verificação para ${user.email}. A confirmação reforça a segurança da sua conta.`}</p>
          </div>
          <button type="button" onClick={handleVerification} disabled={busy}>{verificationSent ? (isEnglish ? 'Verification email sent' : 'Email reenviado') : (isEnglish ? 'Resend verification' : 'Reenviar verificação')}</button>
        </section>
      )}

      <section className={`auth-account-grid${isAdmin ? ' auth-account-grid--admin' : ''}`}>
        {!isAdmin && (
          <>
            <article className="auth-account-card auth-account-card--primary">
              <span>01</span>
              <p className="eyebrow">{isEnglish ? 'Registration' : 'Inscrição'}</p>
              <h2>{isEnglish ? 'Not open yet' : 'Ainda não aberta'}</h2>
              <p>{isEnglish ? 'When registration opens, you will be able to start and follow the complete process in this area.' : 'Quando as inscrições forem disponibilizadas, poderá iniciar e acompanhar todo o processo nesta área.'}</p>
              <Link to="/conta/inscricoes">{isEnglish ? 'See planned options →' : 'Ver opções previstas →'}</Link>
            </article>
            <article className="auth-account-card auth-account-card--submissions">
              <span>02</span>
              <div className="auth-account-card__status">{isEnglish ? 'Opens 15 Nov.' : 'Abre 15 nov.'}</div>
              <p className="eyebrow">{isEnglish ? 'Scientific submissions' : 'Submissões científicas'}</p>
              <h2>{isEnglish ? 'Your work. One clear path.' : 'O seu trabalho. Um percurso claro.'}</h2>
              <p>{isEnglish ? 'Prepare your abstract, organise the authors and follow every stage of the scientific review.' : 'Prepare o resumo, organize os autores e acompanhe cada etapa da avaliação científica.'}</p>
              <Link to="/conta/submissoes">{isEnglish ? 'Enter the submission centre →' : 'Entrar no centro de submissões →'}</Link>
            </article>
            <article className="auth-account-card">
              <span>03</span>
              <p className="eyebrow">{isEnglish ? 'Profile' : 'Perfil'}</p>
              <h2>{isEnglish ? 'Profile details' : 'Dados do perfil'}</h2>
              <p>{isEnglish ? 'Complete your personal, professional and billing details.' : 'Complete os seus dados pessoais, profissionais e de faturação.'}</p>
              {profileCompletion && profileCompletion.percentage < 100 && (
                <div className="auth-profile-completion" aria-label={isEnglish ? `Profile ${profileCompletion.percentage}% complete` : `Perfil ${profileCompletion.percentage}% completo`}>
                  <div><span>{isEnglish ? 'Profile complete' : 'Perfil completo'}</span><strong>{profileCompletion.percentage}%</strong></div>
                  <div className="auth-profile-completion__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={profileCompletion.percentage}>
                    <span style={{ width: `${profileCompletion.percentage}%` }} />
                  </div>
                </div>
              )}
              <Link to="/conta/perfil">{isEnglish ? 'Edit profile →' : 'Editar perfil →'}</Link>
            </article>
          </>
        )}
        <article className="auth-account-card">
          <span>{isAdmin ? '01' : '04'}</span>
          <p className="eyebrow">{isEnglish ? 'Account' : 'Conta'}</p>
          <h2>{user?.email}</h2>
          <p>{user?.emailVerified ? (isEnglish ? 'Email verified.' : 'Email verificado.') : (isEnglish ? 'Email not yet verified.' : 'Email ainda não verificado.')}</p>
          <button className="auth-signout-button" type="button" onClick={handleSignOut} disabled={busy}>{isEnglish ? 'Sign out' : 'Terminar sessão'}</button>
        </article>
        {isAdmin && (
          <article className="auth-account-card auth-account-card--admin">
            <span>02</span>
            <p className="eyebrow">Administração</p>
            <h2>{isEnglish ? 'Registration management' : 'Gestão de inscrições'}</h2>
            <p>{isEnglish ? 'Review participants, registration status and payment status.' : 'Consulte participantes, estado da inscrição e estado do pagamento.'}</p>
            <Link to="/admin">{isEnglish ? 'Open administration →' : 'Abrir administração →'}</Link>
            <Link className="auth-account-card__secondary-link" to="/conta/submissoes">{isEnglish ? 'Test submissions →' : 'Testar submissões →'}</Link>
          </article>
        )}
      </section>
    </main>
  );
}
