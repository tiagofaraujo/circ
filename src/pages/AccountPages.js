import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import '../account.css';

const DEMO_STORAGE_KEY = 'circ_demo_account';

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

function readDemoAccount() {
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY)) || null;
  } catch (error) {
    return null;
  }
}

function writeDemoAccount(account) {
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(account));
}

function AccountShell({ children, title, subtitle }) {
  const { language } = useLanguage();
  const isEnglish = language === 'en';

  return (
    <main className="account-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Participant area' : 'My CIRC · Participante'}</p>
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

export function LoginPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    const current = readDemoAccount() || {};
    writeDemoAccount({ ...current, email: normalizedEmail, demoAccess: true });
    navigate('/conta');
  };

  return (
    <AccountShell
      title={isEnglish ? 'Welcome to My CIRC' : 'Bem-vindo ao My CIRC'}
      subtitle={
        isEnglish
          ? 'Your registration, ticket and CIRC experience in one place.'
          : 'A sua inscrição, bilhete e experiência CIRC num só lugar.'
      }
    >
      <section className="account-login-grid">
        <div className="account-login-card">
          <div>
            <span className="account-step">01</span>
            <h2>{isEnglish ? 'Access with your email' : 'Entre com o seu email'}</h2>
            <p>
              {isEnglish
                ? 'The final version will use a secure magic link or one-time code. For now, this screen lets us validate the participant experience.'
                : 'Na versão final receberá um link seguro ou código de acesso. Nesta fase, este ecrã permite-nos validar a experiência do participante.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="account-login-form">
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
            <button className="button account-primary-button" type="submit">
              {isEnglish ? 'Continue' : 'Continuar'}
            </button>
          </form>

          <p className="account-demo-note">
            {isEnglish
              ? 'Prototype mode · no password and no real authentication yet.'
              : 'Modo protótipo · ainda sem password nem autenticação real.'}
          </p>
        </div>

        <aside className="account-benefits">
          <p className="eyebrow">{isEnglish ? 'Designed for the full journey' : 'Pensado para toda a experiência'}</p>
          <div className="account-benefit-list">
            <div><span>01</span><strong>{isEnglish ? 'Registration' : 'Inscrição'}</strong><p>{isEnglish ? 'Course, congress or complete experience.' : 'Curso, congresso ou experiência completa.'}</p></div>
            <div><span>02</span><strong>{isEnglish ? 'Payment' : 'Pagamento'}</strong><p>{isEnglish ? 'MB WAY, Multibanco, card and international methods.' : 'MB WAY, Multibanco, cartão e métodos internacionais.'}</p></div>
            <div><span>03</span><strong>{isEnglish ? 'Ticket' : 'Bilhete'}</strong><p>{isEnglish ? 'Digital access and QR code after confirmation.' : 'Acesso digital e QR code após confirmação.'}</p></div>
            <div><span>04</span><strong>{isEnglish ? 'Certificates' : 'Certificados'}</strong><p>{isEnglish ? 'Future access to certificates and participation history.' : 'Futuro acesso a certificados e histórico de participação.'}</p></div>
          </div>
        </aside>
      </section>
    </AccountShell>
  );
}

export function AccountOverviewPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const navigate = useNavigate();
  const account = readDemoAccount();

  if (!account?.email) {
    return (
      <AccountShell
        title="My CIRC"
        subtitle={isEnglish ? 'Sign in to access your participant area.' : 'Entre para aceder à sua área de participante.'}
      >
        <section className="account-empty-state">
          <Link className="button account-primary-button" to="/login">
            {isEnglish ? 'Sign in' : 'Entrar'}
          </Link>
        </section>
      </AccountShell>
    );
  }

  const displayName = account.name || account.email.split('@')[0];

  const logout = () => {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
    navigate('/login');
  };

  return (
    <AccountShell
      title={`${isEnglish ? 'Hello' : 'Olá'}, ${displayName}`}
      subtitle={isEnglish ? 'CIRC 2027 · Coimbra · 8–10 April' : 'CIRC 2027 · Coimbra · 8–10 abril'}
    >
      <section className="account-dashboard">
        <div className="account-dashboard__topline">
          <div>
            <span className="account-status account-status--neutral">{isEnglish ? 'Prototype' : 'Protótipo'}</span>
            <p>{account.email}</p>
          </div>
          <button type="button" className="account-text-button" onClick={logout}>
            {isEnglish ? 'Sign out' : 'Terminar sessão'}
          </button>
        </div>

        <div className="account-dashboard__grid">
          <article className="account-card account-card--primary">
            <span className="account-card__number">01</span>
            <p className="eyebrow">{isEnglish ? 'Registration' : 'Inscrição'}</p>
            <h2>{isEnglish ? 'Not started yet' : 'Ainda não iniciada'}</h2>
            <p>{isEnglish ? 'Registration for CIRC 2027 is not open yet.' : 'As inscrições para o CIRC 2027 ainda não estão abertas.'}</p>
            <Link className="account-card__link" to="/conta/inscricoes">
              {isEnglish ? 'See planned options' : 'Ver opções previstas'} <span>→</span>
            </Link>
          </article>

          <article className="account-card">
            <span className="account-card__number">02</span>
            <p className="eyebrow">{isEnglish ? 'Payment' : 'Pagamento'}</p>
            <h2>{isEnglish ? 'No payment' : 'Sem pagamento'}</h2>
            <p>{isEnglish ? 'Payment methods will appear after ticket selection.' : 'Os métodos de pagamento surgirão depois da escolha da inscrição.'}</p>
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
            <h2>{account.name || (isEnglish ? 'Complete your profile' : 'Complete o seu perfil')}</h2>
            <p>{account.professionLabel || (isEnglish ? 'Profession and institution not set.' : 'Profissão e instituição ainda não definidas.')}</p>
            <Link className="account-card__link" to="/conta/perfil">
              {isEnglish ? 'Edit profile' : 'Editar perfil'} <span>→</span>
            </Link>
          </article>
        </div>
      </section>
    </AccountShell>
  );
}

