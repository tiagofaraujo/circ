import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AdminOrganizationDiscountVouchers from './AdminOrganizationDiscountVouchers';
import { exportOrganizationDiscountVoucherExcel } from '../auth/organizationDiscountVoucherExcel';

jest.mock('../auth/firebaseClient', () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: 'admin', getIdToken: async () => 'session' } }),
  isAdminUser: () => true,
}));
jest.mock('../auth/organizationDiscountVoucherExcel', () => ({
  ...jest.requireActual('../auth/organizationDiscountVoucherExcel'), exportOrganizationDiscountVoucherExcel: jest.fn(),
}));

const batchId = '12345678-abcd-4000-a000-123456789abc';
const label = 'Parceiros científicos';
const code = 'CIRC27-D-0000-0000-0000-0000-0000-0000-0000-0000';
const existingFetch = global.fetch;
const existingCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');

beforeEach(() => {
  global.fetch = jest.fn();
  Object.defineProperty(window, 'crypto', { value: { randomUUID: () => batchId }, configurable: true });
  window.localStorage.clear();
});

afterEach(() => {
  global.fetch = existingFetch;
  if (existingCrypto) Object.defineProperty(window, 'crypto', existingCrypto);
  else delete window.crypto;
});

test('issues a fixed discount with Portuguese decimal input and recovers the same batch after a reload', async () => {
  const terms = { batchId, label, count: 1, discount: { type: 'fixed', value: 1750 } };
  const batch = { ...terms, createdAt: '2026-11-15T12:00:00.000Z', codes: [code] };
  fetch.mockRejectedValueOnce(new Error('disconnected')).mockResolvedValue({ ok: true, json: async () => batch });
  const { unmount } = render(<AdminOrganizationDiscountVouchers />);

  fireEvent.change(screen.getByLabelText('Nome do lote'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Tipo de desconto'), { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText('Desconto (€)'), { target: { value: '17,50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Emitir vouchers de desconto' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('A emissão não foi confirmada');
  unmount();

  render(<AdminOrganizationDiscountVouchers />);
  fireEvent.click(screen.getByRole('button', { name: 'Retomar emissão' }));
  expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument();
  expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([terms, terms]);
  fireEvent.click(screen.getByRole('button', { name: 'Descarregar lote em Excel' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Excel preparado');
  expect(exportOrganizationDiscountVoucherExcel).toHaveBeenCalledWith(batch);
  expect(JSON.stringify(window.localStorage)).not.toContain(code);
});

test('retrieves an earlier batch by ID using a read request', async () => {
  const batch = { batchId, label, count: 1, discount: { type: 'percentage', value: 500 }, createdAt: '2026-11-15T12:00:00.000Z', codes: [code] };
  fetch.mockResolvedValue({ ok: true, json: async () => batch });
  render(<AdminOrganizationDiscountVouchers />);
  const summary = screen.getByText('Consultar lote anterior');
  summary.closest('details').open = true;
  fireEvent.change(screen.getByLabelText('Identificador do lote'), { target: { value: batchId } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar lote' }));
  expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(`/api/admin/registration-management/discount-vouchers?batchId=${batchId}`,
    expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer session' } }));
});

test('prefills the organizer terms and sends the restricted batch only when submitted', async () => {
  const terms = { batchId, label: 'Organizadores · CIRC 2027', count: 9, discount: { type: 'fixed', value: 5500 }, audience: 'uls-onsite' };
  const codes = Array.from({ length: 9 }, (_, index) => `${code.slice(0, -1)}${index}`);
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...terms, codes, createdAt: '2026-11-15T12:00:00.000Z' }) });
  render(<AdminOrganizationDiscountVouchers />);

  fireEvent.click(screen.getByRole('button', { name: 'Preencher 9 vouchers de 55 € para organizadores' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Nome do lote')).toHaveValue(terms.label);
  expect(screen.getByLabelText('Número de códigos')).toHaveValue(9);
  expect(screen.getByLabelText('Desconto (€)')).toHaveValue('55');
  expect(screen.getByLabelText('Destinatários')).toHaveValue('uls-onsite');
  fireEvent.click(screen.getByRole('button', { name: 'Emitir vouchers de desconto' }));
  expect(await screen.findByRole('heading', { name: terms.label })).toBeInTheDocument();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(terms);
  expect(screen.getByText('9 códigos emitidos', { exact: false })).toBeInTheDocument();
});
