import React from 'react';
import { Link } from 'react-router-dom';
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
  {
    name: 'Facebook',
    url: 'https://www.facebook.com/circ.chuc/',
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/circ.chuc/',
  },
  {
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/company/circ-chuc/',
  },
];

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <img src="/logo.png" alt="CIRC" />
          <p>Congresso Internacional de Radiologia de Coimbra</p>
          <strong>8–10 abril 2027 · Coimbra</strong>
          <small className="site-footer__format">8 abril · Curso Pré-Congresso · 9–10 abril · CIRC 2027</small>
        </div>

        <div className="site-footer__column">
          <p className="footer-label">CIRC 2027</p>
          <Link to="/programa">Programa</Link>
          <Link to="/participar">Participar</Link>
          <Link to="/parcerias">Parcerias</Link>
          <Link to="/coimbra">Coimbra</Link>
        </div>

        <div className="site-footer__column">
          <p className="footer-label">Arquivo e apoio</p>
          <Link to="/2025">CIRC 2025</Link>
          <Link to="/contactos">Contactos</Link>
          <span>Com apoio do Município de Coimbra</span>
        </div>

        <div className="site-footer__column site-footer__social">
          <p className="footer-label">CIRC em rede</p>
          {socialLinks.map((social) => (
            <a
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              key={social.name}
            >
              <span className="site-footer__social-mark" aria-hidden="true">
                <SocialIcon name={social.name} />
              </span>
              {social.name} <span aria-hidden="true">↗</span>
            </a>
          ))}
          <span className="site-footer__hashtag">#CIRC2027 · #CIRCoimbra · #Radiologia</span>
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>© 2027 CIRC · Congresso Internacional de Radiologia de Coimbra</span>
        <span>Organização · Associação Hemisfério Disciplinado</span>
      </div>
    </footer>
  );
}

export default Footer;
