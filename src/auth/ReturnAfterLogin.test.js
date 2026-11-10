import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import { useAuth } from './AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

function LoginReturnLocation() {
  const location = useLocation();
  return <output data-testid="login-return">{location.state?.from || 'missing'}</output>;
}

function showPath(path) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/conta/inscricoes"
          element={<ProtectedRoute><h1>Participant registrations</h1></ProtectedRoute>}
        />
        <Route
          path="/admin"
          element={<AdminRoute permission="registrationReports"><h1>Registration reports</h1></AdminRoute>}
        />
        <Route path="/login" element={<LoginReturnLocation />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: null, loading: false, access: {} });
  useLanguage.mockReturnValue({ language: 'pt' });
});

test.each([
  ['/conta/inscricoes?origem=programa#detalhes'],
  ['/admin?painel=perfis&origem=gestao#lista'],
  ['/conta/inscricoes'],
])('an unauthenticated visit to %s keeps its full internal return URL', (path) => {
  showPath(path);
  expect(screen.getByTestId('login-return')).toHaveTextContent(path);
});

test('a signed-in participant continues directly to the requested page', () => {
  useAuth.mockReturnValue({ user: { uid: 'participant' }, loading: false, access: {} });
  showPath('/conta/inscricoes?origem=programa#detalhes');
  expect(screen.getByRole('heading', { name: 'Participant registrations' })).toBeInTheDocument();
  expect(screen.queryByTestId('login-return')).not.toBeInTheDocument();
});

test('an authorized report reader continues directly to the requested admin panel', () => {
  useAuth.mockReturnValue({ user: { uid: 'report-reader' }, loading: false, access: { canViewRegistrations: true } });
  showPath('/admin?painel=perfis#lista');
  expect(screen.getByRole('heading', { name: 'Registration reports' })).toBeInTheDocument();
  expect(screen.queryByTestId('login-return')).not.toBeInTheDocument();
});
