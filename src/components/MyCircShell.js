import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMyCircInstall } from '../pwa/MyCircInstall';

export function AppIcon({ name, className = '' }) {
  return <i className={`fa-solid fa-${name} ${className}`} aria-hidden="true" />;
}

const accountLinks = [
  ['/conta', 'house', 'Início', 'Home'],
  ['/conta/programa', 'calendar-days', 'Programa', 'Programme'],
  ['/conta/inscricoes', 'ticket', 'Inscrições', 'Registration'],
  ['/conta/submissoes', 'file-lines', 'Trabalhos', 'Submissions'],
  ['/conta/perfil', 'user', 'Perfil', 'Profile'],
];

export default function MyCircShell({ children }) {
  const { user, signOut } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const en = language === 'en';
  const navigate = useNavigate();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { installed } = useMyCircInstall();

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      setError(en ? 'Could not sign out. Please try again.' : 'Não foi possível terminar a sessão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const links = accountLinks.map(([to, icon, pt, english]) => (
    <NavLink key={to} to={to} end={to === '/conta'} className={({ isActive }) => isActive ? 'is-active' : ''}>
      <AppIcon name={icon} /><span>{en ? english : pt}</span>
    </NavLink>
  ));

  return (
    <div className={`my-circ-app${user ? ' my-circ-app--signed-in' : ''}`}>
      <a className="my-circ-skip" href="#my-circ-content">{en ? 'Skip to content' : 'Saltar para o conteúdo'}</a>
      <header className="my-circ-topbar">
        <Link className="my-circ-brand" to={user ? '/conta' : '/login'} aria-label="My CIRC">
          <img src="/logo.png" alt="CIRC" width="151" height="43" />
          <span>MY CIRC</span>
        </Link>
        <div className="my-circ-topbar__actions">
          <button type="button" className="my-circ-language" onClick={toggleLanguage} aria-label={en ? 'Mudar para português' : 'Switch to English'}>
            <span className={en ? '' : 'is-current'}>PT</span><span aria-hidden="true">/</span><span className={en ? 'is-current' : ''}>EN</span>
          </button>
          {user ? <>
            <Link className="my-circ-avatar" to="/conta/perfil" aria-label={en ? 'Your profile' : 'O seu perfil'}>
              {(user.displayName || user.email || 'C').trim().slice(0, 1).toUpperCase()}
            </Link>
            <button className="my-circ-icon-button" type="button" onClick={logout} disabled={busy} aria-label={en ? 'Sign out' : 'Terminar sessão'} title={en ? 'Sign out' : 'Terminar sessão'}>
              <AppIcon name="arrow-right-from-bracket" />
            </button>
          </> : <Link className="my-circ-site-link" to="/">{en ? 'CIRC website' : 'Website CIRC'} <AppIcon name="arrow-up-right-from-square" /></Link>}
        </div>
      </header>

      {user && <aside className="my-circ-sidebar">
        <p className="my-circ-label">{en ? 'Your space' : 'O seu espaço'}</p>
        <nav aria-label={en ? 'Main navigation' : 'Navegação principal'}>{links}</nav>
        <div className="my-circ-sidebar__support">
          <NavLink to="/conta/seguranca"><AppIcon name="shield-halved" />{en ? 'Security' : 'Segurança'}</NavLink>
          <Link to="/contactos"><AppIcon name="circle-question" />{en ? 'Help & contacts' : 'Ajuda e contactos'}</Link>
          <Link to="/"><AppIcon name="arrow-up-right-from-square" />{en ? 'CIRC website' : 'Website CIRC'}</Link>
        </div>
        <div className="my-circ-sidebar__edition"><strong>2027<span>↗</span></strong><p>Imaging Scientific Talks</p><span>Coimbra · {en ? '8–10 April' : '8–10 abril'}</span></div>
      </aside>}

      <div key={user?.uid || 'guest'} className="my-circ-content" id="my-circ-content" tabIndex="-1">
        {!online && <div className="my-circ-notice" role="status"><AppIcon name="wifi" /><span>{en ? 'You are offline. Keep this page open and reconnect before saving or submitting.' : 'Está sem ligação. Mantenha esta página aberta e volte a ligar-se antes de guardar ou submeter.'}</span></div>}
        {error && <div className="my-circ-notice" role="alert">{error}</div>}
        {children}
        <footer className="my-circ-footer"><span>My CIRC {installed ? '· App' : ''}</span><Link to="/privacidade">{en ? 'Privacy' : 'Privacidade'}</Link><Link to="/contactos">{en ? 'Need help?' : 'Precisa de ajuda?'}</Link></footer>
      </div>
      {user && <nav className="my-circ-bottomnav" aria-label={en ? 'Mobile navigation' : 'Navegação no telemóvel'}>{links}</nav>}
    </div>
  );
}
