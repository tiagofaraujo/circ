import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import '../account.css';
import '../auth.css';

const professionOptions = [
  ['radiographer', 'TSDT — Radiologia', 'Radiographer / Radiologic Technologist'],
  ['radiologist', 'Médico / Radiologista', 'Physician / Radiologist'],
  ['nurse', 'Enfermeiro', 'Nurse'],
  ['medical-physicist', 'Físico Médico', 'Medical Physicist'],
  ['engineer', 'Engenheiro / Tecnólogo', 'Engineer / Technologist'],
  ['student', 'Estudante', 'Student'],
  ['researcher', 'Investigador', 'Researcher'],
  ['industry', 'Indústria', 'Industry'],
  ['other', 'Outra', 'Other'],
];

function profileKey(uid) {
  return `circ_profile_${uid}`;
}

function readProfile(user) {
  if (!user) return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(profileKey(user.uid))) || {};
    return {
      name: stored.name || user.displayName || '',
      email: user.email || stored.email || '',
      country: stored.country || 'Portugal',
      profession: stored.profession || 'radiographer',
      institution: stored.institution || '',
      professionalId: stored.professionalId || '',
      professionLabel: stored.professionLabel || '',
    };
  } catch (error) {
    return {
      name: user.displayName || '',
      email: user.email || '',
      country: 'Portugal',
      profession: 'radiographer',
      institution: '',
      professionalId: '',
      professionLabel: '',
    };
  }
}

function writeProfile(user, profile) {
  if (!user) return;
  window.localStorage.setItem(profileKey(user.uid), JSON.stringify(profile));
}

function authMessage(error, isEnglish) {
  const code = error?.code || error?.message || '';
  const messages = {
    'auth/invalid-credential': [
      'Email ou palavra-passe incorretos.',
      'Incorrect email or password.',
    ],
    'auth/invalid-email': ['Introduza um endereço de email válido.', 'Enter a valid email address.'],
    'auth/email-already-in-use': [
      'Já existe uma conta associada a este email.',
      'An account already exists for this email.',
    ],
    'auth/weak-password': [
      'Escolha uma palavra-passe mais forte.',
      'Choose a stronger password.',
    ],
    'auth/too-many-requests': [
      'Foram feitas demasiadas tentativas. Tente novamente mais tarde.',
      'Too many attempts. Please try again later.',
    ],
    'auth/popup-closed-by-user': [
      'O login com Google foi cancelado.',
      'Google sign-in was cancelled.',
    ],
    'auth/popup-blocked': [
      'O browser bloqueou a janela de login do Google. Autorize pop-ups e tente novamente.',
      'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
    ],
    'auth/network-request-failed': [
      'Não foi possível contactar o serviço de autenticação. Verifique a ligação à internet.',
      'Could not reach the authentication service. Check your internet connection.',
    ],
    'auth/not-configured': [
      'A autenticação da Área CIRC está a ser configurada.',
      'My CIRC authentication is being configured.',
    ],
  };

  const match = messages[code];
  if (match) return isEnglish ? match[1] : match[0];
  return isEnglish
    ? 'Authentication could not be completed. Please try again.'
    : 'Não foi possível concluir a autenticação. Tente novamente.';
}

function AccountShell({ children, title, subtitle }) {
  const { language } = useLanguage();
  const isEnglish = language === 'en';

  return (
    <main className="account-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Participant area' : 'Área CIRC · Participante'}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="account-hero__mark" aria-hidden="true">
          <span>CIRC</span>
          <small>2027</small>
        </div>
      </section>
      {children}
    </main>
  );
}

function GoogleButton({ onClick, busy, isEnglish, mode = 'login' }) {
  return (
    <button className="auth-google-button" type="button" onClick={onClick} disabled={busy}>
      <i className="fab fa-google" aria-hidden="true" />
      <span>
        {mode === 'register'
          ? isEnglish
            ? 'Create account with Google'
            : 'Criar conta com Google'
          : isEnglish
            ? 'Continue with Google'
            : 'Continuar com Google'}
      </span>
    </button>
  );
}

function AuthUnavailable({ isEnglish }) {
  return (
    <div className="auth-system-notice" role="status">
      <strong>{isEnglish ? 'My CIRC authentication is being activated.' : 'A autenticação da Área CIRC está a ser ativada.'}</strong>
      <p>
        {isEnglish
          ? 'The interface is ready, but the secure authentication provider still needs its production configuration.'
          : 'A interface está pronta, mas falta concluir a configuração de produção do fornecedor seguro de autenticação.'}
      </p>
    </div>
  );
}

