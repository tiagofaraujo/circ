import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMyCircInstall } from '../pwa/MyCircInstall';
import './MobileAppInstall.css';

export default function MobileAppInstall({ en }) {
  const { installed, prompt, install } = useMyCircInstall();
  const instructions = useRef(null);

  if (installed) return null;

  const handleInstall = () => {
    if (prompt) {
      install();
      return;
    }
    instructions.current.open = true;
    instructions.current.querySelector('summary').focus();
  };

  return <section className="mobile-app-install" aria-labelledby="mobile-app-install-title">
    <div className="mobile-app-install__heading">
      <img src="/my-circ-icon-192.png" alt="" width="48" height="48" />
      <div>
        <p className="mobile-app-install__label">MY CIRC · APP</p>
        <h2 id="mobile-app-install-title">{en ? 'CIRC on your phone.' : 'O CIRC no seu telemóvel.'}</h2>
      </div>
    </div>
    <p className="mobile-app-install__description">{en ? 'Programme, registrations and submissions in My CIRC. Add the app to your home screen.' : 'Programa, inscrições e trabalhos no My CIRC. Adicione a app ao ecrã principal.'}</p>
    <button className="mobile-app-install__button" type="button" onClick={handleInstall}>
      <span>{en ? 'Install My CIRC' : 'Instalar My CIRC'}</span>
      <span aria-hidden="true">↓</span>
    </button>
    <div className="mobile-app-install__links">
      <Link to="/conta">{en ? 'Open My CIRC' : 'Abrir My CIRC'} <span aria-hidden="true">↗</span></Link>
      <span>{en ? 'iPhone and Android' : 'iPhone e Android'}</span>
    </div>
    <details ref={instructions} className="mobile-app-install__instructions">
      <summary>{en ? 'How to install' : 'Como instalar'}</summary>
      <p><strong>iPhone / iPad:</strong> {en ? 'open this website in Safari, tap Share, then Add to Home Screen.' : 'abra este site no Safari, toque em Partilhar e depois em Adicionar ao ecrã principal.'}</p>
      <p><strong>Android:</strong> {en ? 'open this website in Chrome. In the browser menu, choose Install app or Add to Home Screen, if available.' : 'abra este site no Chrome. No menu do navegador, escolha Instalar aplicação ou Adicionar ao ecrã principal, se disponível.'}</p>
      <p>{en ? 'Use your existing My CIRC account. An internet connection is required to access your data.' : 'Use a sua conta My CIRC habitual. É necessária ligação à internet para consultar os seus dados.'}</p>
    </details>
  </section>;
}