export function AccountProfilePage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const navigate = useNavigate();
  const existing = readDemoAccount() || {};
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: existing.name || '',
    email: existing.email || '',
    country: existing.country || 'Portugal',
    profession: existing.profession || 'radiographer',
    institution: existing.institution || '',
    professionalId: existing.professionalId || '',
  });

  const selectedProfession = useMemo(
    () => professionOptions.find(([value]) => value === form.profession),
    [form.profession]
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const professionLabel = selectedProfession ? (isEnglish ? selectedProfession[2] : selectedProfession[1]) : '';
    writeDemoAccount({ ...existing, ...form, professionLabel, demoAccess: true });
    setSaved(true);
  };

  if (!existing.email) {
    navigate('/login');
    return null;
  }

  const showPortugueseRadiographerId = form.country === 'Portugal' && form.profession === 'radiographer';

  return (
    <AccountShell
      title={isEnglish ? 'Professional profile' : 'Perfil profissional'}
      subtitle={isEnglish ? 'A flexible profile for Portuguese and international participants.' : 'Um perfil flexível para participantes portugueses e internacionais.'}
    >
      <section className="account-form-section">
        <form className="account-profile-form" onSubmit={handleSubmit}>
          <div className="account-form-grid">
            <label>
              <span>{isEnglish ? 'Full name' : 'Nome completo'}</span>
              <input name="name" value={form.name} onChange={updateField} required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" value={form.email} onChange={updateField} required />
            </label>
            <label>
              <span>{isEnglish ? 'Country' : 'País'}</span>
              <select name="country" value={form.country} onChange={updateField}>
                <option>Portugal</option>
                <option>Spain</option>
                <option>France</option>
                <option>United Kingdom</option>
                <option>Germany</option>
                <option>Brazil</option>
                <option>United States</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              <span>{isEnglish ? 'Profession' : 'Profissão'}</span>
              <select name="profession" value={form.profession} onChange={updateField}>
                {professionOptions.map(([value, pt, en]) => (
                  <option key={value} value={value}>{isEnglish ? en : pt}</option>
                ))}
              </select>
            </label>
            <label className="account-form-grid__wide">
              <span>{isEnglish ? 'Institution / organisation' : 'Instituição / organização'}</span>
              <input name="institution" value={form.institution} onChange={updateField} />
            </label>
            {showPortugueseRadiographerId && (
              <label className="account-form-grid__wide">
                <span>{isEnglish ? 'Professional licence number (optional at this stage)' : 'N.º de cédula profissional (opcional nesta fase)'}</span>
                <input name="professionalId" value={form.professionalId} onChange={updateField} />
              </label>
            )}
          </div>

          <div className="account-form-actions">
            <button className="button account-primary-button" type="submit">
              {isEnglish ? 'Save profile' : 'Guardar perfil'}
            </button>
            <Link className="text-link" to="/conta">{isEnglish ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
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
    {
      date: '08',
      title: isEnglish ? 'Pre-Congress Course' : 'Curso Pré-Congresso',
      text: isEnglish ? 'Structured training day before the congress.' : 'Dia de formação estruturada antes do congresso.',
    },
    {
      date: '09—10',
      title: 'CIRC 2027',
      text: isEnglish ? 'Two days of scientific programme and professional exchange.' : 'Dois dias de programa científico e encontro profissional.',
    },
    {
      date: '08—10',
      title: isEnglish ? 'Complete experience' : 'Experiência completa',
      text: isEnglish ? 'Course + congress in a single registration journey.' : 'Curso + congresso num único percurso de inscrição.',
    },
  ];

  return (
    <AccountShell
      title={isEnglish ? 'Registration options' : 'Opções de inscrição'}
      subtitle={isEnglish ? 'We are preparing the ticket structure before registrations open.' : 'Estamos a preparar a estrutura de ingressos antes da abertura das inscrições.'}
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
          <p className="eyebrow">{isEnglish ? 'Payment architecture' : 'Arquitetura de pagamento'}</p>
          <h2>{isEnglish ? 'Simple in Portugal. International by design.' : 'Simples em Portugal. Internacional por conceção.'}</h2>
          <div className="account-payment-methods">
            <span>MB WAY</span><span>Multibanco</span><span>Card</span><span>PayPal</span>
          </div>
          <p>{isEnglish ? 'These methods are only a design preview. No real payment is enabled yet.' : 'Estes métodos são apenas uma pré-visualização. Ainda não existe qualquer pagamento real ativo.'}</p>
        </div>
      </section>
    </AccountShell>
  );
}
