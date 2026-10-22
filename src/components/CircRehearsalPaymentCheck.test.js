import React from 'react';
import { render, screen } from '@testing-library/react';
import CircRehearsalPaymentCheck from './CircRehearsalPaymentCheck';

test('explains the 95 EUR late credit versus 150 EUR tariff without claiming receipt of the difference', () => {
  render(<CircRehearsalPaymentCheck check={{ status: 'mismatch', simulationBlocked: true, profile: 'external', paymentDate: '2027-02-02', paymentPeriod: 'regular', paidCents: 9500, expectedCents: 15000, differenceCents: 5500 }} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Emissão simulada bloqueada');
  expect(screen.getByText(/Valor recebido:/)).toHaveTextContent(/95,00.*150,00.*55,00/);
  expect(screen.getByText(/A data editável do documento/)).toBeInTheDocument();
});
test('an unavailable provider payment date is not represented as a passed check', () => {
  render(<CircRehearsalPaymentCheck check={{ status: 'unverified', reason: 'provider-payment-date-not-mapped' }} />);
  expect(screen.getByText('Tarifa por verificar.')).toBeInTheDocument();
  expect(screen.getByText(/A data da notificação não será usada/)).toBeInTheDocument();
  expect(screen.queryByText('Tarifa confere com a data do crédito de teste.')).not.toBeInTheDocument();
});
test('legacy rehearsals prompt a refresh and English remains available', () => {
  render(<CircRehearsalPaymentCheck en />);
  expect(screen.getByText('This rehearsal does not yet include this check.')).toBeInTheDocument();
  expect(screen.getByText(/without repeating payment/)).toBeInTheDocument();
});
