import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicLiveCheckout from './PublicLiveCheckout';
const ID = '11111111-1111-4111-8111-111111111111';
const user = { uid: 'user', getIdToken: async () => 'session' };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const order = { id: ID, status: 'pending', amountCents: 9500, currency: 'EUR', entity: '12345', reference: '123456789' };
const preview = { quote: { amountCents: 9500, currency: 'EUR' }, stamp: 'a'.repeat(64), billingStamp: 'b'.repeat(64), billing: { customer_business_name: 'Pessoa', customer_tax_registration_number: '123456789', customer_address_detail: 'Morada', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' } };
const response = (data, ok = true, status = ok ? 200 : 503) => ({ ok, status, json: async () => data });
function show(props = {}) { return render(<MemoryRouter><PublicLiveCheckout user={user} selection={selection} eligible {...props} /></MemoryRouter>); }
beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => ID } }); });
test('reviews server billing and requires acknowledgement before exactly one real-order request', async () => {
 fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ order }));
 show(); await waitFor(() => expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Rever valor e faturação' }));
 const create = await screen.findByRole('button', { name: 'Gerar referência Multibanco' });
 expect(create).toBeDisabled(); expect(screen.getByText('Pessoa')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(create);
 expect(await screen.findByText('A aguardar pagamento')).toBeInTheDocument();
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

const PRIMARY_ID = '22222222-2222-4222-8222-222222222222';
const secondarySelection = {morningCourse:false,afternoonCourse:true,dinnerQuantity:1};
const paidRegistration = {id:'circ-2027-user',status:'confirmed',payment:{status:'paid',orderId:PRIMARY_ID}};
const secondaryOrder = { ...order, kind:'supplementary', amountCents:6500, selection:secondarySelection };
const secondaryPreview = { ...preview, quote:{amountCents:6500,currency:'EUR',kind:'supplementary'} };
function showSupplement(props={}) { return show({kind:'supplementary',registration:paidRegistration,selection:secondarySelection,...props}); }

test('a supplement recovers its own server slot and uses a separate preview, UUID and payment request', async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 fetch.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview)).mockResolvedValueOnce(response({order:secondaryOrder}));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 expect(fetch.mock.calls[0][0]).toBe('/api/checkout/live/supplementary-order');
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByText('A aguardar pagamento');
 expect(fetch.mock.calls[1][0]).toBe('/api/checkout/live/supplementary/quote');
 expect(fetch.mock.calls[2][0]).toBe('/api/checkout/live/supplementary/orders');
 expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({id:ID,selection:secondarySelection,method:'multibanco'});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
});

test('an outstanding supplement from another browser is recovered instead of showing a new reference',async()=>{
 fetch.mockResolvedValueOnce(response({order:secondaryOrder})); showSupplement();
 await screen.findByText('A aguardar pagamento');
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});

test('a primary order cannot be adopted as a supplement from a stale browser UUID',async()=>{
 localStorage.setItem('circ-production-supplementary-order:user',ID);
 fetch.mockResolvedValueOnce(response({order:{...order,kind:'primary'}})); showSupplement();
 expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
});

test('an atomic slot collision recovers the preexisting supplement without another provider request',async()=>{
 fetch.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview))
  .mockResolvedValueOnce(response({error:'supplementary-order-exists',order:{...secondaryOrder,id:PRIMARY_ID}},false,409));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'})); fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(PRIMARY_ID);
 expect(fetch.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});

test('a paid supplement with unfinished invoicing cannot be cleared for another purchase',async()=>{
 localStorage.setItem('circ-production-supplementary-order:user',ID);
 fetch.mockResolvedValueOnce(response({order:{...secondaryOrder,status:'paid',fiscalStatus:'pending_authorization'}}));
 showSupplement(); expect(await screen.findByText(/A faturação deste pedido ainda está em processamento/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova compra'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
});

test('only a fully invoiced supplement can start an explicitly separate new purchase',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID); localStorage.setItem('circ-production-supplementary-order:user',ID);
 fetch.mockResolvedValueOnce(response({order:{...secondaryOrder,status:'paid',fiscalStatus:'issued',fiscalDocumentNo:'FR CIRC2027/42'}}));
 const onNewPurchase=jest.fn(); showSupplement({onNewPurchase});
 fireEvent.click(await screen.findByRole('button',{name:'Preparar nova compra'}));
 expect(onNewPurchase).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBeNull();
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
});

test('a different catalogue selection invalidates the frozen preview and acknowledgement',async()=>{
 fetch.mockResolvedValueOnce(response(preview)); const view=show();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 fireEvent.click(await screen.findByRole('checkbox')); expect(screen.getByRole('button',{name:'Gerar referência Multibanco'})).toBeEnabled();
 view.rerender(<MemoryRouter><PublicLiveCheckout user={user} selection={{...selection,congressMode:'virtual'}} eligible /></MemoryRouter>);
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(0);
});

test('creation locks the catalogue before waiting for an authentication token',async()=>{
 let release;
 const token = new Promise(resolve=>{release=resolve;});
 const account={uid:user.uid,getIdToken:jest.fn().mockResolvedValueOnce('session').mockImplementationOnce(()=>token)};
 fetch.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order}));
 const onLock=jest.fn(); show({user:account,onLock});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'})); fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 expect(onLock).toHaveBeenCalledWith(true);
 expect(fetch).toHaveBeenCalledTimes(1);
 release('session'); await screen.findByText('A aguardar pagamento');
});

test('a quote collision also recovers the outstanding supplement without creating a payment',async()=>{
 fetch.mockResolvedValueOnce(response({error:'not-found'},false,404))
  .mockResolvedValueOnce(response({error:'supplementary-order-exists',order:secondaryOrder},false,409));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
 expect(fetch.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(0);
});
