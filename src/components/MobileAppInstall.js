import React, { useState } from 'react';
import { useMyCircInstall } from '../pwa/MyCircInstall';
import './MobileAppInstall.css';

export default function MobileAppInstall({ en }) {
  const { installed, prompt, install } = useMyCircInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (installed) return null;

  const handleInstall = () => {
    if (prompt) {
      install();
      return;
    }
    setShowInstructions((visible) => !visible);
  };

  return <section className="mobile-app-install" aria-labelledby="mobile-app-install-title">
    <div className="mobile-app-install__heading">
      <h2 id="mobile-app-install-title">My CIRC</h2>
      <p>{en ? 'The congress app.' : 'A app do congresso.'}</p>
    </div>
    <button className="mobile-app-install__button" type="button" onClick={handleInstall}
      aria-label={en ? 'Install My CIRC' : 'Instalar My CIRC'}
      aria-controls="mobile-app-install-instructions" aria-expanded={prompt ? undefined : showInstructions}>
      {en ? 'Install' : 'Instalar'}
    </button>
    <div id="mobile-app-install-instructions" className="mobile-app-install__instructions" hidden={!showInstructions}>
      <p><strong>iPhone / iPad:</strong> {en ? 'open this website in Safari, tap Share, then Add to Home Screen.' : 'abra este site no Safari, toque em Partilhar e depois em Adicionar ao ecrã principal.'}</p>
      <p><strong>Android:</strong> {en ? 'open this website in Chrome. In the browser menu, choose Install app or Add to Home Screen, if available.' : 'abra este site no Chrome. No menu do navegador, escolha Instalar aplicação ou Adicionar ao ecrã principal, se disponível.'}</p>
    </div>
  </section>;
}
