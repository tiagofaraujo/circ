import React from 'react';
import { render, screen } from '@testing-library/react';
import CircBillingBankAccountCheck from './CircBillingBankAccountCheck';

const matched = { source: 'company_bank_accounts', ok: true, status: 'matched', account: { id: '77', ibanLast4: '1905' }, assignedToRehearsal: false };

test('shows the documented resource ID and masked bank reference without claiming invoice modification', () => {
  render(<CircBillingBankAccountCheck resource={matched} />);
  expect(screen.getByText('Correspondência do IBAN completo confirmada nesta leitura.')).toBeInTheDocument();
  expect(screen.getByText('77')).toBeInTheDocument();
  expect(screen.getByText('1905')).toBeInTheDocument();
  expect(screen.getByText(/Esta leitura não acrescenta a conta/)).toBeInTheDocument();
});
test('absence of a new read asks for configuration refresh, not rehearsal reset', () => {
  render(<CircBillingBankAccountCheck />);
  expect(screen.getByText(/Não é necessário repor o ensaio/)).toBeInTheDocument();
  expect(screen.queryByText('77')).not.toBeInTheDocument();
});
test('generic bank_accounts or malformed matches never appear confirmed', () => {
  const { rerender } = render(<CircBillingBankAccountCheck resource={{ ...matched, source: 'bank_accounts' }} />);
  expect(screen.queryByText('Correspondência do IBAN completo confirmada nesta leitura.')).not.toBeInTheDocument();
  rerender(<CircBillingBankAccountCheck resource={{ ...matched, account: null }} />);
  expect(screen.queryByText('Correspondência do IBAN completo confirmada nesta leitura.')).not.toBeInTheDocument();
});
test('unavailable resource is explicit and English is supported', () => {
  render(<CircBillingBankAccountCheck resource={{ source: 'company_bank_accounts', ok: false, status: 'unavailable', httpStatus: 404, account: null }} en />);
  expect(screen.getByRole('status')).toHaveTextContent('No alternative account is used.');
  expect(screen.getByRole('status')).toHaveTextContent('HTTP 404');
  expect(screen.getByText(/does not add the account to the FR/)).toBeInTheDocument();
});
