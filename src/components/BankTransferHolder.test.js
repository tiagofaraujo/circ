import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankTransferDetails from './BankTransferDetails';
const beneficiary = 'Associação Hemisfério Disciplinado';
const iban = 'PT50003300004567422451905';
const account = { environment: 'sandbox', enabled: false, iban: null, beneficiary, setupStatus: 'awaiting_activation' };
const copied = jest.fn();
beforeEach(() => { copied.mockReset().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } }); });
test('the supplied holder is visible and copied exactly, without enabling an IBAN', async () => {
  render(<BankTransferDetails account={account} amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByLabelText('Beneficiário')).toHaveValue(beneficiary);
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
  expect(copied).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Copiar Beneficiário' }));
  await waitFor(() => expect(copied).toHaveBeenCalledWith(beneficiary));
  expect(copied).toHaveBeenCalledTimes(1);
});
test('the rehearsal hides the real IBAN even if it is accidentally passed with a supplied holder', () => {
  const { container } = render(<BankTransferDetails account={{ ...account, iban, enabled: true, status: 'approved' }} amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByLabelText('Beneficiário')).toHaveValue(beneficiary);
  expect(container.innerHTML).not.toContain(iban);
  const button = screen.getByRole('button', { name: 'Copiar IBAN' });
  expect(button).toBeDisabled(); fireEvent.click(button); expect(copied).not.toHaveBeenCalled();
});
test('supplying the holder is not approval to expose real production instructions', () => {
  const { container } = render(<BankTransferDetails account={{ ...account, environment: 'production', iban, status: 'awaiting_activation' }} environment="production" amountCents={16000} memo="CIRC27-TEST" />);
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Não efetue a transferência');
  expect(container.innerHTML).not.toContain(iban);
  expect(copied).not.toHaveBeenCalled();
});
test('English labels preserve the exact Portuguese legal beneficiary name', async () => {
  render(<BankTransferDetails account={account} amountCents={16000} memo="C27T-TEST" en />);
  expect(screen.getByLabelText('Beneficiary')).toHaveValue(beneficiary);
  fireEvent.click(screen.getByRole('button', { name: 'Copy Beneficiary' }));
  await waitFor(() => expect(copied).toHaveBeenCalledWith(beneficiary));
  expect(screen.getByRole('button', { name: 'Copy IBAN' })).toBeDisabled();
});
