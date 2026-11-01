import React, { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import StripeProductionSetup from './StripeProductionSetup';

let mockAuth;
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));

const stripe = {
  ready: true, apiKeyPresent: true, liveKeyValid: true,
  webhookKeyPresent: true, serviceAccountPresent: true,
  webhookPath: '/api/payments/stripe/live/notifications', apiVersion: '2026-09-30.endive',
  liveEnabled: true, validationOnly: true,
};
const response = (data, ok = true) => ({ ok, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  mockAuth = { isAdmin: true, user: { uid: 'owner', emailVerified: true, getIdToken: jest.fn(async () => 'owner-jwt') } };
  global.fetch = jest.fn(async () => response({ stripe }));
});

test('only the authenticated administrator reads or sees Stripe setup', () => {
  mockAuth.isAdmin = false;
  const { rerender, container } = render(<StripeProductionSetup />);
  expect(container).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
  mockAuth = { isAdmin: true, user: null };
  rerender(<StripeProductionSetup />);
  expect(container).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
});

test('reads only the authenticated diagnostic and distinguishes presence from live validation', async () => {
  render(<StripeProductionSetup />);
  expect(await screen.findByText('Configuração técnica presente')).toBeInTheDocument();
  expect(screen.getByText('Pagamentos reais limitados a contas autorizadas para validação.')).toBeInTheDocument();
  expect(screen.getByText(/Não valida a chave junto da Stripe, a aprovação da conta nem a entrega/)).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/api/checkout/live/diagnostics', expect.objectContaining({
    method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer owner-jwt' },
  }));
  expect(screen.getByText('https://circ-coimbra.org/api/payments/stripe/live/notifications')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Chaves API Stripe' })).toHaveAttribute('href', 'https://dashboard.stripe.com/apikeys');
  expect(screen.getByRole('link', { name: 'Webhooks Stripe' })).toHaveAttribute('href', 'https://dashboard.stripe.com/webhooks');
});

test('shares the page read and never displays unknown or secret response properties', () => {
  render(<StripeProductionSetup diagnostics={{ ...stripe, secretKey: 'private-server-value', webhookSecret: 'private-webhook-value' }} />);
  expect(screen.getByText('Configuração técnica presente')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('private-server-value');
  expect(document.body).not.toHaveTextContent('private-webhook-value');
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('a ready flag does not override missing configuration or a mismatched API version', () => {
  const { rerender } = render(<StripeProductionSetup diagnostics={{ ...stripe, webhookKeyPresent: false }} />);
  expect(screen.getByText('Configuração Stripe incompleta')).toBeInTheDocument();
  rerender(<StripeProductionSetup diagnostics={{ ...stripe, apiVersion: '2026-10-28.preview' }} />);
  expect(screen.getByText('Configuração Stripe incompleta')).toBeInTheDocument();
  expect(screen.queryByText('Configuração técnica presente')).not.toBeInTheDocument();
});

test('a failed refresh clears old readiness and never renders raw server errors', async () => {
  render(<StripeProductionSetup diagnostics={stripe} />);
  fetch.mockResolvedValue(response({ error: 'STRIPE_SECRET=private-value' }, false));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar diagnóstico Stripe' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível obter o diagnóstico Stripe atual');
  expect(screen.queryByText('Configuração técnica presente')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('private-value');
  expect(screen.getByRole('button', { name: 'Atualizar diagnóstico Stripe' })).toBeEnabled();
});

test('missing and malformed schemas remain unconfirmed rather than reporting ready', async () => {
  fetch.mockResolvedValue(response({ stripe: { ...stripe, apiKeyPresent: 'true' } }));
  render(<StripeProductionSetup />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Configuração técnica presente')).not.toBeInTheDocument();
});

test('a new parent read supersedes an in-flight refresh and double clicks issue only one GET', async () => {
  const pending = deferred();
  fetch.mockReturnValue(pending.promise);
  const { rerender } = render(<StripeProductionSetup diagnostics={stripe} />);
  const button = screen.getByRole('button', { name: 'Atualizar diagnóstico Stripe' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  rerender(<StripeProductionSetup diagnostics={{ ...stripe, liveEnabled: false, apiKeyPresent: false }} />);
  await act(async () => pending.resolve(response({ stripe })));
  expect(screen.getByText('Configuração Stripe incompleta')).toBeInTheDocument();
  expect(screen.getByText('Pagamentos Stripe desativados no servidor.')).toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('an account change cancels a pending token read and discards previous readiness', async () => {
  const token = deferred();
  mockAuth.user.getIdToken.mockReturnValue(token.promise);
  const { rerender, container } = render(<StripeProductionSetup />);
  mockAuth = { isAdmin: false, user: { uid: 'other', getIdToken: async () => 'other-jwt' } };
  rerender(<StripeProductionSetup />);
  await act(async () => token.resolve('owner-jwt'));
  expect(container).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
});

test('StrictMode replaces cancelled reads without leaving the query stuck', async () => {
  render(<StrictMode><StripeProductionSetup /></StrictMode>);
  expect(await screen.findByText('Configuração técnica presente')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar diagnóstico Stripe' })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