export function LoginPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, configured, loginWithPassword, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const destination = location.state?.from || '/conta';

  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [user, navigate, destination]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginWithPassword(email, password);
      navigate(destination, { replace: true });
    } catch (authError) {
      setError(authMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (authError) {
      setError(authMessage(authError, isEnglish));
      setBusy(false);
    }
  };

  return (
    <AccountShell
      title={isEnglish ? 'Welcome to My CIRC' : 'Bem-vindo à Área CIRC'}
      subtitle={
        isEnglish
          ? 'Your registration, ticket and CIRC experience in one secure place.'
          : 'A sua inscrição, bilhete e experiência CIRC num espaço seguro.'
      }
    >
      <section className="account-login-grid auth-login-grid">
        <div className="account-login-card auth-card">
          <div>
            <span className="account-step">ACESSO SEGURO</span>
            <h2>{isEnglish ? 'Sign in to My CIRC' : 'Entrar na Área CIRC'}</h2>
            <p>
              {isEnglish
                ? 'Use your Google account or sign in with your email and password.'
                : 'Utilize a sua conta Google ou entre com email e palavra-passe.'}
            </p>
          </div>

          {!configured ? (
            <AuthUnavailable isEnglish={isEnglish} />
          ) : (
            <>
              <GoogleButton onClick={handleGoogle} busy={busy} isEnglish={isEnglish} />
              <div className="auth-divider"><span>{isEnglish ? 'or' : 'ou'}</span></div>

              <form onSubmit={handleSubmit} className="account-login-form auth-form">
                <label htmlFor="circ-login-email">Email</label>
                <input
                  id="circ-login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@instituicao.pt"
                  required
                />

                <div className="auth-password-heading">
                  <label htmlFor="circ-login-password">{isEnglish ? 'Password' : 'Palavra-passe'}</label>
                  <Link to="/recuperar-password">{isEnglish ? 'Forgot password?' : 'Esqueceu-se?'}</Link>
                </div>
                <div className="auth-password-field">
                  <input
                    id="circ-login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>
                    <i className={showPassword ? 'far fa-eye-slash' : 'far fa-eye'} aria-hidden="true" />
                  </button>
                </div>

                {error && <div className="auth-error" role="alert">{error}</div>}

                <button className="button account-primary-button auth-submit" type="submit" disabled={busy}>
                  {busy ? (isEnglish ? 'Signing in…' : 'A entrar…') : (isEnglish ? 'Sign in' : 'Entrar')}
                </button>
              </form>

              <p className="auth-switch">
                {isEnglish ? 'New to My CIRC?' : 'Ainda não tem conta?'}{' '}
                <Link to="/registar">{isEnglish ? 'Create account' : 'Criar conta'}</Link>
              </p>
            </>
          )}
        </div>

        <aside className="account-benefits">
          <p className="eyebrow">{isEnglish ? 'Designed for the full journey' : 'Pensado para toda a experiência'}</p>
          <div className="account-benefit-list">
            <div><span>01</span><strong>{isEnglish ? 'Registration' : 'Inscrição'}</strong><p>{isEnglish ? 'Course, congress or complete experience.' : 'Curso, congresso ou experiência completa.'}</p></div>
            <div><span>02</span><strong>{isEnglish ? 'Payment' : 'Pagamento'}</strong><p>{isEnglish ? 'Payment information and confirmation in one place.' : 'Informação e confirmação de pagamento num só local.'}</p></div>
            <div><span>03</span><strong>{isEnglish ? 'Ticket' : 'Bilhete'}</strong><p>{isEnglish ? 'Digital access and QR code after confirmation.' : 'Acesso digital e QR code após confirmação.'}</p></div>
            <div><span>04</span><strong>{isEnglish ? 'Certificates' : 'Certificados'}</strong><p>{isEnglish ? 'Future access to certificates and participation history.' : 'Futuro acesso a certificados e histórico de participação.'}</p></div>
          </div>
        </aside>
      </section>
    </AccountShell>
  );
}

