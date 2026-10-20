import React from 'react';
import { render, screen } from '@testing-library/react';
import CircFiscalRehearsalDiagnostics from './CircFiscalRehearsalDiagnostics';
import policy from '../data/circ2027FiscalPolicy.json';
const base = { fiscalPolicyVersion: policy.version, amountCents: 9500, salesDocument: { document_type: 'FR', document_series_id: 244, tax_exemption_reason_id: 9, lines: [{ item_code: 'CIRC27-CONG-P', item_id: 55, tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT', quantity: 1, unit_price: 95 }] },
  taxPreview: { complete: true, grossCents: 9500, netCents: 9500, vatCents: 0, lines: [{ itemCode: 'CIRC27-CONG-P', grossCents: 9500, netCents: 9500, vatCents: 0, exemptionCode: 'M07' }] } };

test('shows exempt 95 EUR calculation and a real-issuance block without claiming provider validation', () => {
  render(<CircFiscalRehearsalDiagnostics rehearsal={base} />);
  expect(screen.getByText(/Isento · M07/)).toBeInTheDocument();
  expect(screen.getByText(/Base total:/)).toHaveTextContent(/95,00.*IVA:.*0,00.*Total:.*95,00/);
  expect(screen.getByText('Emissão fiscal real bloqueada.')).toBeInTheDocument();
  expect(screen.getByText(/Não valida a aceitação/)).toBeInTheDocument();
});
test('preserves legacy rehearsals and explains how to refresh them', () => {
  render(<CircFiscalRehearsalDiagnostics rehearsal={{ ...base, fiscalPolicyVersion: undefined, status: 'simulated-issued' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Repor este ensaio');
  expect(screen.queryByText(/Base total:/)).not.toBeInTheDocument();
});
test('does not display a definitive VAT total for a pending dinner', () => {
  const pending = { ...base, taxPreview: { complete: false, grossCents: 22500, netCents: null, vatCents: null, lines: [{ itemCode: 'CIRC27-JANTAR', grossCents: 6000, pending: true }] } };
  render(<CircFiscalRehearsalDiagnostics rehearsal={pending} en />);
  expect(screen.getByText(/total VAT is undetermined/)).toBeInTheDocument();
  expect(screen.queryByText(/Total net:/)).not.toBeInTheDocument();
});
