import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyCircHome from './MyCircHome';
import { useAuth } from '../auth/AuthContext';
import { loadParticipantProfileResult } from '../auth/profileStore';
import { subscribeToUserSubmissions } from '../auth/adminOperationsStore';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/profileStore', () => ({ loadParticipantProfileResult: jest.fn() }));
jest.mock('../auth/adminOperationsStore', () => ({ subscribeToUserSubmissions: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));

const user = { uid: 'fixture-user', displayName: 'Participante Exemplo', emailVerified: true };
const unsubscribe = jest.fn();
const show = () => render(<MemoryRouter><MyCircHome /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user, access: {}, resendVerification: jest.fn() });
  loadParticipantProfileResult.mockResolvedValue({ source: 'firestore', profile: { name: 'Participante Exemplo' }, completion: { percentage: 100 } });
  subscribeToUserSubmissions.mockImplementation((uid, data) => { data([]); return unsubscribe; });
});

test('loads the saved profile and keeps participant navigation available', async () => {
  const view = show();
  expect(await screen.findByText('100%')).toBeInTheDocument();
  expect(screen.queryByText('36%')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Inscrições Congresso/ })).toHaveAttribute('href', '/conta/inscricoes');
  expect(subscribeToUserSubmissions).toHaveBeenCalledWith(user.uid, expect.any(Function), expect.any(Function));
  view.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

test('never displays a partial local profile percentage when the server is unavailable', async () => {
  loadParticipantProfileResult.mockResolvedValue({ source: 'unavailable', completion: { percentage: 36 } });
  show();
  expect(await screen.findByText('Não foi possível confirmar os dados do perfil.')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('36%')).not.toBeInTheDocument();
});

test('submission managers retain personal access without gaining other management modules', async () => {
  useAuth.mockReturnValue({ user, access: { canManageSubmissions: true }, resendVerification: jest.fn() });
  show();
  await screen.findByText('100%');
  expect(screen.getByRole('link', { name: 'Gestão de submissões' })).toHaveAttribute('href', '/admin/submissoes');
  expect(screen.getByRole('link', { name: /Os meus trabalhos Rascunhos/ })).toHaveAttribute('href', '/conta/submissoes');
  expect(screen.queryByRole('link', { name: 'Secretariado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Gestão de inscrições' })).not.toBeInTheDocument();
});

test('shows an explicitly labelled draft test from the user query', async () => {
  subscribeToUserSubmissions.mockImplementation((uid, data) => {
    data([{ id: 'fixture', code: 'TEST-FIXTURE', isTest: true, title: 'Rascunho de exemplo', status: 'draft' }]);
    return unsubscribe;
  });
  show();
  await screen.findByText('100%');
  expect(screen.getByText('TEST-FIXTURE · Teste')).toBeInTheDocument();
  expect(screen.getByText('Rascunho')).toBeInTheDocument();
});

test('a permission/network error is not presented as an empty submission list', async () => {
  subscribeToUserSubmissions.mockImplementation((uid, data, error) => { error(new Error('unavailable')); return unsubscribe; });
  show();
  await waitFor(() => expect(screen.getByText(/Não foi possível carregar os trabalhos/)).toBeInTheDocument());
  expect(screen.queryByText('Espaço para a sua próxima ideia.')).not.toBeInTheDocument();
});
