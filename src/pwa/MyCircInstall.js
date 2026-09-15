import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const InstallContext = createContext({ installed: false, prompt: null, install: async () => {} });

export function MyCircInstallProvider({ children }) {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const detect = () => setInstalled(mode.matches || navigator.standalone === true);
    const available = (event) => { event.preventDefault(); setPrompt(event); };
    const completed = () => { setInstalled(true); setPrompt(null); };
    detect();
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', completed);
    mode.addEventListener?.('change', detect);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', completed);
      mode.removeEventListener?.('change', detect);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    // The browser owns consent. A dismissed prompt must not be reused.
    const request = prompt;
    setPrompt(null);
    try {
      await request.prompt();
      await request.userChoice;
    } catch {
      // Keep the manual instructions available on unsupported browsers.
    }
  };

  return <InstallContext.Provider value={{ installed, prompt, install }}>{children}</InstallContext.Provider>;
}

export function useMyCircInstall() { return useContext(InstallContext); }

export function InstallMyCirc() {
  const { language } = useLanguage();
  const en = language === 'en';
  const { installed, prompt, install } = useMyCircInstall();
  if (installed) return null;
  return <section className="my-circ-install" aria-labelledby="my-circ-install-title">
    <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
    <div>
      <h2 id="my-circ-install-title">{en ? 'My CIRC, always at hand' : 'My CIRC, sempre à mão'}</h2>
      <p>{en ? 'Add it to your home screen. The same account, one tap away.' : 'Adicione ao ecrã principal. A mesma conta, à distância de um toque.'}</p>
      {prompt && <button className="my-circ-button" type="button" onClick={install}>{en ? 'Install My CIRC' : 'Instalar My CIRC'}</button>}
      <details>
        <summary>{en ? 'How to add to your device' : 'Como adicionar ao dispositivo'}</summary>
        <p>{en ? 'iPhone / iPad: open this website in Safari, choose Share and Add to Home Screen. Android / computer: in a supported browser, use Install app or Add to Home Screen in the browser menu.' : 'iPhone / iPad: abra este site no Safari, escolha Partilhar e Adicionar ao ecrã principal. Android / computador: num navegador compatível, use Instalar aplicação ou Adicionar ao ecrã principal no menu do navegador.'}</p>
        <p>{en ? 'An internet connection is needed to access and save your account data.' : 'É necessária ligação à internet para consultar e guardar os dados da sua conta.'}</p>
      </details>
    </div>
  </section>;
}
