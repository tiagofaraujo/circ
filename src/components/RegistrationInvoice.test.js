import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegistrationInvoice from './RegistrationInvoice';
import { subscribeToRegistrationInvoices, downloadRegistrationInvoice } from '../auth/invoiceStore';
jest.mock('../auth/invoiceStore', () => ({ subscribeToRegistrationInvoices: jest.fn(), downloadRegistrationInvoice: jest.fn() }));
const doc = { id: '649d2dbd-6125-4212-bfa8-22035a3a55e7', providerDocumentNo: 'FR CIRC2027/1' };
const props = { user: { uid: 'user' }, registration: { id: 'circ-2027-user' } };
beforeEach(() => { jest.clearAllMocks(); subscribeToRegistrationInvoices.mockImplementation((user, id, onData) => { onData([doc]); return jest.fn(); }); });
test('shows the issued number and downloads once while the request is pending', async () => {
  let finish; downloadRegistrationInvoice.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<RegistrationInvoice {...props} />);
  expect(screen.getByText('FR CIRC2027/1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Descarregar fatura-recibo (PDF)' }));
  expect(screen.getByRole('button', { name: 'A descarregar PDF…' })).toBeDisabled();
  expect(downloadRegistrationInvoice).toHaveBeenCalledTimes(1);
  finish(); await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  expect(screen.getByRole('status')).toHaveTextContent('Transferência do PDF iniciada');
});
test('download failure preserves the issued document and permits a read-only retry', async () => {
  downloadRegistrationInvoice.mockRejectedValue(new Error('unavailable'));
  render(<RegistrationInvoice {...props} />);
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('A fatura emitida mantém-se válida');
  expect(screen.getByText('FR CIRC2027/1')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeEnabled();
});
test('a failed listing does not claim an invoice is absent and offers refresh', () => {
  subscribeToRegistrationInvoices.mockImplementation((user, id, onData, onError) => { onError(new Error('offline')); return jest.fn(); });
  render(<RegistrationInvoice {...props} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar');
  expect(screen.queryByText(/ficará disponível/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(subscribeToRegistrationInvoices).toHaveBeenCalledTimes(2);
});
