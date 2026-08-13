import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

import '../css/Navbar.css';

const navItems = [
  { to: '/programa', pt: 'Programa', en: 'Programme' },
  { to: '/participar', pt: 'Participar', en: 'Attend' },
  { to: '/parcerias', pt: 'Parcerias', en: 'Partners' },
  { to: '/coimbra', pt: 'Coimbra', en: 'Coimbra' },
  { to: '/2025', pt: 'CIRC 2025', en: 'CIRC 2025' },
];

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const isEnglish = language === 'en';

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="site-header">
      <Link
        className="brand"
        to="/"
        onClick={closeMenu}
        aria-label={isEnglish ? 'CIRC 2027 — home' : 'CIRC 2027 — início'}
      >
        <img
          src="/logo.png"
          alt="CIRC — Congresso Internacional de Radiologia de Coimbra"
        />
      </Link>

      <nav
        className="desktop-nav"
        aria-label={isEnglish ? 'Main navigation' : 'Navegação principal'}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
          >
            {isEnglish ? item.en : item.pt}
          </NavLink>
        ))}
      </nav>

      <div className="header-actions">
        <div
          className="language-switch"
          role="group"
          aria-label={isEnglish ? 'Website language' : 'Idioma do website'}
        >
          <button
            type="button"
            className={language === 'pt' ? 'is-active' : ''}
            onClick={() => setLanguage('pt')}
            aria-pressed={language === 'pt'}
          >
            PT
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            className={language === 'en' ? 'is-active' : ''}
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
          >
            EN
          </button>
        </div>

        <Link className="header-cta" to="/contactos">
          {isEnglish ? 'Contact' : 'Contactos'}
        </Link>
        <button
          className={isOpen ? 'menu-toggle is-open' : 'menu-toggle'}
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          aria-label={
            isOpen
              ? isEnglish
                ? 'Close menu'
                : 'Fechar menu'
              : isEnglish
                ? 'Open menu'
                : 'Abrir menu'
          }
        >
          <span />
          <span />
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={isOpen ? 'mobile-nav is-open' : 'mobile-nav'}
      >
        <p className="mobile-nav__title">
          {isEnglish ? 'CIRC 2027 · 8–10 April' : 'CIRC 2027 · 8–10 abril'}
        </p>
        <Link to="/" onClick={closeMenu}>{isEnglish ? 'Home' : 'Início'}</Link>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={closeMenu}>
            {isEnglish ? item.en : item.pt}
          </NavLink>
        ))}
        <Link to="/contactos" onClick={closeMenu}>{isEnglish ? 'Contact' : 'Contactos'}</Link>
      </div>
    </header>
  );
}

export default Navbar;