export function RegisterPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, configured, registerWithPassword, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate('/conta', { replace: true });
  }, [user, navigate]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError(isEnglish ? 'Use at least 8 characters.' : 'Utilize pelo menos 8 caracteres.');
      return;
    }
    if (form.password !== form.confirm) {
      setError(isEnglish ? 'Passwords do not match.' : 'As palavras-passe não coincidem.');
      return;
    }

    setBusy(true);
    try {
      await registerWithPassword(form.name, form.email, form.password);
      navigate('/conta', { replace: true });
    } catch (authError) {
      setError(authMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (authError) {
      setError(authMessage(authError, isEnglish));
      setBusy(false);
    }
  };

  return (
    <AccountShell
      title={isEnglish ? 'Create your My CIRC account' : 'Criar conta na Área CIRC'}
      subtitle={isEnglish ? 'One account for your CIRC 2027 journey.' : 'Uma conta para acompanhar toda a experiência CIRC 2027.'}
    >
      <section className="auth-single-card">
        <div className="account-login-card auth-card auth-card--single">
          <div>
            <span className="account-step">NOVO PARTICIPANTE</span>
            <h2>{isEnglish ? 'Create account' : 'Criar conta'}</h2>
          </div>

          {!configured ? (
            <AuthUnavailable isEnglish={isEnglish} />
          ) : (
            <>
              <GoogleButton onClick={handleGoogle} busy={busy} isEnglish={isEnglish} mode="register" />
              <div className="auth-divider"><span>{isEnglish ? 'or' : 'ou'}</span></div>

              <form onSubmit={handleSubmit} className="account-login-form auth-form">
                <label htmlFor="register-name">{isEnglish ? 'Full name' : 'Nome completo'}</label>
                <input id="register-name" name="name" autoComplete="name" value={form.name} onChange={updateField} required />

                <label htmlFor="register-email">Email</label>
                <input id="register-email" name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} required />

                <label htmlFor="register-password">{isEnglish ? 'Password' : 'Palavra-passe'}</label>
                <div className="auth-password-field">
                  <input id="register-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={updateField} minLength="8" required />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}>
                    <i className={showPassword ? 'far fa-eye-slash' : 'far fa-eye'} aria-hidden="true" />
                  </button>
                </div>
                <p className="auth-field-hint">{isEnglish ? 'Minimum 8 characters.' : 'Mínimo de 8 caracteres.'}</p>

                <label htmlFor="register-confirm">{isEnglish ? 'Confirm password' : 'Confirmar palavra-passe'}</label>
                <input id="register-confirm" name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={updateField} required />

                {error && <div className="auth-error" role="alert">{error}</div>}

                <button className="button account-primary-button auth-submit" type="submit" disabled={busy}>
                  {busy ? (isEnglish ? 'Creating…' : 'A criar…') : (isEnglish ? 'Create account' : 'Criar conta')}
                </button>
              </form>

              <p className="auth-privacy-note">
                {isEnglish
                  ? 'After registration, we send a verification email to confirm your address.'
                  : 'Após o registo, enviamos um email de verificação para confirmar o endereço.'}
              </p>
              <p className="auth-switch">
                {isEnglish ? 'Already have an account?' : 'Já tem conta?'}{' '}
                <Link to="/login">{isEnglish ? 'Sign in' : 'Entrar'}</Link>
              </p>
            </>
          )}
        </div>
      </section>
    </AccountShell>
  );
}

