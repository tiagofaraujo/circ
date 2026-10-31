import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LivePaymentPilotPreview from './LivePaymentPilotPreview';

const user = { uid: 'admin', getIdToken: async () => 'token' };
const preview = { previewOnly: true, paymentCreated: false, fiscalDocumentIssued: false,
  quote: { amountCents: 9500, currency: 'EUR' }, billing: { customer_business_name: 'Pessoa Ensaio',
    customer_tax_registration_number: '203821432', customer_address_detail: 'Rua Teste 1',
    customer_postcode: '3030-471', customer_city: 'Coimbra', customer_country: 'PT' } };
beforeEach(() => { global.fetch = jest.fn(async () => ({ ok: true, json: async () => preview })); });
afterEach(() => { delete global.fetch; });

test('only previews on explicit request and has no reference creation or fiscal action', async () => {
  render(<LivePaymentPilotPreview user={user} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar ensaio privado' }));
  expect(await screen.findByText(/Valor previsto: 95,00/)).toBeInTheDocument();
  expect(screen.getByText('Pessoa Ensaio')).toBeInTheDocument();
  expect(screen.getByText('203821432')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/checkout/live/pilot-preview');
  expect(JSON.parse(options.body)).toEqual({ profile: 'external' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

test('profile changes clear old billing and quote; the backend can reject unverified eligibility', async () => {
  render(<LivePaymentPilotPreview user={user} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar ensaio privado' }));
  await screen.findByText('Pessoa Ensaio');
  fireEvent.change(screen.getByLabelText('Perfil para o ensaio'), { target: { value: 'uls' } });
  expect(screen.queryByText('Pessoa Ensaio')).not.toBeInTheDocument();
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'checkout/uls-not-verified' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar ensaio privado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/perfil ULS Coimbra ainda não está validado/);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ profile: 'uls' });
});

test('unknown errors do not expose server details and failed refresh removes stale preview', async () => {
  render(<LivePaymentPilotPreview user={user} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar ensaio privado' }));
  await screen.findByText('Pessoa Ensaio');
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'PRIVATE-KEY' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar ensaio privado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível preparar/);
  expect(screen.queryByText('Pessoa Ensaio')).not.toBeInTheDocument();
  expect(screen.queryByText(/PRIVATE-KEY/)).not.toBeInTheDocument();
});

test('English interface identifies the preparation as read only', async () => {
  render(<LivePaymentPilotPreview user={user} en />);
  expect(screen.getByText(/Available while live payments are disabled/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Preview private pilot' }));
  expect(await screen.findByText('Pessoa Ensaio')).toBeInTheDocument();
});
