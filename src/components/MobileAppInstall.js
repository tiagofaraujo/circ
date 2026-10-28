import React, { useState } from 'react';
import { useMyCircInstall } from '../pwa/MyCircInstall';
import './MobileAppInstall.css';

export default function MobileAppInstall({ en }) {
  const { installed, prompt, install } = useMyCircInstall();
  const [showInstructions, setShowInstructions] = useState(false);
  const android = /Android/i.test(navigator.userAgent);
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Public homepage only: never pass account URLs, tokens or form state to another app.
  const chromeUrl = 'intent://circ-coimbra.org/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcirc-coimbra.org%2F;end';

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
      {android ? <>
        <p>{en ? 'If you opened this page inside another app, open it in Chrome to install My CIRC.' : 'Se abriu esta página dentro de outra app, abra no Chrome para instalar o My CIRC.'}</p>
        <a className="mobile-app-install__chrome" href={chromeUrl}>{en ? 'Open in Chrome' : 'Abrir no Chrome'} <span aria-hidden="true">↗</span></a>
        <p>{en ? 'In Chrome, tap Install and confirm. If the prompt is unavailable, use the browser menu (⋮) → Install app or Add to Home Screen.' : 'No Chrome, toque em Instalar e confirme. Se a janela não aparecer, use o menu do navegador (⋮) → Instalar aplicação ou Adicionar ao ecrã principal.'}</p>
        <p>{en ? 'If this link is blocked, use this browser’s menu → Open in Chrome.' : 'Se esta ligação for bloqueada, use o menu deste navegador → Abrir no Chrome.'}</p>
      </> : ios ? <p>{en ? 'On iPhone / iPad, open this website in Safari, tap Share → Add to Home Screen and confirm.' : 'No iPhone / iPad, abra este site no Safari, toque em Partilhar → Adicionar ao ecrã principal e confirme.'}</p> : <p>{en ? 'Open this website in your phone’s browser. On Android, use the menu → Install app. On iPhone, use Share → Add to Home Screen. Installation always requires your confirmation.' : 'Abra este site no navegador do telemóvel. No Android, use o menu → Instalar aplicação. No iPhone, use Partilhar → Adicionar ao ecrã principal. A instalação exige sempre a sua confirmação.'}</p>}
    </div>
  </section>;
}
