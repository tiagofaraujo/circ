import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankTransferDetails, { CopyTransferField, normalizePortugueseIban } from './BankTransferDetails';
const iban = 'PT50003300004567422451905';
const account = { iban, beneficiary: 'Nome de teste do titular', enabled: true, environment: 'production', status: 'approved' };
const copied = jest.fn();
beforeEach(() => { copied.mockReset().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } }); });
test('IBAN validation checks its digits without claiming the account belongs to anyone', () => {
  expect(normalizePortugueseIban('pt50 0033 0000 4567 4224 5190 5')).toBe(iban);
  for (const value of ['', null, 'IBAN: ' + iban, iban.slice(0, -1) + '4', 'PT00' + iban.slice(4)]) expect(normalizePortugueseIban(value)).toBeNull();
});
test('bank details never expose an actionable IBAN in the rehearsal, even with approved props', () => {
  const { container } = render(<BankTransferDetails account={account} amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
  expect(screen.getByLabelText('IBAN').value).not.toContain('PT50'); expect(container.innerHTML).not.toContain(iban);
  expect(copied).not.toHaveBeenCalled();
});
test('eligible approved instructions copy an IBAN without spaces or labels only after a click', async () => {
  render(<BankTransferDetails account={account} environment="production" amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByLabelText('IBAN')).toHaveValue('PT50 0033 0000 4567 4224 5190 5');
  expect(copied).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Copiar IBAN' }));
  await screen.findByText('IBAN copiado.'); expect(copied).toHaveBeenCalledWith(iban);
});
test('unapproved or missing holder details cannot enable copying', () => {
  const { rerender } = render(<BankTransferDetails account={{ ...account, beneficiary: null }} environment="production" amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
  rerender(<BankTransferDetails account={{ ...account, status: 'awaiting_holder' }} environment="production" amountCents={16000} memo="C27T-TEST" />);
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
});
test('amount and memo copying include only their exact values', async () => {
  render(<BankTransferDetails amountCents={16000} memo="C27T-TEST" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copiar Valor (EUR)' }));
  await waitFor(() => expect(copied).toHaveBeenCalledWith('160,00'));
  fireEvent.click(screen.getByRole('button', { name: 'Copiar Descrição para o beneficiário' }));
  await waitFor(() => expect(copied).toHaveBeenCalledWith('C27T-TEST'));
});
test('clipboard rejection offers selectable exact text and never claims success', async () => {
  copied.mockRejectedValue(new Error('permission denied'));
  render(<CopyTransferField label="IBAN" value="PT50 0033 0000 4567 4224 5190 5" copyValue={iban} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copiar IBAN' }));
  await screen.findByText(/Cópia automática indisponível/);
  expect(screen.queryByText('IBAN copiado.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('IBAN')).toHaveFocus(); expect(screen.getByLabelText('IBAN')).toHaveValue(iban);
  expect(screen.getByLabelText('IBAN').selectionEnd).toBe(25);
});
test('missing Clipboard API follows the same manual path', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  render(<CopyTransferField label="Descrição" value="C27T-TEST" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copiar Descrição' }));
  await screen.findByText(/Cópia automática indisponível/);
  expect(screen.getByLabelText('Descrição')).toHaveFocus();
});
test('English copy uses plain decimal amounts', async () => {
  render(<BankTransferDetails amountCents={16000} memo="C27T-TEST" en />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy Amount (EUR)' }));
  await waitFor(() => expect(copied).toHaveBeenCalledWith('160.00'));
});
