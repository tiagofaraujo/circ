import React from 'react';
import { Link } from 'react-router-dom';
import '../css/Footer.css';

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
          <a
            href="https://www.linkedin.com/company/circ-chuc/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="site-footer__social-mark" aria-hidden="true">in</span>
            LinkedIn <span aria-hidden="true">↗</span>
          </a>
          <span className="site-footer__hashtag">#CIRC2027</span>
          <span className="site-footer__hashtag">#CIRCoimbra</span>
          <span className="site-footer__hashtag">#Radiologia</span>
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
