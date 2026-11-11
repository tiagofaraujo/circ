import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './AuthPages';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

const copy = {
  pt: {
    password: 'Palavra-passe',
    submit: 'Entrar',
    error: 'Email ou palavra-passe incorretos.',
  },
  en: {
    password: 'Password',
    submit: 'Sign in',
    error: 'Incorrect email or password.',
  },
};

test.each(['pt', 'en'])('clears stale %s login errors when either credential is corrected', async (language) => {
  const signInWithEmail = jest.fn().mockRejectedValue({ code: 'auth/invalid-credential' });
  useAuth.mockReturnValue({
    configured: true,
    user: null,
    signInWithEmail,
    signInWithGoogle: jest.fn(),
  });
  useLanguage.mockReturnValue({ language });

  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  const emailField = screen.getByLabelText('Email');
  const passwordField = screen.getByLabelText(copy[language].password);
  const signInButton = screen.getByRole('button', { name: copy[language].submit });

  fireEvent.change(emailField, { target: { value: 'autor@example.com' } });
  fireEvent.change(passwordField, { target: { value: 'senha-antiga' } });
  fireEvent.click(signInButton);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy[language].error);
  expect(signInWithEmail).toHaveBeenCalledTimes(1);

  fireEvent.change(emailField, { target: { value: 'autor.corrigido@example.com' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  await waitFor(() => expect(signInButton).toBeEnabled());
  fireEvent.click(signInButton);
  expect(await screen.findByRole('alert')).toHaveTextContent(copy[language].error);
  expect(signInWithEmail).toHaveBeenCalledTimes(2);

  fireEvent.change(passwordField, { target: { value: 'senha-corrigida' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
