import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { slide as Menu } from 'react-burger-menu';

import '../css/Navbar.css';

function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <header className="navbar">
      <div className="logo-container">
        <Link to="/" onClick={closeMenu}>
          <img
            src="/logo.png"
            alt="CIRC — Congresso Internacional de Radiologia de Coimbra"
            className="logo"
          />
        </Link>
      </div>

      <nav className="main-nav">
        <ul className="nav-links">
          <li>
            <Link to="/exhibition">EXHIBITION</Link>
          </li>

          <li>
            <Link to="/schedule">PROGRAMA</Link>
          </li>

          <li>
            <Link to="/sponsors">PARCERIAS</Link>
          </li>

          <li>
            <Link to="/hotels">HOTEL/REST</Link>
          </li>

          <li>
            <Link to="/contact">CONTACTOS</Link>
          </li>
        </ul>

        <a
          href="https://form.jotform.com/242143179037353"
          className="primary-btn desktop-only"
          target="_blank"
          rel="noopener noreferrer"
        >
          Inscrição
        </a>
      </nav>

      <div className="hamburger-menu">
        <Menu
          right
          isOpen={isOpen}
          onStateChange={({ isOpen: menuIsOpen }) =>
            setIsOpen(menuIsOpen)
          }
        >
          <Link className="menu-item" to="/" onClick={closeMenu}>
            Início
          </Link>

          <Link
            className="menu-item"
            to="/exhibition"
            onClick={closeMenu}
          >
            Exhibition
          </Link>

          <Link
            className="menu-item"
            to="/schedule"
            onClick={closeMenu}
          >
            Programa
          </Link>

          <Link
            className="menu-item"
            to="/sponsors"
            onClick={closeMenu}
          >
            Parcerias
          </Link>

          <Link
            className="menu-item"
            to="/hotels"
            onClick={closeMenu}
          >
            Hotel/Rest
          </Link>

          <Link
            className="menu-item"
            to="/contact"
            onClick={closeMenu}
          >
            Contactos
          </Link>
        </Menu>
      </div>
    </header>
  );
}

export default Navbar;
