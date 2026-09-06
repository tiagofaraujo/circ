import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadParticipantProfileResult } from '../auth/profileStore';
import { subscribeToUserSubmissions } from '../auth/adminOperationsStore';
import { useLanguage } from '../context/LanguageContext';
import { AppIcon } from '../components/MyCircShell';
import { InstallMyCirc } from '../pwa/MyCircInstall';

const statuses = {
  draft: ['Rascunho', 'Draft'], submitted: ['Submetido', 'Submitted'],
  under_review: ['Em avaliação', 'Under review'], revisions: ['Em revisão', 'Revisions'],
  accepted: ['Aceite', 'Accepted'], rejected: ['Não aceite', 'Not accepted'],
};

export default function MyCircHome() {
  const { user, access, resendVerification } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState('loading');
  const [works, setWorks] = useState([]);
  const [workState, setWorkState] = useState('loading');
  const [verificationState, setVerificationState] = useState('idle');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setProfileState('loading');
    loadParticipantProfileResult(user).then((result) => {
      if (!active) return;
      // Never turn partial authentication/local data into a misleading percentage.
      setProfile(result.source === 'firestore' ? result : null);
      setProfileState(result.source === 'firestore' ? 'ready' : result.source === 'empty' ? 'empty' : 'error');
    }).catch(() => { if (active) setProfileState('error'); });
    return () => { active = false; };
  }, [user, reload]);

  useEffect(() => {
    let active = true;
    setWorks([]);
    setWorkState('loading');
    const unsubscribe = subscribeToUserSubmissions(user.uid,
      (items) => { if (active) { setWorks(items); setWorkState('ready'); } },
      () => { if (active) setWorkState('error'); }
    );
    return () => { active = false; unsubscribe(); };
  }, [user.uid, reload]);

  const verify = async () => {
    setVerificationState('sending');
    try { await resendVerification(language); setVerificationState('sent'); }
    catch { setVerificationState('error'); }
  };
  const name = (profile?.profile?.name || user.displayName || '').trim().split(/\s+/)[0];
  const completion = profile?.completion?.percentage;
  const modules = [
    access?.canManageRegistrations && ['/admin', 'users', 'Gestão de inscrições', 'Registration management'],
    access?.canManageSubmissions && ['/admin/submissoes', 'clipboard-check', 'Gestão de submissões', 'Submission management'],
    access?.canUseSecretariat && ['/admin/secretariado', 'id-card', 'Secretariado', 'Event desk'],
  ].filter(Boolean);

  return <main className="my-circ-home">
    <header className="my-circ-welcome">
      <div><p className="my-circ-label">{en ? 'Your CIRC starts here' : 'O seu CIRC começa aqui'}</p><h1>{en ? 'Hello' : 'Olá'}{name ? `, ${name}` : ''}<span>.</span></h1><p>{en ? 'Your participation, all in one place.' : 'A sua participação, num só lugar.'}</p></div>
      <span className="my-circ-edition">COIMBRA <strong>2027</strong></span>
    </header>

    {!user.emailVerified && user.providerData?.some((provider) => provider.providerId === 'password') && <section className="my-circ-notice my-circ-notice--verification">
      <AppIcon name="envelope" /><div><strong>{en ? 'Confirm your email' : 'Confirme o seu email'}</strong><p>{en ? 'Check your inbox and spam folder for the verification message.' : 'Procure a mensagem de verificação na caixa de entrada e na pasta de spam.'}</p>
        <button type="button" onClick={verify} disabled={verificationState === 'sending' || verificationState === 'sent'}>{verificationState === 'sent' ? (en ? 'Email resent' : 'Email reenviado') : verificationState === 'sending' ? (en ? 'Sending…' : 'A enviar…') : (en ? 'Resend verification' : 'Reenviar verificação')}</button>
        {verificationState === 'error' && <p role="alert">{en ? 'Could not send the email. Wait a moment and try again.' : 'Não foi possível enviar o email. Aguarde um momento e tente novamente.'}</p>}
      </div>
    </section>}

    <section className="my-circ-quicklinks" aria-label={en ? 'Your participation' : 'A sua participação'}>
      <Link to="/conta/inscricoes"><span className="my-circ-quicklinks__icon"><AppIcon name="ticket" /></span><div><h2>{en ? 'Registrations' : 'Inscrições'}</h2><p>{en ? 'Congress, courses and dinner' : 'Congresso, cursos e jantar'}</p></div><AppIcon name="chevron-right" /></Link>
      <Link to="/conta/submissoes"><span className="my-circ-quicklinks__icon"><AppIcon name="file-lines" /></span><div><h2>{en ? 'My submissions' : 'Os meus trabalhos'}</h2><p>{en ? 'Drafts, submissions and PDFs' : 'Rascunhos, submissões e PDFs'}</p></div><AppIcon name="chevron-right" /></Link>
    </section>

    <div className="my-circ-home-grid">
      <section className="my-circ-event" aria-labelledby="my-circ-event-title">
        <div className="my-circ-event__image"><img src="/circ-hero-convento-2025.webp" alt={en ? 'CIRC at Convento São Francisco, Coimbra' : 'CIRC no Convento São Francisco, Coimbra'} width="900" height="600" /><span>Imaging Scientific Talks</span></div>
        <div className="my-circ-event__body"><p className="my-circ-label">{en ? 'Next edition' : 'Próxima edição'}</p><h2 id="my-circ-event-title">CIRC <span>2027</span></h2><p className="my-circ-event__date"><AppIcon name="calendar-days" />{en ? '8–10 April · Coimbra' : '8–10 abril · Coimbra'}</p><p>{en ? 'Pre-Congress Courses · 8 April' : 'Cursos Pré-Congresso · 8 abril'}<br />{en ? 'International Congress · 9–10 April' : 'Congresso Internacional · 9–10 abril'}</p><Link className="my-circ-button" to="/conta/programa">{en ? 'Explore programme' : 'Explorar programa'}<AppIcon name="arrow-right" /></Link></div>
      </section>

      <section className="my-circ-profile-card" aria-labelledby="my-circ-profile-title">
        <div className="my-circ-card-heading"><AppIcon name="user" /><span className="my-circ-label">{en ? 'Your profile' : 'O seu perfil'}</span></div>
        <h2 id="my-circ-profile-title">{completion === 100 ? (en ? 'All set.' : 'Tudo pronto.') : (en ? 'Your details, up to date.' : 'Os seus dados, em dia.')}</h2>
        <p>{en ? 'Personal, professional and billing information.' : 'Informação pessoal, profissional e de faturação.'}</p>
        <div className="my-circ-profile-card__progress" aria-live="polite">
          {profileState === 'loading' ? <p>{en ? 'Checking your profile…' : 'A consultar o seu perfil…'}</p> : profileState === 'ready' ? <><div><span>{en ? 'Profile complete' : 'Perfil completo'}</span><strong>{completion}%</strong></div><progress max="100" value={completion} aria-label={en ? 'Profile completion' : 'Preenchimento do perfil'} /></> : <p>{profileState === 'empty' ? (en ? 'Complete your profile before registering.' : 'Complete o perfil antes de se inscrever.') : (en ? 'Could not confirm your profile details.' : 'Não foi possível confirmar os dados do perfil.')}{profileState === 'error' && <button type="button" onClick={() => setReload((n) => n + 1)}>{en ? 'Try again' : 'Tentar novamente'}</button>}</p>}
        </div>
        <Link className="my-circ-text-link" to="/conta/perfil">{en ? 'Review profile' : 'Rever perfil'}<AppIcon name="arrow-right" /></Link>
      </section>
    </div>

    <section className="my-circ-activity" aria-labelledby="my-circ-activity-title">
      <header className="my-circ-section-heading"><h2 id="my-circ-activity-title">{en ? 'Your latest work' : 'O seu último trabalho'}</h2><Link to="/conta/submissoes">{en ? 'View all' : 'Ver todos'}<AppIcon name="arrow-right" /></Link></header>
      {workState === 'loading' ? <p role="status">{en ? 'Loading your submissions…' : 'A carregar os seus trabalhos…'}</p> : workState === 'error' ? <div role="status"><p>{en ? 'Your submissions could not be loaded. No data has been changed.' : 'Não foi possível carregar os trabalhos. Nenhum dado foi alterado.'}</p><button className="my-circ-text-link" type="button" onClick={() => setReload((n) => n + 1)}>{en ? 'Try again' : 'Tentar novamente'}</button></div> : works.length ? <Link className="my-circ-recent-work" to="/conta/submissoes#my-works"><AppIcon name="file-lines" /><div><p className="my-circ-label">{works[0].code || (en ? 'Scientific work' : 'Trabalho científico')}{works[0].isTest ? (en ? ' · Test' : ' · Teste') : ''}</p><h3>{works[0].title || (en ? 'Untitled draft' : 'Rascunho sem título')}</h3><span className="my-circ-status">{statuses[works[0].status]?.[en ? 1 : 0] || (en ? 'Recorded' : 'Registado')}</span></div><AppIcon name="chevron-right" /></Link> : <div className="my-circ-empty"><AppIcon name="file-circle-plus" /><div><h3>{en ? 'Space for your next idea.' : 'Espaço para a sua próxima ideia.'}</h3><p>{en ? 'Your saved work will appear here. Check the submission centre for dates and available options.' : 'Os trabalhos guardados aparecerão aqui. Consulte as datas e opções disponíveis no centro de submissões.'}</p></div></div>}
    </section>

    {modules.length > 0 && <section className="my-circ-management" aria-labelledby="my-circ-management-title"><header className="my-circ-section-heading"><h2 id="my-circ-management-title">{en ? 'Management area' : 'Área de gestão'}</h2><span>{en ? 'Your permissions' : 'As suas permissões'}</span></header><div>{modules.map(([to, icon, pt, english]) => <Link to={to} key={to}><AppIcon name={icon} /><span>{en ? english : pt}</span><AppIcon name="arrow-right" /></Link>)}</div></section>}

    <InstallMyCirc />
    <div className="my-circ-useful"><Link to="/coimbra"><AppIcon name="location-dot" />{en ? 'Discover Coimbra' : 'Descobrir Coimbra'}</Link><Link to="/conta/seguranca"><AppIcon name="shield-halved" />{en ? 'Account security' : 'Segurança da conta'}</Link></div>
  </main>;
}
