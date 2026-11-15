import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminOrganizerVouchers from './AdminOrganizerVouchers';

jest.mock('../auth/firebaseClient', () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: 'admin', getIdToken: async () => 'session' } }),
  isAdminUser: () => true,
}));

const batchId = 'circ-2027-organizers-01';
const key = `${batchId}:admin`;
const codes = Array.from({ length: 9 }, (_, index) => index.toString().padStart(32, '0'));
const existingFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
  window.sessionStorage.clear();
});

afterEach(() => {
  global.fetch = existingFetch;
});

test('keeps a previously issued organizer batch available as a collapsed archive', () => {
  window.sessionStorage.setItem(key, JSON.stringify({ codes, issued: true }));
  render(<AdminOrganizerVouchers />);

  const summary = screen.getByText('Lote anterior de organizadores');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(screen.queryByRole('button', { name: 'Copiar 9 códigos' })).not.toBeInTheDocument();
  const details = summary.closest('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(screen.getByRole('button', { name: 'Copiar 9 códigos' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(9);
  expect(fetch).not.toHaveBeenCalled();
});

test('does not offer a separate issuance when the archived organizer batch was never issued', async () => {
  window.sessionStorage.setItem(key, JSON.stringify({ codes, issued: false }));
  fetch.mockResolvedValue({ ok: true, json: async () => ({ batchId, quantity: 9, issued: false }) });
  render(<AdminOrganizerVouchers />);
  expect(fetch).not.toHaveBeenCalled();

  const details = screen.getByText('Lote anterior de organizadores').closest('details');
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(await screen.findByText('Sem lote anterior emitido.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/admin/registration-management/organizer-vouchers/issue',
    expect.objectContaining({ method: 'GET' }));
});
