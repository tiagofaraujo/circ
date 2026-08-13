import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import '../css/CookiesConsent.css';

function CookiesConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const { language } = useLanguage();
  const en = language === 'en';

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
    <aside className="cookies-consent" aria-label={en ? 'Cookie preferences' : 'Preferências de cookies'}>
      <div>
        <strong>{en ? 'Privacy' : 'Privacidade'}</strong>
        <p>
          {en
            ? 'We use essential technologies required for the website to function and to remember this preference.'
            : 'Utilizamos tecnologias essenciais para o funcionamento do website e para memorizar esta preferência.'}
        </p>
      </div>
      <div className="cookies-consent-buttons">
        <button className="accept" type="button" onClick={() => savePreference('accepted')}>
          {en ? 'Accept' : 'Aceitar'}
        </button>
        <button className="reject" type="button" onClick={() => savePreference('rejected')}>
          {en ? 'Reject' : 'Rejeitar'}
        </button>
      </div>
    </aside>
  );
}

export default CookiesConsent;
