import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ToconlineReceiptTestPage from './ToconlineReceiptTestPage';
import policy from '../data/circ2027FiscalPolicy.json';

const mockUser = { uid: 'admin', getIdToken: jest.fn(async () => 'token') };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../components/AdminModuleNav', () => () => <nav>Admin</nav>);

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const baseOrder = {
  id: OID, method: 'multibanco', amountCents: 16000, currency: 'EUR',
  transaction: '29759999', createdAt: '2026-10-17T09:00:00Z', rehearsal: null,
};
const prepared = {
  kind: 'toconline-rehearsal', environment: 'sandbox', provider: 'toconline', liveWritesEnabled: false,
  fiscalPolicyVersion: policy.version,
  sessionId: SID, orderId: OID, mode: 'invoice_receipt', date: '2026-10-17', amountCents: 16000,
  payment: { code: 'MB', label: 'Referência Multibanco', blocker: null }, status: 'prepared',
  blockers: ['document-series-required', 'vat-or-exemption-configuration-required'],
  warnings: [], salesDocument: { document_type: 'FR', external_reference: 'CIRC-TESTE-AAA', lines: [] },
  receipt: null,
};
const issued = { ...prepared, status: 'simulated-issued', simulated: {
  salesDocumentId: 'TEST-DOC-1', salesDocumentNo: 'FR TESTE/1',
  receiptId: 'TEST-RC-1', receiptNo: 'RC TESTE/1', fiscalEffect: false, providerCallMade: false,
} };

function json(data, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({ ok, status, json: async () => data });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/admin/recibos-teste');
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => '58a12222-b856-41c9-a519-e2cc97bb3b69') } });
  let state = { id: SID, registrationConfirmed: true, orders: [baseOrder] };
  global.fetch = jest.fn((url, options = {}) => {
    if (url === '/api/checkout/live/diagnostics') return json({ environment: 'production', liveCheckoutEnabled: false,
      checks: { EUPAGO_LIVE_API_KEY: true, EUPAGO_LIVE_WEBHOOK_KEY: false }, channelMatchesExpected: true, externalValidationPerformed: false });
    if (url === '/api/fiscal/sandbox/config') return json({ provider: 'toconline', liveWritesEnabled: false, scopeRequired: 'commercial' });
    if (url === '/api/fiscal/toconline/config') return json({ provider: 'toconline', configured: false, connected: false, missing: ['clientId', 'clientSecret', 'oauthUrl', 'apiUrl', 'sessionKey'], redirectUrl: 'https://circ-coimbra.org/api/fiscal/toconline/callback', mode: 'read-only', commercialWritesEnabled: false });
    if (url === '/api/checkout/sandbox/sessions') return json({ sessions: [{ id: SID, createdAt: '2026-10-17T09:00:00Z', confirmed: true }] });
    if (url === `/api/fiscal/sandbox/sessions/${SID}`) return json({ session: state });
    if (url.endsWith('/prepare')) {
      state = { ...state, orders: [{ ...baseOrder, rehearsal: prepared }] };
      return json({ rehearsal: prepared }, true, 201);
    }
    if (url.endsWith('/issue')) {
      state = { ...state, orders: [{ ...baseOrder, rehearsal: issued }] };
      return json({ rehearsal: issued, duplicate: false });
    }
    if (url.endsWith('/reset')) {
      state = { ...state, orders: [baseOrder] };
      return json({ reset: true });
    }
    return json({ error: 'not-found' }, false, 404);
  });
});

afterEach(() => {
  delete global.fetch;
  window.history.replaceState(null, '', '/admin/recibos-teste');
});

