import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadParticipantProfileResult } from '../auth/profileStore';
import { subscribeToUserSubmissions } from '../auth/adminOperationsStore';
import MyCircShell from './MyCircShell';
import MyCircHome from '../pages/MyCircHome';
import AdminModuleNav from './AdminModuleNav';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/profileStore', () => ({ loadParticipantProfileResult: jest.fn() }));
jest.mock('../auth/adminOperationsStore', () => ({ subscribeToUserSubmissions: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt', toggleLanguage: jest.fn() }) }));
jest.mock('../pwa/MyCircInstall', () => ({ useMyCircInstall: () => ({ installed: false }), InstallMyCirc: () => null }));

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'paulo', email: 'paulojaneiro77@gmail.com', emailVerified: true }, isAdmin: false,
    access: { canViewRegistrations: true, canManageRegistrations: false }, signOut: jest.fn(), resendVerification: jest.fn() });
  loadParticipantProfileResult.mockResolvedValue({ source: 'firestore', profile: { name: 'Paulo' }, completion: { percentage: 100 } });
  subscribeToUserSubmissions.mockImplementation((_uid, onData) => { onData([]); return () => {}; });
});

test('consultation appears in both sidebar and home while financial and unrelated management modules remain hidden', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MyCircShell><MyCircHome /></MyCircShell></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /Olá, Paulo/ })).toBeInTheDocument();
  const links = screen.getAllByRole('link', { name: 'Gestão de inscrições' });
  expect(links).toHaveLength(2);
  links.forEach(link => expect(link).toHaveAttribute('href', '/admin'));
  expect(screen.queryByRole('link', { name: /Faturação|Transferências|Empresas|Secretariado|Gestão de submissões|Superavaliador/ })).not.toBeInTheDocument();
});

test('the administration module menu also limits consultation to the registrations report', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AdminModuleNav /></MemoryRouter>);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /Inscrições/ })).toHaveAttribute('href', '/admin');
});
