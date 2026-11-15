import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { subscribeCompanyRegistration } from '../auth/companyVouchers';

export function CompanyRegistrationGate({ children }) {
  const { user } = useAuth();
  const [registration, setRegistration] = useState(null);
  const [lookup, setLookup] = useState('loading');
  useEffect(() => {
    setRegistration(null);
    if (!user?.emailVerified) { setLookup('ready'); return undefined; }
    setLookup('loading');
    return subscribeCompanyRegistration(user, (value) => { setRegistration(value); setLookup('ready'); }, () => setLookup('error'));
  }, [user]);
  if (lookup === 'loading') return <p role="status">A consultar a sua inscrição…</p>;
  if (lookup === 'error') return <p role="alert">Não foi possível consultar a inscrição. Atualize a página para tentar novamente.</p>;
  if (registration && registration.userId === user?.uid) return children(registration);
  return children(null);
}
