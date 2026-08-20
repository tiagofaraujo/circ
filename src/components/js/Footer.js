import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import '../css/Footer.css';

function SocialIcon({ name }) {
  if (name === 'Instagram') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.6" r="1.15" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'Facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4v2.2H7.3v3.2h2.8V22h3.4z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M6.4 8.3H3.2V21h3.2V8.3zM4.8 3A1.9 1.9 0 1 0 4.8 6.8 1.9 1.9 0 0 0 4.8 3zM20.9 13.8c0-3.9-2.1-5.8-4.9-5.8-2.2 0-3.2 1.2-3.8 2.1V8.3H9V21h3.2v-6.3c0-1.7.3-3.3 2.4-3.3 2 0 2.1 1.9 2.1 3.4V21h3.2v-7.2z" />
    </svg>
  );
}

const socialLinks = [
  { name: 'Facebook', url: 'https://www.facebook.com/circ.chuc/' },
  { name: 'Instagram', url: 'https://www.instagram.com/circ.chuc/' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/company/circ-chuc/' },
];

function Footer() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <img src="/logo.png" alt="CIRC" />
          <p>{en ? 'Coimbra International Radiology Congress' : 'Congresso Internacional de Radiologia de Coimbra'}</p>
          <strong>{en ? '8–10 April 2027 · Coimbra' : '8–10 abril 2027 · Coimbra'}</strong>
          <small className="site-footer__format">
            {en
              ? '8 April · Pre-Congress Course · 9–10 April · CIRC 2027'
              : '8 abril · Curso Pré-Congresso · 9–10 abril · CIRC 2027'}
          </small>
        </div>

        <div className="site-footer__column">
          <p className="footer-label">CIRC 2027</p>
          <Link to="/programa">{en ? 'Programme' : 'Programa'}</Link>
          <Link to="/participar">{en ? 'Attend' : 'Participar'}</Link>
          <Link to="/parcerias">{en ? 'Partners & Exhibition' : 'Parcerias & Exhibition'}</Link>
          <Link to="/coimbra">Coimbra</Link>
          <Link to="/conta">My CIRC</Link>
        </div>

        <div className="site-footer__column">
          <p className="footer-label">{en ? 'Organisation' : 'Organização'}</p>
          <Link to="/organizacao">Associação Hemisfério Disciplinado</Link>
          <Link to="/organizacao">{en ? 'Organising structure' : 'Estrutura organizadora'}</Link>
          <Link to="/contactos">{en ? 'Contact' : 'Contactos'}</Link>
          <span className="site-footer__muted">NIF 517 072 262 · Coimbra</span>
        </div>

        <div className="site-footer__column">
          <p className="footer-label">{en ? 'Archive & legal' : 'Arquivo & legal'}</p>
          <Link to="/2025">CIRC 2025</Link>
          <Link to="/regulamento">{en ? 'Event Regulation' : 'Regulamento do Evento'}</Link>
          <Link to="/privacidade">{en ? 'Privacy Policy' : 'Política de Privacidade'}</Link>
          <Link to="/cookies">{en ? 'Cookie Policy' : 'Política de Cookies'}</Link>
          <Link to="/termos">{en ? 'Terms of Use' : 'Termos de Utilização'}</Link>
        </div>

        <div className="site-footer__column site-footer__social">
          <p className="footer-label">{en ? 'CIRC online' : 'CIRC em rede'}</p>
          {socialLinks.map((social) => (
            <a href={social.url} target="_blank" rel="noopener noreferrer" key={social.name}>
              <span className="site-footer__social-mark" aria-hidden="true">
                <SocialIcon name={social.name} />
              </span>
              {social.name} <span aria-hidden="true">↗</span>
            </a>
          ))}
          <span className="site-footer__hashtag">#CIRC2027 · #CIRCoimbra · #Radiologia</span>
        </div>
      </div>

      <div className="site-footer__support">
        <span>{en ? 'With the support of' : 'Com apoio de'}</span>
        <img src="/cmc-logo-negative.png" alt="Câmara Municipal de Coimbra" />
      </div>

      <div className="site-footer__bottom">
        <span>
          {en
            ? '© 2027 CIRC · Coimbra International Radiology Congress'
            : '© 2027 CIRC · Congresso Internacional de Radiologia de Coimbra'}
        </span>
        <span>
          {en
            ? 'Organised by · Associação Hemisfério Disciplinado'
            : 'Organização · Associação Hemisfério Disciplinado'}
        </span>
      </div>
    </footer>
  );
}

export default Footer;
