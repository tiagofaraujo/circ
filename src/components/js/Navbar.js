import React, { useState } from 'react';
import { slide as Menu } from 'react-burger-menu';
import '../css/Navbar.css';

function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    return (
        <header className="navbar">
            <div className="logo-container">
                <a href="/">
                    <img src="/logo.png" alt="CIRC Logo" className="logo" />
                </a>
            </div>
            <nav className="main-nav">
                <ul className="nav-links">
                    <li><a href="/exhibition">EXHIBITION</a></li>
                    <li><a href="/schedule">PROGRAMA</a></li>
                    <li><a href="/sponsors">PARCERIAS</a></li>
                    <li><a href="/hotels">HOTEL/REST</a></li>
                    <li><a href="/contact">CONTACTOS</a></li>
                </ul>
                {/* Este botão só vai aparecer na versão desktop */}
                <a href="https://form.jotform.com/242143179037353" className="primary-btn desktop-only">
                    Inscrição
                </a>
            </nav>
            <div className="hamburger-menu">
                <Menu right isOpen={isOpen} onStateChange={({ isOpen }) => setIsOpen(isOpen)}>
                    <a className="menu-item" href="/">Início</a>
                    <a className="menu-item" href="/exhibition">Exhibition</a>
                    <a className="menu-item" href="/schedule">Programa</a>
                    <a className="menu-item" href="/sponsors">Parcerias</a>
                    <a className="menu-item" href="/hotels">Hotel/Rest</a>
                    <a className="menu-item" href="/contact">Contactos</a>
                    {/* Não incluir o botão de inscrição aqui no menu hamburger */}
                </Menu>
            </div>
        </header>
    );
}

export default Navbar;
