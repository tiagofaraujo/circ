import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterWithPhotoPage from './RegisterWithPhotoPage';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));
jest.mock('../auth/profileStore', () => ({ saveParticipantProfile: jest.fn() }));

const registerWithEmail = jest.fn();
const showForm = (language = 'pt') => {
  useLanguage.mockReturnValue({ language });
  return render(<MemoryRouter><RegisterWithPhotoPage /></MemoryRouter>);
};

const enterRegistration = (en = false, confirmation = 'Secure987') => {
  fireEvent.change(screen.getByLabelText(en ? 'Full name' : 'Nome completo'), {
    target: { value: 'Participante Teste' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'participant@example.org' },
  });
  fireEvent.change(screen.getByLabelText(en ? 'Password' : 'Palavra-passe'), {
    target: { value: 'Secure123' },
  });
  fireEvent.change(screen.getByLabelText(en ? 'Confirm password' : 'Confirmar palavra-passe'), {
    target: { value: confirmation },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({
    user: null,
    configured: true,
    registerWithEmail,
    signInWithGoogle: jest.fn(),
  });
});

test.each([
  ['pt', 'As palavras-passe não coincidem.', 'Confirmar palavra-passe'],
  ['en', 'The passwords do not match.', 'Confirm password'],
])('clears an outdated password mismatch message when corrected in %s', (language, message, label) => {
  showForm(language);
  enterRegistration(language === 'en', 'Different987');
  fireEvent.submit(screen.getByRole('button', { name: language === 'en' ? 'Create account' : 'Criar conta' }).closest('form'));

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  fireEvent.change(screen.getByLabelText(label), { target: { value: 'Secure123' } });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(registerWithEmail).not.toHaveBeenCalled();
});

test('clears an old provider error after the participant changes the email', async () => {
  registerWithEmail.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
  showForm();
  enterRegistration();
  fireEvent.submit(screen.getByRole('button', { name: 'Criar conta' }).closest('form'));

  expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma conta associada a este email.');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.org' } });

  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(registerWithEmail).toHaveBeenCalledTimes(1);
});
