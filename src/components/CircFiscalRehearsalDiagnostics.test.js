import React from 'react';
import { render, screen } from '@testing-library/react';
import CircFiscalRehearsalDiagnostics from './CircFiscalRehearsalDiagnostics';
import policy from '../data/circ2027FiscalPolicy.json';
const base = { fiscalPolicyVersion: policy.version, amountCents: 9500, salesDocument: { document_type: 'FR', document_series_id: 244, tax_exemption_reason_id: 9, lines: [{ item_code: 'CIRC27-CONG-P', item_id: 55, tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT', quantity: 1, unit_price: 95 }] },
  taxPreview: { complete: true, grossCents: 9500, netCents: 9500, vatCents: 0, exemptCents: 9500, taxableNetCents: 0, lines: [{ itemCode: 'CIRC27-CONG-P', grossCents: 9500, netCents: 9500, vatCents: 0, exemptionCode: 'M07' }] } };

test('shows exempt 95 EUR separately from the taxable base and keeps real issuance blocked', () => {
  render(<CircFiscalRehearsalDiagnostics rehearsal={base} />);
  expect(screen.getByText(/Isento · M07/)).toBeInTheDocument();
  expect(screen.getByText(/Total sem IVA \(inclui valores isentos\):/)).toHaveTextContent(/95,00.*IVA:.*0,00.*Total:.*95,00/);
  expect(screen.getByText(/Total isento:/)).toHaveTextContent(/95,00.*Base tributável:.*0,00/);
  expect(screen.getByText('Emissão fiscal real bloqueada.')).toBeInTheDocument();
  expect(screen.getByText(/Não valida a aceitação/)).toBeInTheDocument();
});
test('preserves historical rehearsals and explains that the new revision includes dinner', () => {
  render(<CircFiscalRehearsalDiagnostics rehearsal={{ ...base, fiscalPolicyVersion: 'circ2027-m07-20261020', status: 'simulated-issued' }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Repor este ensaio');
  expect(screen.getByRole('alert')).toHaveTextContent('jantar isento');
  expect(screen.queryByText(/Total sem IVA \(inclui valores isentos\):/)).not.toBeInTheDocument();
});
test('shows a complete 225 EUR example without treating exempt value as a taxable base', () => {
  const mixed = { ...base, amountCents: 22500, taxPreview: {
    complete: true, grossCents: 22500, netCents: 21192, vatCents: 1308, exemptCents: 15500, taxableNetCents: 5692,
    lines: [
      { itemCode: 'CIRC27-CONG-P', grossCents: 9500, netCents: 9500, vatCents: 0, exemptionCode: 'M07' },
      { itemCode: 'CIRC27-CURSO-M', grossCents: 3500, netCents: 2846, vatCents: 654, exemptionCode: null },
      { itemCode: 'CIRC27-CURSO-T', grossCents: 3500, netCents: 2846, vatCents: 654, exemptionCode: null },
      { itemCode: 'CIRC27-JANTAR', grossCents: 6000, netCents: 6000, vatCents: 0, exemptionCode: 'M07' },
    ],
  } };
  render(<CircFiscalRehearsalDiagnostics rehearsal={mixed} />);
  expect(screen.getByText(/Total isento:/)).toHaveTextContent(/155,00.*Base tributável:.*56,92/);
  expect(screen.getByText(/Total sem IVA \(inclui valores isentos\):/)).toHaveTextContent(/211,92.*IVA:.*13,08.*Total:.*225,00/);
  expect(screen.queryByText(/jantar autónomo.*pendente/)).not.toBeInTheDocument();
});
test('incomplete calculation remains explicitly unavailable and English keeps the foreign-sales caveat', () => {
  const pending = { ...base, taxPreview: { complete: false, grossCents: 22500, netCents: null, vatCents: null, lines: [{ itemCode: 'UNKNOWN', grossCents: 6000, pending: true }] } };
  render(<CircFiscalRehearsalDiagnostics rehearsal={pending} en />);
  expect(screen.getByText(/total VAT is undetermined/)).toBeInTheDocument();
  expect(screen.queryByText(/Total excluding VAT \(includes exempt amounts\):/)).not.toBeInTheDocument();
  expect(screen.getByText(/do not validate virtual sales/)).toBeInTheDocument();
});
