import { getUserAccess } from '../auth/firebaseClient';
import AdminModuleNav from './AdminModuleNav';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyCircShell from './MyCircShell';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMyCircInstall } from '../pwa/MyCircInstall';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));
jest.mock('../pwa/MyCircInstall', () => ({ useMyCircInstall: jest.fn() }));

beforeEach(() => {
  useAuth.mockReturnValue({ user: null, access: {}, isAdmin: false, signOut: jest.fn() });
  useMyCircInstall.mockReturnValue({ installed: false });
});

test.each([
  ['pt', 'Mudar para inglês'],
  ['en', 'Switch to Portuguese'],
])('the My CIRC language button uses the current UI language (%s)', (language, label) => {
  const toggleLanguage = jest.fn();
  useLanguage.mockReturnValue({ language, toggleLanguage });

  render(<MemoryRouter><MyCircShell><p>My CIRC</p></MyCircShell></MemoryRouter>);

  const button = screen.getByRole('button', { name: label });
  fireEvent.click(button);
  expect(toggleLanguage).toHaveBeenCalledTimes(1);
});

test('the delegated manager sees only the two authorised management modules in both navigations', () => {
  const user = { uid: 'paulo', email: 'paulojaneiro77@gmail.com', emailVerified: true };
  useAuth.mockReturnValue({ user, access: getUserAccess(user), isAdmin: false, signOut: jest.fn() });
  useLanguage.mockReturnValue({ language: 'pt', toggleLanguage: jest.fn() });
  render(<MemoryRouter><MyCircShell><AdminModuleNav /></MyCircShell></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Gestão de inscrições' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Faturação/ })).toHaveLength(2);
  expect(screen.queryByRole('link', { name: /Empresas e vouchers|Transferências|Gestão de submissões|Secretariado|Estudantes/ })).not.toBeInTheDocument();
});

test('mobile options reuse only authorised modules and Escape restores focus', () => {
  const user = { uid: 'paulo', email: 'paulojaneiro77@gmail.com', emailVerified: true };
  useAuth.mockReturnValue({ user, access: getUserAccess(user), isAdmin: false, signOut: jest.fn() });
  useLanguage.mockReturnValue({ language: 'pt', toggleLanguage: jest.fn() });
  render(<MemoryRouter><MyCircShell><p>Conta</p></MyCircShell></MemoryRouter>);
  const toggle = screen.getByRole('button', { name: 'Mais opções' });
  fireEvent.click(toggle);
  const menu = screen.getByRole('navigation', { name: 'Mais opções da conta' });
  expect(within(menu).getByRole('link', { name: 'Faturação' })).toHaveAttribute('href', '/admin/faturacao');
  expect(within(menu).queryByRole('link', { name: /Empresas|Transferências|Secretariado/ })).not.toBeInTheDocument();
  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(toggle).toHaveFocus();
  expect(screen.queryByRole('navigation', { name: 'Mais opções da conta' })).not.toBeInTheDocument();
});
