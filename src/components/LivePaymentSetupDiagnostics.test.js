import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LivePaymentSetupDiagnostics from './LivePaymentSetupDiagnostics';

const user = { uid: 'admin', getIdToken: async () => 'admin-token' };
const data = { environment: 'production', liveCheckoutEnabled: false, channelMatchesExpected: true,
  externalValidationPerformed: false, checks: { EUPAGO_LIVE_API_KEY: true, EUPAGO_LIVE_WEBHOOK_KEY: false } };
beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => data })); });
afterEach(() => { delete global.fetch; });

test('shows presence and missing settings without treating them as provider validation; refresh only reads', async () => {
  render(<LivePaymentSetupDiagnostics user={user} />);
  expect(await screen.findByText('Pagamentos reais: desativados')).toBeInTheDocument();
  expect(screen.getByText(/Presente não significa validado/)).toBeInTheDocument();
  expect(within(screen.getByText('EUPAGO_LIVE_WEBHOOK_KEY').closest('li')).getByText(/em falta/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar diagnóstico EuPago' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls.every(([url, options]) => url === '/api/checkout/live/diagnostics'
    && options.method === 'GET' && options.cache === 'no-store' && !options.body)).toBe(true);
});

test('a failed refresh clears an earlier diagnosis and never offers activation', async () => {
  render(<LivePaymentSetupDiagnostics user={user} />);
  await screen.findByText('Pagamentos reais: desativados');
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'PRIVATE-PROVIDER-DETAIL' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar diagnóstico EuPago' }));
  expect(await screen.findByText(/Não foi possível consultar a configuração/)).toBeInTheDocument();
  expect(screen.queryByText('Pagamentos reais: desativados')).not.toBeInTheDocument();
  expect(screen.queryByText(/PRIVATE-PROVIDER-DETAIL/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('English diagnosis distinguishes enabled payments and a channel mismatch', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...data, liveCheckoutEnabled: true, channelMatchesExpected: false }) });
  render(<LivePaymentSetupDiagnostics user={user} en />);
  expect(await screen.findByText('Live payments: ENABLED')).toBeInTheDocument();
  expect(screen.getByText(/unconfirmed — the server must use exactly/)).toBeInTheDocument();
});
