import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicLiveCheckout from './PublicLiveCheckout';
const ID = '11111111-1111-4111-8111-111111111111';
const user = { uid: 'user', getIdToken: async () => 'session' };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const order = { id: ID, status: 'pending', amountCents: 9500, currency: 'EUR', entity: '12345', reference: '123456789' };
const preview = { quote: { amountCents: 9500, currency: 'EUR' }, stamp: 'a'.repeat(64), billingStamp: 'b'.repeat(64), billing: { customer_business_name: 'Pessoa', customer_tax_registration_number: '123456789', customer_address_detail: 'Morada', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' } };
const response = (data, ok = true) => ({ ok, json: async () => data });
function show(props = {}) { return render(<MemoryRouter><PublicLiveCheckout user={user} selection={selection} eligible {...props} /></MemoryRouter>); }
beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => ID } }); });
test('reviews server billing and requires acknowledgement before exactly one real-order request', async () => {
 fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ order }));
 show(); await waitFor(() => expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Rever valor e faturação' }));
 const create = await screen.findByRole('button', { name: 'Gerar referência Multibanco' });
 expect(create).toBeDisabled(); expect(screen.getByText('Pessoa')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(create);
 expect(await screen.findByText('123456789', { selector: 'dd' })).toBeInTheDocument();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ id: ID, selection, stamp: preview.stamp, billingStamp: preview.billingStamp, method: 'multibanco' });
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('a lost creation response retains its UUID and prevents another creation', async () => {
 fetch.mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error('network'));
 show(); await waitFor(() => expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Rever valor e faturação' }));
 fireEvent.click(await screen.findByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('O pedido pode já existir');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button', { name: 'Gerar referência Multibanco' })).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Atualizar estado do pagamento' })).toBeEnabled();
});
test('an existing pending registration is read without creating another quote or order', async () => {
 fetch.mockResolvedValueOnce(response({ order }));
 show({ registration: { id: 'circ-2027-user', payment: { orderId: ID } } });
 expect(await screen.findByText('12345', { selector: 'dd' })).toBeInTheDocument();
 expect(fetch).toHaveBeenCalledWith(`/api/checkout/live/orders/${ID}`, expect.objectContaining({ method: 'GET' }));
 expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
test('an invalid saved ID fails closed instead of permitting a new reference', async () => {
 localStorage.setItem('circ-production-order:user', 'invalid'); show();
 expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeDisabled(); expect(fetch).not.toHaveBeenCalled();
});
