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
  NotFoundPage,
  ParticipatePage,
  ProgramPage,
} from './pages/InfoPages';
import {
  EnhancedArchive2025Page,
  EnhancedCoimbraPage,
  EnhancedContactPage,
  EnhancedPartnersPage,
} from './pages/RecoveredContentPages';
import OrganizationPage2027 from './pages/OrganizationPage2027';
import {
  CookiesPolicyPage,
  EventRegulationPage,
  PrivacyPolicyPage,
  TermsOfUsePage,
} from './pages/LegalPages';
import { AccountRegistrationsPage } from './pages/AccountPages';
import ParticipantProfileFirebasePage from './pages/ParticipantProfileFirebasePage';
import AccountSecurityPage from './pages/AccountSecurityPage';
import RegisterWithPhotoPage from './pages/RegisterWithPhotoPage';
import {
  AuthenticatedAccountPage,
  ForgotPasswordPage,
  LoginPage,
} from './pages/AuthPages';

import './App.css';
import './event2027.css';
import './hero2027.css';
import './photo2025.css';

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
            <Route path="/parcerias" element={<EnhancedPartnersPage />} />
            <Route path="/coimbra" element={<EnhancedCoimbraPage />} />
            <Route path="/2025" element={<EnhancedArchive2025Page />} />
            <Route path="/organizacao" element={<OrganizationPage2027 />} />
            <Route path="/contactos" element={<EnhancedContactPage />} />

            <Route path="/privacidade" element={<PrivacyPolicyPage />} />
            <Route path="/cookies" element={<CookiesPolicyPage />} />
            <Route path="/termos" element={<TermsOfUsePage />} />
            <Route path="/regulamento" element={<EventRegulationPage />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/registar" element={<RegisterWithPhotoPage />} />
            <Route path="/recuperar-password" element={<ForgotPasswordPage />} />
            <Route
              path="/conta"
              element={
                <ProtectedRoute>
                  <AuthenticatedAccountPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/conta/perfil"
              element={
                <ProtectedRoute>
                  <ParticipantProfileFirebasePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/conta/seguranca"
              element={
                <ProtectedRoute>
                  <AccountSecurityPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/conta/inscricoes"
              element={
                <ProtectedRoute>
                  <AccountRegistrationsPage />
                </ProtectedRoute>
              }
            />

            <Route path="/schedule" element={<Navigate to="/programa" replace />} />
            <Route path="/exhibition" element={<Navigate to="/parcerias" replace />} />
            <Route path="/sponsors" element={<Navigate to="/parcerias" replace />} />
            <Route path="/hotels" element={<Navigate to="/coimbra" replace />} />
            <Route path="/contact" element={<Navigate to="/contactos" replace />} />

            <Route path="/ahd" element={<Navigate to="/organizacao" replace />} />
            <Route path="/org-commission" element={<Navigate to="/organizacao" replace />} />
            <Route path="/scient-commission" element={<Navigate to="/organizacao" replace />} />
            <Route path="/tec-commission" element={<Navigate to="/organizacao" replace />} />
            <Route path="/circ" element={<Navigate to="/2025" replace />} />
            <Route path="/gallery" element={<Navigate to="/2025" replace />} />
            <Route path="/event-regulation" element={<Navigate to="/regulamento" replace />} />
            <Route path="/privacy-policy" element={<Navigate to="/privacidade" replace />} />
            <Route path="/terms-of-use" element={<Navigate to="/termos" replace />} />
            <Route path="/cookies-policy" element={<Navigate to="/cookies" replace />} />

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
