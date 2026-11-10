import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useLanguage } from '../context/LanguageContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <main className="auth-loading" aria-live="polite">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <p>{language === 'en' ? 'Checking your session…' : 'A validar a sua sessão…'}</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }

  return children;
}

export default ProtectedRoute;
