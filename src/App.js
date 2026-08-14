import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './components/js/Navbar';
import Footer from './components/js/Footer';
import CookiesConsent from './components/js/CookiesConsent';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';

import Home from './pages/Home';
import {
  Archive2025Page,
  CoimbraPage,
  ContactPage,
  NotFoundPage,
  PartnersPage,
  ParticipatePage,
  ProgramPage,
} from './pages/InfoPages';
import {
  AccountOverviewPage,
  AccountProfilePage,
  AccountRegistrationsPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
} from './pages/SecureAccountPages';

import './App.css';
import './event2027.css';
import './hero2027.css';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="App">
          <ScrollToTop />
          <Navbar />

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/2027" element={<Navigate to="/" replace />} />
            <Route path="/programa" element={<ProgramPage />} />
            <Route path="/participar" element={<ParticipatePage />} />
            <Route path="/parcerias" element={<PartnersPage />} />
            <Route path="/coimbra" element={<CoimbraPage />} />
            <Route path="/2025" element={<Archive2025Page />} />
            <Route path="/contactos" element={<ContactPage />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/registar" element={<RegisterPage />} />
            <Route path="/recuperar-password" element={<ForgotPasswordPage />} />
            <Route
              path="/conta"
              element={<ProtectedRoute><AccountOverviewPage /></ProtectedRoute>}
            />
            <Route
              path="/conta/perfil"
              element={<ProtectedRoute><AccountProfilePage /></ProtectedRoute>}
            />
            <Route
              path="/conta/inscricoes"
              element={<ProtectedRoute><AccountRegistrationsPage /></ProtectedRoute>}
            />

            <Route path="/schedule" element={<Navigate to="/programa" replace />} />
            <Route path="/exhibition" element={<Navigate to="/parcerias" replace />} />
            <Route path="/sponsors" element={<Navigate to="/parcerias" replace />} />
            <Route path="/hotels" element={<Navigate to="/coimbra" replace />} />
            <Route path="/contact" element={<Navigate to="/contactos" replace />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>

          <Footer />
          <CookiesConsent />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
