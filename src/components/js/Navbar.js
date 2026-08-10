import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import '../css/Navbar.css';

const navItems = [
  { to: '/programa', label: 'Programa' },
  { to: '/participar', label: 'Participar' },
  { to: '/parcerias', label: 'Parcerias' },
  { to: '/coimbra', label: 'Coimbra' },
  { to: '/2025', label: 'CIRC 2025' },
];

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 18);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className={`site-header${isScrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header__inner">
        <Link className="brand" to="/" onClick={closeMenu} aria-label="CIRC 2027 — início">
          <img
            src="/logo.png"
            alt="CIRC — Congresso Internacional de Radiologia de Coimbra"
          />
        </Link>

        <nav className="desktop-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link is-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <Link className="header-cta" to="/contactos">
            <span>Contactos</span>
            <span className="header-cta__arrow" aria-hidden="true">↗</span>
          </Link>

          <button
            className={isOpen ? 'menu-toggle is-open' : 'menu-toggle'}
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            <span />
            <span />
          </button>
        </div>

        <div
          id="mobile-navigation"
          className={isOpen ? 'mobile-nav is-open' : 'mobile-nav'}
        >
          <div className="mobile-nav__meta">
            <span>CIRC 2027</span>
            <span>8–10 abril · Coimbra</span>
          </div>

          <Link to="/" onClick={closeMenu}>Início</Link>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={closeMenu}>
              {item.label}
            </NavLink>
          ))}
          <Link className="mobile-nav__contact" to="/contactos" onClick={closeMenu}>
            Contactos <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
