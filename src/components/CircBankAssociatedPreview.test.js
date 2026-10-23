import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CircBankAssociatedPreview from './CircBankAssociatedPreview';
const mockUser = { getIdToken: jest.fn(async () => 'firebase-test') };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
const rehearsal = { sessionId: 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49', orderId: 'af91d4b0-d844-4a37-a71e-05f939a04f83',
  mode: 'invoice_receipt', source: { method: 'bank_transfer' }, status: 'simulated-issued' };
const preview = { kind: 'toconline-bank-associated-preview', ...rehearsal, persisted: false, liveWritesEnabled: false,
  fiscalEffect: false, providerWriteMade: false, amountCents: 22500, basedOnSimulatedDocument: 'FR TESTE/A261038C3B',
  account: { id: '77', ibanLast4: '1905', source: 'company_bank_accounts' }, salesDocument: { document_type: 'FR', bank_account_id: 77, payment_mechanism: 'TR' } };
let originalFetch;
beforeEach(() => { originalFetch = global.fetch; global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ preview }) })); });
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

test('reads on explicit click, displays the verified account, preserves the original and never posts', async () => {
  render(<CircBankAssociatedPreview rehearsal={rehearsal} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar FR com conta validada' }));
  expect(await screen.findByText('Conta associada apenas a esta pré-visualização.')).toBeInTheDocument();
  expect(screen.getByText('77')).toBeInTheDocument(); expect(screen.getByText('1905')).toBeInTheDocument();
  expect(screen.getByText('FR TESTE/A261038C3B')).toBeInTheDocument();
  expect(screen.getByText(/Total preservado/)).toHaveTextContent('225,00');
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe(`/api/fiscal/sandbox/bank-preview/sessions/${rehearsal.sessionId}/orders/${rehearsal.orderId}`);
  expect(options.method).toBe('GET'); expect(options.body).toBeUndefined();
  expect(screen.queryByRole('button', { name: /Repor/ })).not.toBeInTheDocument();
});

test('read failure never renders a guessed account ID or successful assignment', async () => {
  fetch.mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'billing-bank-unconfirmed', httpStatus: 404 }) }));
  render(<CircBankAssociatedPreview rehearsal={rehearsal} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar FR com conta validada' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 404');
  expect(screen.queryByText('77')).not.toBeInTheDocument();
  expect(screen.queryByText('Conta associada apenas a esta pré-visualização.')).not.toBeInTheDocument();
});

test('expired OAuth asks to reconnect, and English text explains that no document is changed', async () => {
  fetch.mockImplementation(async () => ({ ok: false, json: async () => ({ error: 'toconline-not-connected' }) }));
  render(<CircBankAssociatedPreview rehearsal={rehearsal} en />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview FR with verified account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reauthorize');
  expect(screen.getByText(/The saved simulation is not modified/)).toBeInTheDocument();
});

test('does not expose this transfer-only action for cards or missing rehearsals', () => {
  const { rerender } = render(<CircBankAssociatedPreview />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(<CircBankAssociatedPreview rehearsal={{ ...rehearsal, source: { method: 'stripe' } }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
