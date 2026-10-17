import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ToconlineReceiptTestPage from './ToconlineReceiptTestPage';

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
  sessionId: SID, orderId: OID, mode: 'invoice_plus_receipt', date: '2026-10-17', amountCents: 16000,
  payment: { code: 'MB', label: 'Referência Multibanco', blocker: null }, status: 'prepared',
  blockers: ['document-series-required', 'vat-or-exemption-configuration-required'],
  warnings: [], salesDocument: { document_type: 'FT', external_reference: 'CIRC-TESTE-AAA', lines: [] },
  receipt: { date: '2026-10-17', payment_mechanism: 'MB', lines: [{ received_value: 160 }] },
};
const issued = { ...prepared, status: 'simulated-issued', simulated: {
  salesDocumentId: 'TEST-DOC-1', salesDocumentNo: 'FT TESTE/1',
  receiptId: 'TEST-RC-1', receiptNo: 'RC TESTE/1', fiscalEffect: false, providerCallMade: false,
} };

function json(data, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({ ok, status, json: async () => data });
}

beforeEach(() => {
  jest.clearAllMocks();
  let state = { id: SID, registrationConfirmed: true, orders: [baseOrder] };
  global.fetch = jest.fn((url, options = {}) => {
    if (url === '/api/fiscal/sandbox/config') return json({ provider: 'toconline', liveWritesEnabled: false, scopeRequired: 'commercial' });
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

afterEach(() => { delete global.fetch; });

test('loads confirmed test payments and clearly states that TOConline writes are blocked', async () => {
  render(<ToconlineReceiptTestPage />);
  expect(await screen.findByRole('heading', { name: 'Recibos e faturação — teste' })).toBeInTheDocument();
  expect(await screen.findByText(/escritas reais bloqueadas neste módulo/)).toBeInTheDocument();
  expect(await screen.findByText('Multibanco · 160,00 €')).toBeInTheDocument();
  expect(screen.getByText(/não emite documentos fiscais/i)).toBeInTheDocument();
});

test('prepares a server rehearsal before allowing simulated issue', async () => {
  render(<ToconlineReceiptTestPage />);
  const prepare = await screen.findByRole('button', { name: 'Preparar pré-visualização TOConline' });
  fireEvent.click(prepare);
  expect(await screen.findByText(/Pré-visualização TOConline preparada/)).toBeInTheDocument();
  expect(await screen.findByText(/Configuração que falta antes de ligar a API real/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Simular emissão sem efeito fiscal' })).toBeInTheDocument();
  const call = fetch.mock.calls.find(([url]) => url.endsWith('/prepare'));
  expect(JSON.parse(call[1].body)).toEqual({ mode: 'invoice_plus_receipt', date: expect.any(String), sandboxAcknowledged: true });
});

test('simulated issue stays inside CIRC APIs and exposes test document numbers only', async () => {
  render(<ToconlineReceiptTestPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar pré-visualização TOConline' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Simular emissão sem efeito fiscal' }));
  expect(await screen.findByText('FT TESTE/1')).toBeInTheDocument();
  expect(screen.getByText('RC TESTE/1')).toBeInTheDocument();
  expect(screen.getByText(/Efeito fiscal: nenhum/)).toBeInTheDocument();
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith('/issue'))).toBe(true));
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith('/api/'))).toBe(true);
});
