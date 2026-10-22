import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FiscalPriceNote from './FiscalPriceNote';
import Prices from './js/Prices';
let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
beforeEach(() => { mockLanguage = 'pt'; });

test('explains exempt registrations and dinner separately from taxable courses in Portuguese', () => {
  render(<FiscalPriceNote />);
  const note = screen.getByRole('note', { name: 'Preços e IVA' });
  expect(note).toHaveTextContent('bilhetes de jantar, incluindo acompanhantes');
  expect(note).toHaveTextContent('artigo 9.º do CIVA');
  expect(note).toHaveTextContent('23%');
  expect(note).toHaveTextContent('clientes fora de Portugal exige validação específica');
});
test('provides the same limits in English', () => {
  render(<FiscalPriceNote en />);
  expect(screen.getByRole('note', { name: 'Prices and VAT' })).toHaveTextContent('including accompanying guests');
  expect(screen.getByRole('note')).toHaveTextContent('outside Portugal requires specific validation');
});
test('publishes the note without changing profile prices, phases or the standalone dinner row', () => {
  render(<MemoryRouter><Prices /></MemoryRouter>);
  expect(screen.getByRole('note', { name: 'Preços e IVA' })).toBeInTheDocument();
  const external = screen.getByRole('row', { name: /Congressistas externos/ });
  expect(within(external).getAllByRole('cell').map(el => el.textContent)).toEqual([expect.stringMatching(/95/), expect.stringMatching(/150/)]);
  const dinner = screen.getByRole('row', { name: /Jantar do congresso/ });
  expect(within(dinner).getAllByRole('cell').every(cell => /30/.test(cell.textContent))).toBe(true);
  expect(screen.queryByText(/Inscrição com direito a jantar/)).not.toBeInTheDocument();
  expect(screen.getByText('1 de fev. de 2027')).toBeInTheDocument();
});
test('renders the English notice on the English prices page', () => {
  mockLanguage = 'en';
  render(<MemoryRouter><Prices /></MemoryRouter>);
  expect(screen.getByRole('note', { name: 'Prices and VAT' })).toBeInTheDocument();
});
