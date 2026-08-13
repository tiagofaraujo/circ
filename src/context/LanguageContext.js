import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LanguageContext = createContext({
  language: 'pt',
  setLanguage: () => {},
  toggleLanguage: () => {},
});

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'pt';

  const savedLanguage = window.localStorage.getItem('circ-language');
  return savedLanguage === 'en' ? 'en' : 'pt';
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem('circ-language', language);
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-PT';
    document.title =
      language === 'en'
        ? 'CIRC 2027 · 8–10 April · Coimbra'
        : 'CIRC 2027 · 8–10 abril · Coimbra';
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === 'pt' ? 'en' : 'pt')),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