test.each([
  ['firebase-identity', /Não foi possível autenticar a conta de serviço Google Cloud/],
  ['firebase-permissions', /O Firestore recusou o acesso à sessão segura/],
  ['state', /A confirmação de segurança da autorização expirou/],
  ['__proto__', /Não foi possível concluir a autorização TOConline/],
  ['PRIVATE-KEY-secret', /Não foi possível concluir a autorização TOConline/],
])('shows an actionable callback failure for %s without rendering unknown URL details', async (reason, expected) => {
  window.history.replaceState(null, '', `/admin/recibos-teste?toconline=error&toconline_reason=${reason}`);
  render(<ToconlineReceiptTestPage />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(expected);
  expect(alert).not.toHaveTextContent(/PRIVATE-KEY|__proto__/);
  await screen.findByRole('heading', { name: /Multibanco.*160,00/ });
  expect(fetch.mock.calls.every(([url]) => !String(url).endsWith('/issue'))).toBe(true);
});

test('legacy callback error URLs show a retry message', async () => {
  window.history.replaceState(null, '', '/admin/recibos-teste?toconline=error');
  render(<ToconlineReceiptTestPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/Tente novamente para obter o diagnóstico atualizado/);
  await screen.findByRole('heading', { name: /Multibanco.*160,00/ });
});

test('fresh setup diagnosis takes precedence over a stale generic callback URL without re-authorizing', async () => {
  window.history.replaceState(null, '', '/admin/recibos-teste?toconline=error&toconline_reason=firebase-identity');
  const original = global.fetch;
  global.fetch = jest.fn((url, options) => url === '/api/fiscal/toconline/config'
    ? json({ configured: true, connected: false, backgroundAutomation: { setupError: 'firebase-key', serviceIdentityConfigured: true, sessionStored: false } })
    : original(url, options));
  render(<ToconlineReceiptTestPage />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível ler a chave privada/));
  expect(screen.getByRole('button', { name: 'Autorizar TOConline em modo só de leitura' })).toBeEnabled();
  expect(fetch.mock.calls.every(([url]) => !String(url).endsWith('/authorize') && !String(url).endsWith('/issue'))).toBe(true);
});

test('loads confirmed test payments and clearly states that TOConline writes are blocked', async () => {
  render(<ToconlineReceiptTestPage />);
  expect(await screen.findByRole('heading', { name: 'Recibos e faturação — teste' })).toBeInTheDocument();
  expect(await screen.findByText(/escritas reais bloqueadas nesta simulação/)).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: /Multibanco.*160,00/ })).toBeInTheDocument();
  expect(screen.getByText(/não emite documentos fiscais/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ligação TOConline — apenas leitura' })).toBeInTheDocument();
  expect(screen.getByText('TOCONLINE_OAUTH_CLIENT_ID')).toBeInTheDocument();
  expect(await screen.findByText('Pagamentos reais: desativados')).toBeInTheDocument();
});

test('prepares a server rehearsal before allowing simulated issue', async () => {
  render(<ToconlineReceiptTestPage />);
  const prepare = await screen.findByRole('button', { name: 'Preparar pré-visualização TOConline' });
  fireEvent.click(prepare);
  expect(await screen.findByText(/Pré-visualização TOConline preparada/)).toBeInTheDocument();
  expect(await screen.findByText(/Confirmar e configurar a série de documentos/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Simular emissão sem efeito fiscal' })).toBeInTheDocument();
  const call = fetch.mock.calls.find(([url]) => url.endsWith('/prepare'));
  expect(JSON.parse(call[1].body)).toEqual({ mode: 'invoice_receipt', date: expect.any(String), sandboxAcknowledged: true });
});

test('simulated issue stays inside CIRC APIs and exposes test document numbers only', async () => {
  render(<ToconlineReceiptTestPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar pré-visualização TOConline' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Simular emissão sem efeito fiscal' }));
  expect(await screen.findByText('FR TESTE/1')).toBeInTheDocument();
  expect(screen.getByText('RC TESTE/1')).toBeInTheDocument();
  expect(screen.getByText(/Efeito fiscal: nenhum/)).toBeInTheDocument();
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/issue'))).toBe(true));
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true);
});

test('old prepared drafts must be refreshed and keep the date displayed in the form', async () => {
  const original = global.fetch;
  global.fetch = jest.fn((url, options) => url === `/api/fiscal/sandbox/sessions/${SID}`
    ? json({ session: { id: SID, orders: [{ ...baseOrder, rehearsal: { ...prepared, fiscalPolicyVersion: undefined } }] } })
    : original(url, options));
  render(<ToconlineReceiptTestPage />);
  expect(await screen.findByText('Ensaio anterior à configuração M07.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Simular emissão sem efeito fiscal' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar pré-visualização' }));
  await screen.findByText(/Pré-visualização TOConline preparada/);
  const call = fetch.mock.calls.find(([url]) => url.endsWith('/prepare'));
  expect(JSON.parse(call[1].body).date).toBe('2026-10-17');
  expect(screen.getByRole('button', { name: 'Simular emissão sem efeito fiscal' })).toBeEnabled();
});
