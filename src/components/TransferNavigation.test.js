import React, { act } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadParticipantProfileResult } from '../auth/profileStore';
import { subscribeToUserSubmissions } from '../auth/adminOperationsStore';
import MyCircShell from './MyCircShell';
import MyCircHome from '../pages/MyCircHome';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/profileStore', () => ({ loadParticipantProfileResult: jest.fn() }));
jest.mock('../auth/adminOperationsStore', () => ({ subscribeToUserSubmissions: jest.fn() }));
let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage, toggleLanguage: jest.fn() }) }));
jest.mock('../pwa/MyCircInstall', () => ({ useMyCircInstall: () => ({ installed: false }), InstallMyCirc: () => null }));

const target = '/admin/transferencias-teste';
const user = { uid: 'navigation-test', email: 'circ.chuc@gmail.com', displayName: 'Organização', emailVerified: true };
const setAccess = access => useAuth.mockReturnValue({ user, access, signOut: jest.fn(), resendVerification: jest.fn() });
function Location() {
  const location = useLocation();
  return <output aria-label="Test destination">{location.pathname}{location.search}</output>;
}
async function show({ home = false, path = '/conta', shell = true } = {}) {
  const child = home ? <MyCircHome /> : <p>Conteúdo de teste</p>;
  let result;
  await act(async () => {
    result = render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {shell ? <MyCircShell>{child}<Location /></MyCircShell> : child}
    </MemoryRouter>);
  });
  return result;
}
beforeEach(() => {
  jest.clearAllMocks(); mockLanguage = 'pt'; setAccess({ canManageRegistrations: true });
  loadParticipantProfileResult.mockResolvedValue({ source: 'firestore', profile: { name: 'Organização' }, completion: { percentage: 100 } });
  subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([]); return jest.fn(); });
});

test('administrator has a direct transfer link in the main My CIRC management menu', async () => {
  await show();
  const management = screen.getByRole('navigation', { name: 'Módulos de gestão' });
  const link = within(management).getByRole('link', { name: 'Transferências — teste' });
  expect(link).toHaveAttribute('href', target);
  expect(link).not.toHaveAttribute('aria-current');
  await act(async () => { fireEvent.click(link); });
  expect(screen.getByLabelText('Test destination')).toHaveTextContent(target);
  expect(link).toHaveAttribute('aria-current', 'page');
});

test('the active transfer link is retained on a selected request and does not activate registrations', async () => {
  await show({ path: `${target}?teste=existing-session&pedido=existing-order` });
  const management = screen.getByRole('navigation', { name: 'Módulos de gestão' });
  expect(within(management).getByRole('link', { name: 'Transferências — teste' })).toHaveAttribute('aria-current', 'page');
  expect(within(management).getByRole('link', { name: 'Gestão de inscrições' })).not.toHaveAttribute('aria-current');
});

test('the home page also exposes the transfer shortcut independently of the desktop sidebar', async () => {
  await show({ home: true, shell: false });
  const region = screen.getByRole('region', { name: 'Área de gestão' });
  expect(within(region).getByRole('link', { name: 'Transferências — teste' })).toHaveAttribute('href', target);
  expect(screen.getByRole('link', { name: /Inscrições Congresso/ })).toHaveAttribute('href', '/conta/inscricoes');
});

test('English management navigation and home shortcut have the same sandbox destination', async () => {
  mockLanguage = 'en'; await show({ home: true });
  const links = screen.getAllByRole('link', { name: 'Bank transfers — test' });
  expect(links).toHaveLength(2);
  links.forEach(link => expect(link).toHaveAttribute('href', target));
  expect(screen.queryByRole('link', { name: 'Transferências — teste' })).not.toBeInTheDocument();
});

for (const [role, access] of [
  ['participant', {}], ['scientific manager', { canManageSubmissions: true }],
  ['reviewer', { canReviewSubmissions: true }], ['event desk', { canUseSecretariat: true }],
  ['explicitly denied', { canManageRegistrations: false, canManageSubmissions: true }],
]) test(`${role} sees no bank-validation shortcut in either navigation surface`, async () => {
  setAccess(access); await show({ home: true });
  expect(screen.queryByRole('link', { name: 'Transferências — teste' })).not.toBeInTheDocument();
  expect(document.querySelector(`a[href="${target}"]`)).toBeNull();
  const mobile = screen.getByRole('navigation', { name: 'Navegação no telemóvel' });
  expect(within(mobile).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/conta');
});

test('signed-out navigation does not expose management links even with stale access data', async () => {
  useAuth.mockReturnValue({ user: null, access: { canManageRegistrations: true }, signOut: jest.fn() });
  await show({ path: '/login' });
  expect(screen.queryByRole('navigation', { name: 'Módulos de gestão' })).not.toBeInTheDocument();
  expect(document.querySelector(`a[href="${target}"]`)).toBeNull();
});
