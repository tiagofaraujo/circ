import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from './AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/conta/submissoes']}>
      <Routes>
        <Route path="/conta/submissoes" element={<ProtectedRoute><p>Personal content</p></ProtectedRoute>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useLanguage.mockReturnValue({ language: 'pt' });
});

test.each([
  ['pt', 'A validar a sua sessão…'],
  ['en', 'Checking your session…'],
])('shows session loading feedback in %s', (language, text) => {
  useAuth.mockReturnValue({ user: null, loading: true });
  useLanguage.mockReturnValue({ language });
  renderRoute();
  expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByText(text).closest('[aria-live="polite"]')).toBeInTheDocument();
  expect(screen.queryByText('Personal content')).not.toBeInTheDocument();
});

test('redirects an unauthenticated participant to login', () => {
  useAuth.mockReturnValue({ user: null, loading: false });
  renderRoute();
  expect(screen.getByText('Login page')).toBeInTheDocument();
});

test('keeps authenticated participant content available', () => {
  useAuth.mockReturnValue({ user: { uid: 'participant-1' }, loading: false });
  renderRoute();
  expect(screen.getByText('Personal content')).toBeInTheDocument();
});
