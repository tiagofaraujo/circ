import React, { useEffect, useState } from 'react';
import '../css/CookiesConsent.css';

function CookiesConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookies-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const savePreference = (value) => {
    localStorage.setItem('cookies-consent', value);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <aside className="cookies-consent" aria-label="Preferências de cookies">
      <div>
        <strong>Privacidade</strong>
        <p>
          Utilizamos tecnologias essenciais para o funcionamento do website e para
          memorizar esta preferência.
        </p>
      </div>
      <div className="cookies-consent-buttons">
        <button className="accept" type="button" onClick={() => savePreference('accepted')}>
          Aceitar
        </button>
        <button className="reject" type="button" onClick={() => savePreference('rejected')}>
          Rejeitar
        </button>
      </div>
    </aside>
  );
}

export default CookiesConsent;