export function ForgotPasswordPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { configured, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (authError) {
      setError(authMessage(authError, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountShell
      title={isEnglish ? 'Reset password' : 'Recuperar palavra-passe'}
      subtitle={isEnglish ? 'We will send a secure reset link to your email.' : 'Enviaremos uma ligação segura de recuperação para o seu email.'}
    >
      <section className="auth-single-card">
        <div className="account-login-card auth-card auth-card--single auth-card--compact">
          {!configured ? (
            <AuthUnavailable isEnglish={isEnglish} />
          ) : sent ? (
            <div className="auth-success" role="status">
              <strong>{isEnglish ? 'Check your inbox.' : 'Consulte a sua caixa de correio.'}</strong>
              <p>{isEnglish ? 'If an account exists for this email, you will receive a reset message.' : 'Se existir uma conta para este email, receberá uma mensagem de recuperação.'}</p>
              <Link className="button account-primary-button auth-inline-button" to="/login">{isEnglish ? 'Back to sign in' : 'Voltar ao login'}</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="account-login-form auth-form">
              <label htmlFor="reset-email">Email</label>
              <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="button account-primary-button auth-submit" type="submit" disabled={busy}>
                {busy ? (isEnglish ? 'Sending…' : 'A enviar…') : (isEnglish ? 'Send reset link' : 'Enviar ligação de recuperação')}
              </button>
              <Link className="text-link auth-back-link" to="/login">← {isEnglish ? 'Back to sign in' : 'Voltar ao login'}</Link>
            </form>
          )}
        </div>
      </section>
    </AccountShell>
  );
}

export function AccountOverviewPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const profile = readProfile(user);
  const displayName = profile?.name || user?.displayName || user?.email?.split('@')[0] || 'CIRC';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AccountShell
      title={`${isEnglish ? 'Hello' : 'Olá'}, ${displayName}`}
      subtitle={isEnglish ? 'CIRC 2027 · Coimbra · 8–10 April' : 'CIRC 2027 · Coimbra · 8–10 abril'}
    >
      <section className="account-dashboard">
        <div className="account-dashboard__topline">
          <div>
            <span className="account-status account-status--neutral">
              {user?.emailVerified ? (isEnglish ? 'Email verified' : 'Email verificado') : (isEnglish ? 'Email pending verification' : 'Email por verificar')}
            </span>
            <p>{user?.email}</p>
          </div>
          <button type="button" className="account-text-button" onClick={handleLogout}>
            {isEnglish ? 'Sign out' : 'Terminar sessão'}
          </button>
        </div>

        <div className="account-dashboard__grid">
          <article className="account-card account-card--primary">
            <span className="account-card__number">01</span>
            <p className="eyebrow">{isEnglish ? 'Registration' : 'Inscrição'}</p>
            <h2>{isEnglish ? 'Not started yet' : 'Ainda não iniciada'}</h2>
            <p>{isEnglish ? 'Registration for CIRC 2027 is not open yet.' : 'As inscrições para o CIRC 2027 ainda não estão abertas.'}</p>
            <Link className="account-card__link" to="/conta/inscricoes">{isEnglish ? 'See planned options' : 'Ver opções previstas'} <span>→</span></Link>
          </article>

          <article className="account-card">
            <span className="account-card__number">02</span>
            <p className="eyebrow">{isEnglish ? 'Payment' : 'Pagamento'}</p>
            <h2>{isEnglish ? 'No payment' : 'Sem pagamento'}</h2>
            <p>{isEnglish ? 'Payment information will appear after registration opens.' : 'A informação de pagamento surgirá quando as inscrições abrirem.'}</p>
          </article>

          <article className="account-card">
            <span className="account-card__number">03</span>
            <p className="eyebrow">{isEnglish ? 'Ticket' : 'Bilhete'}</p>
            <h2>{isEnglish ? 'Available after confirmation' : 'Disponível após confirmação'}</h2>
            <p>{isEnglish ? 'A digital QR ticket will be generated automatically.' : 'Será gerado automaticamente um bilhete digital com QR code.'}</p>
          </article>

          <article className="account-card account-card--profile">
            <span className="account-card__number">04</span>
            <p className="eyebrow">{isEnglish ? 'Professional profile' : 'Perfil profissional'}</p>
            <h2>{profile?.name || (isEnglish ? 'Complete your profile' : 'Complete o seu perfil')}</h2>
            <p>{profile?.professionLabel || profile?.institution || (isEnglish ? 'Profession and institution not set.' : 'Profissão e instituição ainda não definidas.')}</p>
            <Link className="account-card__link" to="/conta/perfil">{isEnglish ? 'Edit profile' : 'Editar perfil'} <span>→</span></Link>
          </article>
        </div>
      </section>
    </AccountShell>
  );
}

