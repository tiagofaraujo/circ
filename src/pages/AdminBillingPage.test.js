import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminBillingPage from './AdminBillingPage';
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, user: { uid: 'admin', getIdToken: async () => 'firebase-session' }, access: { canManageRegistrations: true } }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
const response = (data, ok = true) => ({ ok, json: async () => data });
const config = { configured: true, connected: true, backgroundAutomation: { sessionStored: true } };
const stripe = { ready: true, apiKeyPresent: true, liveKeyValid: true, webhookKeyPresent: true, serviceAccountPresent: true,
  webhookPath: '/api/payments/stripe/live/notifications', apiVersion: '2026-09-30.endive', liveEnabled: true, validationOnly: true };
beforeEach(() => {
  global.fetch = jest.fn(async url => {
    if (url.endsWith('/config')) return response(config);
    if (url.endsWith('/diagnostics')) return response({ liveCheckoutEnabled: true, privatePilot: false, channelMatchesExpected: true, checks: { FIREBASE_PROJECT_ID: true }, stripe });
    if (url.endsWith('/resources')) return response({ fetchedAt: '2026-11-01T10:00:00Z', resources: { series: { ok: true, count: 7 } } });
    if (url.endsWith('/disconnect')) return response({ disconnected: true });
    throw new Error('unexpected route');
  });
});
const show = () => render(<MemoryRouter><AdminBillingPage /></MemoryRouter>);
test('production billing reads the existing configuration without creating payments or documents', async () => {
  show();
  expect(await screen.findByText('7 registos')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Faturação', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Receção de pagamentos ativa')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Stripe · cartões e carteiras digitais' })).toBeInTheDocument();
  expect(await screen.findByText('Configuração técnica presente')).toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(3);
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(screen.queryByText(/ensaio|sandbox|pré-visualização|simular/i)).not.toBeInTheDocument();
  expect(screen.queryAllByRole('link').some(link => link.getAttribute('href').includes('-teste'))).toBe(false);
});
test('disconnect ends only the browser connection and leaves the backend status visible', async () => {
  show(); await screen.findByText('7 registos');
  fireEvent.click(screen.getByRole('button', { name: 'Terminar ligação neste navegador' }));
  expect(await screen.findByRole('status')).toHaveTextContent('A sessão de faturação do servidor mantém-se ativa');
  expect(screen.getByText('sessão segura disponível')).toBeInTheDocument();
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST').map(([url]) => url)).toEqual(['/api/fiscal/toconline/disconnect']);
});
test('a failed query clears its stale status and allows another read', async () => {
  show(); await screen.findByText('7 registos');
  fetch.mockImplementation(async () => response({ error: 'service-unavailable' }, false));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar configuração' }));
  await screen.findByText(/Não foi possível concluir a consulta/);
  await waitFor(() => expect(screen.queryByText('Receção de pagamentos ativa')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Atualizar configuração' })).toBeEnabled();
});
test('the enable flag alone never reports an incomplete setup as active', async () => {
  const read = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url.endsWith('/diagnostics')
    ? Promise.resolve(response({ liveCheckoutEnabled: true, privatePilot: false, channelMatchesExpected: true, checks: { EUPAGO_LIVE_API_KEY: false } }))
    : read(url, options));
  show(); await screen.findByText('7 registos');
  expect(screen.getByText('Checkout público indisponível')).toBeInTheDocument();
  expect(screen.queryByText('Receção de pagamentos ativa')).not.toBeInTheDocument();
});
test('Stripe refresh reuses administrator authentication without touching TOConline or creating a payment', async () => {
  show(); await screen.findByText('7 registos'); await screen.findByText('Configuração técnica presente');
  fetch.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar diagnóstico Stripe' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await screen.findByText('Configuração técnica presente');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/api/checkout/live/diagnostics', expect.objectContaining({
    method: 'GET', headers: { Authorization: 'Bearer firebase-session' },
  }));
  expect(screen.getByText('Ligação ativa neste navegador')).toBeInTheDocument();
});
