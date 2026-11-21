import { readPreference, savePreference } from '../utils/discovery';
import { pageTitle } from '../utils/pageTitle';
import { useLocation } from 'react-router-dom';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LanguageContext = createContext({
  language: 'pt',
  setLanguage: () => {},
  toggleLanguage: () => {},
});

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'pt';

  const savedLanguage = readPreference('circ-language');
  return savedLanguage === 'en' ? 'en' : 'pt';
}

export function LanguageProvider({ children }) {
  const { pathname } = useLocation();
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    savePreference('circ-language', language);
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-PT';
    document.title = pageTitle(pathname, language);
  }, [language, pathname]);

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