export function AccountProfilePage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, updateAccountName } = useAuth();
  const existing = readProfile(user);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(existing);

  const selectedProfession = useMemo(
    () => professionOptions.find(([value]) => value === form.profession),
    [form.profession]
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const professionLabel = selectedProfession ? (isEnglish ? selectedProfession[2] : selectedProfession[1]) : '';
    const nextProfile = { ...form, email: user.email, professionLabel };
    writeProfile(user, nextProfile);
    if (form.name !== user.displayName) await updateAccountName(form.name);
    setSaved(true);
  };

  const showPortugueseRadiographerId = form.country === 'Portugal' && form.profession === 'radiographer';

  return (
    <AccountShell
      title={isEnglish ? 'Professional profile' : 'Perfil profissional'}
      subtitle={isEnglish ? 'Keep your participant details ready for registration.' : 'Mantenha os seus dados de participante preparados para a inscrição.'}
    >
      <section className="account-form-section">
        <form className="account-profile-form" onSubmit={handleSubmit}>
          <div className="account-form-grid">
            <label><span>{isEnglish ? 'Full name' : 'Nome completo'}</span><input name="name" value={form.name} onChange={updateField} required /></label>
            <label><span>Email</span><input name="email" type="email" value={user.email || ''} readOnly /></label>
            <label>
              <span>{isEnglish ? 'Country' : 'País'}</span>
              <select name="country" value={form.country} onChange={updateField}>
                <option>Portugal</option><option>Spain</option><option>France</option><option>United Kingdom</option><option>Germany</option><option>Brazil</option><option>United States</option><option>Other</option>
              </select>
            </label>
            <label>
              <span>{isEnglish ? 'Profession' : 'Profissão'}</span>
              <select name="profession" value={form.profession} onChange={updateField}>
                {professionOptions.map(([value, pt, en]) => <option key={value} value={value}>{isEnglish ? en : pt}</option>)}
              </select>
            </label>
            <label className="account-form-grid__wide"><span>{isEnglish ? 'Institution / organisation' : 'Instituição / organização'}</span><input name="institution" value={form.institution} onChange={updateField} /></label>
            {showPortugueseRadiographerId && <label className="account-form-grid__wide"><span>{isEnglish ? 'Professional licence number' : 'N.º de cédula profissional'}</span><input name="professionalId" value={form.professionalId} onChange={updateField} /></label>}
          </div>

          <div className="account-form-actions">
            <button className="button account-primary-button" type="submit">{isEnglish ? 'Save profile' : 'Guardar perfil'}</button>
            <Link className="text-link" to="/conta">{isEnglish ? 'Back to My CIRC' : 'Voltar à Área CIRC'}</Link>
            {saved && <span className="account-save-message">{isEnglish ? 'Saved.' : 'Guardado.'}</span>}
          </div>
        </form>
      </section>
    </AccountShell>
  );
}

export function AccountRegistrationsPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const options = [
    { date: '08', title: isEnglish ? 'Pre-Congress Course' : 'Curso Pré-Congresso', text: isEnglish ? 'Structured training day before the congress.' : 'Dia de formação estruturada antes do congresso.' },
    { date: '09—10', title: 'CIRC 2027', text: isEnglish ? 'Two days of scientific programme and professional exchange.' : 'Dois dias de programa científico e encontro profissional.' },
    { date: '08—10', title: isEnglish ? 'Complete experience' : 'Experiência completa', text: isEnglish ? 'Course + congress in a single registration journey.' : 'Curso + congresso num único percurso de inscrição.' },
  ];

  return (
    <AccountShell
      title={isEnglish ? 'Registration options' : 'Opções de inscrição'}
      subtitle={isEnglish ? 'We are preparing the ticket structure before registrations open.' : 'Estamos a preparar a estrutura de inscrições antes da abertura.'}
    >
      <section className="account-registration-section">
        <div className="account-registration-alert">
          <span className="account-status account-status--neutral">{isEnglish ? 'Coming soon' : 'Brevemente'}</span>
          <p>{isEnglish ? 'Prices and opening dates have not yet been announced.' : 'Os preços e a data de abertura ainda não foram anunciados.'}</p>
        </div>
        <div className="account-ticket-grid">
          {options.map((item) => (
            <article className="account-ticket" key={item.date}>
              <strong>{item.date}</strong>
              <div>
                <p className="eyebrow">{isEnglish ? 'April 2027' : 'Abril 2027'}</p>
                <h2>{item.title}</h2>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="account-payment-preview">
          <p className="eyebrow">{isEnglish ? 'Next step' : 'Próxima fase'}</p>
          <h2>{isEnglish ? 'Registration and payment will live inside My CIRC.' : 'Inscrição e pagamento ficarão integrados na Área CIRC.'}</h2>
          <div className="account-payment-methods"><span>MB WAY</span><span>Multibanco</span><span>Cartão</span><span>International</span></div>
          <p>{isEnglish ? 'Methods shown are planned and will be confirmed before registrations open.' : 'Os métodos apresentados são indicativos e serão confirmados antes da abertura das inscrições.'}</p>
        </div>
      </section>
    </AccountShell>
  );
}
