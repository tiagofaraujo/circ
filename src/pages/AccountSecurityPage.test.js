import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountSecurityPage from './AccountSecurityPage';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

const setup = (language) => {
  const changePassword = jest.fn().mockRejectedValue({ code: 'auth/wrong-password' });
  const deleteAccount = jest.fn();
  useAuth.mockReturnValue({
    user: { providerData: [{ providerId: 'password' }] },
    changePassword,
    deleteAccount,
  });
  useLanguage.mockReturnValue({ language });
  render(<MemoryRouter><AccountSecurityPage /></MemoryRouter>);
  return { changePassword, deleteAccount };
};

beforeEach(() => jest.clearAllMocks());

test.each([
  ['pt', 'Palavra-passe atual', 'Nova palavra-passe', 'Confirmar nova palavra-passe', 'Alterar palavra-passe', 'A palavra-passe atual está incorreta.'],
  ['en', 'Current password', 'New password', 'Confirm new password', 'Change password', 'The current password is incorrect.'],
])('clears outdated password errors when correcting fields (%s)', async (language, currentLabel, newLabel, confirmLabel, buttonLabel, errorText) => {
  const { changePassword } = setup(language);
  const currentInputs = screen.getAllByLabelText(currentLabel);
  const current = currentInputs[0];
  const next = screen.getByLabelText(newLabel);
  const confirm = screen.getByLabelText(confirmLabel);

  fireEvent.change(current, { target: { value: 'old-password' } });
  fireEvent.change(next, { target: { value: 'new-password-123' } });
  fireEvent.change(confirm, { target: { value: 'new-password-123' } });
  fireEvent.click(screen.getByRole('button', { name: buttonLabel }));

  expect(await screen.findByRole('alert')).toHaveTextContent(errorText);
  expect(changePassword).toHaveBeenCalledTimes(1);
  fireEvent.change(current, { target: { value: 'corrected-password' } });
  expect(screen.queryByText(errorText)).not.toBeInTheDocument();
});

test.each([
  ['pt', 'Escreva ELIMINAR para confirmar', 'Eliminar conta permanentemente', 'Escreva ELIMINAR para confirmar.'],
  ['en', 'Type DELETE to confirm', 'Permanently delete account', 'Type DELETE to confirm.'],
])('clears obsolete account-deletion confirmation errors without deleting anything (%s)', (language, confirmLabel, buttonLabel, errorText) => {
  const { deleteAccount } = setup(language);
  fireEvent.click(screen.getByRole('button', { name: buttonLabel }));
  expect(screen.getByRole('alert')).toHaveTextContent(errorText);
  fireEvent.change(screen.getByLabelText(confirmLabel), { target: { value: 'not a valid confirmation' } });
  expect(screen.queryByText(errorText)).not.toBeInTheDocument();
  expect(deleteAccount).not.toHaveBeenCalled();
});
