import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicLiveCheckout from './PublicLiveCheckout';
const ID = '11111111-1111-4111-8111-111111111111';
const user = { uid: 'user', getIdToken: async () => 'session' };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const order = { id: ID, status: 'pending', amountCents: 9500, currency: 'EUR', method: 'multibanco', entity: '12345', reference: '123456789' };
const preview = { quote: { amountCents: 9500, currency: 'EUR' }, stamp: 'a'.repeat(64), billingStamp: 'b'.repeat(64), billing: { customer_business_name: 'Pessoa', customer_tax_registration_number: '123456789', customer_address_detail: 'Morada', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' } };
const response = (data, ok = true, status = ok ? 200 : 503) => ({ ok, status, json: async () => data });
function show(props = {}) { return render(<MemoryRouter><PublicLiveCheckout user={user} selection={selection} eligible {...props} /></MemoryRouter>); }
const transport = jest.fn();
let configuration;
beforeEach(() => {
 localStorage.clear(); transport.mockReset();
 configuration = { enabled:true, environment:'production', methods:['multibanco'] };
 global.fetch = jest.fn((url, options) => url === '/api/checkout/live/config' ? Promise.resolve(response(configuration)) : transport(url, options));
 Object.defineProperty(window, 'crypto', { configurable:true, value:{ randomUUID:() => ID } });
});
test('reviews server billing and requires acknowledgement before exactly one real-order request', async () => {
 transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ order }));
 show(); await waitFor(() => expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Rever valor e faturação' }));
 const create = await screen.findByRole('button', { name: 'Gerar referência Multibanco' });
 expect(create).toBeDisabled(); expect(screen.getByText('Pessoa')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(create);
 expect(await screen.findByText('A aguardar pagamento')).toBeInTheDocument();
 expect(transport).toHaveBeenCalledTimes(2);
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({ id: ID, selection, stamp: preview.stamp, billingStamp: preview.billingStamp, method: 'multibanco' });
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('a lost creation response retains its UUID and prevents another creation', async () => {
 transport.mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error('network'));
 show(); await waitFor(() => expect(screen.getByRole('button', { name: 'Rever valor e faturação' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Rever valor e faturação' }));
 fireEvent.click(await screen.findByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('O pedido pode já existir');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button', { name: 'Gerar referência Multibanco' })).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Atualizar estado do pagamento' })).toBeEnabled();
});
test('an existing pending registration is read without creating another quote or order', async () => {
 transport.mockResolvedValueOnce(response({ order }));
 show({ registration: { id: 'circ-2027-user', payment: { orderId: ID } } });
 expect(await screen.findByText('12345', { selector: 'dd' })).toBeInTheDocument();
 expect(transport).toHaveBeenCalledWith(`/api/checkout/live/orders/${ID}`, expect.objectContaining({ method: 'GET' }));
 expect(transport).toHaveBeenCalledTimes(1); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
test('an invalid saved ID fails closed instead of permitting a new reference', async () => {
 localStorage.setItem('circ-production-order:user', 'invalid'); show();
 expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(await screen.findByRole('button', { name: 'Rever valor e faturação' })).toBeDisabled(); expect(transport).not.toHaveBeenCalled();
});

const PRIMARY_ID = '22222222-2222-4222-8222-222222222222';
const secondarySelection = {morningCourse:false,afternoonCourse:true,dinnerQuantity:1};
const paidRegistration = {id:'circ-2027-user',status:'confirmed',payment:{status:'paid',orderId:PRIMARY_ID}};
const secondaryOrder = { ...order, kind:'supplementary', amountCents:6500, selection:secondarySelection };
const secondaryPreview = { ...preview, quote:{amountCents:6500,currency:'EUR',kind:'supplementary'} };
function showSupplement(props={}) { return show({kind:'supplementary',registration:paidRegistration,selection:secondarySelection,...props}); }

test('a supplement recovers its own server slot and uses a separate preview, UUID and payment request', async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview)).mockResolvedValueOnce(response({order:secondaryOrder}));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 expect(transport.mock.calls[0][0]).toBe('/api/checkout/live/supplementary-order');
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls[1][0]).toBe('/api/checkout/live/supplementary/quote');
 expect(transport.mock.calls[2][0]).toBe('/api/checkout/live/supplementary/orders');
 expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({id:ID,selection:secondarySelection,method:'multibanco'});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
});

test('an outstanding supplement from another browser is recovered instead of showing a new reference',async()=>{
 transport.mockResolvedValueOnce(response({order:secondaryOrder})); showSupplement();
 await screen.findByText('A aguardar pagamento');
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});

test('a primary order cannot be adopted as a supplement from a stale browser UUID',async()=>{
 localStorage.setItem('circ-production-supplementary-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...order,kind:'primary'}})); showSupplement();
 expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
});

test('an atomic slot collision recovers the preexisting supplement without another provider request',async()=>{
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview))
  .mockResolvedValueOnce(response({error:'supplementary-order-exists',order:{...secondaryOrder,id:PRIMARY_ID}},false,409));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'})); fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(PRIMARY_ID);
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});

test('a paid supplement with unfinished invoicing cannot be cleared for another purchase',async()=>{
 localStorage.setItem('circ-production-supplementary-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...secondaryOrder,status:'paid',fiscalStatus:'pending_authorization'}}));
 showSupplement(); expect(await screen.findByText(/A faturação deste pedido ainda está em processamento/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova compra'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
});

test('only a fully invoiced supplement can start an explicitly separate new purchase',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID); localStorage.setItem('circ-production-supplementary-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...secondaryOrder,status:'paid',fiscalStatus:'issued',fiscalDocumentNo:'FR CIRC2027/42'}}));
 const onNewPurchase=jest.fn(); showSupplement({onNewPurchase});
 fireEvent.click(await screen.findByRole('button',{name:'Preparar nova compra'}));
 expect(onNewPurchase).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBeNull();
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
});

test('a different catalogue selection invalidates the frozen preview and acknowledgement',async()=>{
 transport.mockResolvedValueOnce(response(preview)); const view=show();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 fireEvent.click(await screen.findByRole('checkbox')); expect(screen.getByRole('button',{name:'Gerar referência Multibanco'})).toBeEnabled();
 view.rerender(<MemoryRouter><PublicLiveCheckout user={user} selection={{...selection,congressMode:'virtual'}} eligible /></MemoryRouter>);
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(transport.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(0);
});

test('creation locks the catalogue before waiting for an authentication token',async()=>{
 let release;
 const token = new Promise(resolve=>{release=resolve;});
 const account={uid:user.uid,getIdToken:jest.fn().mockResolvedValueOnce('session').mockResolvedValueOnce('session').mockImplementationOnce(()=>token)};
 transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order}));
 const onLock=jest.fn(); show({user:account,onLock});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'})); fireEvent.click(await screen.findByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 expect(onLock).toHaveBeenCalledWith(true);
 expect(transport).toHaveBeenCalledTimes(1);
 release('session'); await screen.findByText('A aguardar pagamento');
});

test('a quote collision also recovers the outstanding supplement without creating a payment',async()=>{
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404))
  .mockResolvedValueOnce(response({error:'supplementary-order-exists',order:secondaryOrder},false,409));
 showSupplement(); await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
 expect(transport.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(0);
});

const mbwayOrder = { ...order, method:'mbway', entity:undefined, reference:undefined, expiresAt:'2026-11-01T12:04:00.000Z' };
const bankOrder = { ...order, method:'bank_transfer', entity:undefined, reference:undefined,
 bankTransfer:{ status:'awaiting_transfer', revision:0, payee:'Associação', iban:'PT50 0000 0000 0000 0000 0000 0', paymentReference:ID } };
async function ready() { await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled()); }
async function reviewAndAcknowledge() {
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 fireEvent.click(await screen.findByRole('checkbox'));
}
test('only server-advertised known methods are offered, without a live card option',async()=>{
 configuration.methods=['multibanco','bank_transfer','card']; show(); await ready();
 expect(screen.getByRole('radio',{name:'Multibanco'})).toBeChecked();
 expect(screen.getByRole('radio',{name:'Transferência bancária'})).toBeEnabled();
 expect(screen.queryByRole('radio',{name:'MB WAY'})).not.toBeInTheDocument();
 expect(screen.getAllByRole('radio')).toHaveLength(2);
 expect(fetch).toHaveBeenCalledWith('/api/checkout/live/config',expect.objectContaining({method:'GET'}));
});
test('unavailable or invalid configuration blocks creation while an existing order can still be read',async()=>{
 configuration=null; transport.mockResolvedValueOnce(response({order:mbwayOrder}));
 show({registration:{id:'registration',payment:{orderId:ID}}});
 await screen.findByText(/Confirme este pedido na aplicação MB WAY/);
 expect(screen.queryByRole('button',{name:'Rever valor e faturação'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a disabled checkout has no enabled review action',async()=>{
 configuration.enabled=false; show();
 expect(await screen.findByRole('alert')).toHaveTextContent('temporariamente indisponíveis');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(transport).not.toHaveBeenCalled();
});
test.each(['91234','+44 912345678','123456789'])('MB WAY rejects the invalid Portuguese phone %s before a quote',async phone=>{
 configuration.methods=['mbway']; show();
 fireEvent.change(await screen.findByRole('textbox',{name:/Número MB WAY/}),{target:{value:phone}});
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(transport).not.toHaveBeenCalled();
});
test('MB WAY normalises the Portuguese prefix and creates one acknowledged order without persisting the phone',async()=>{
 configuration.methods=['multibanco','mbway'];
 transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order:mbwayOrder}));
 show(); await ready(); fireEvent.click(screen.getByRole('radio',{name:'MB WAY'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'+351 912 345 678'}});
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 const create=await screen.findByRole('button',{name:'Enviar pedido MB WAY'}); expect(create).toBeDisabled();
 expect(screen.getByText(/\+351 912345678/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(create); fireEvent.click(create);
 await screen.findByText(/Confirme este pedido na aplicação MB WAY/);
 expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({selection});
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({id:ID,selection,stamp:preview.stamp,billingStamp:preview.billingStamp,method:'mbway',phone:'912345678'});
 expect(transport).toHaveBeenCalledTimes(2);
 expect(Object.values(localStorage)).toEqual([ID]);
 expect(screen.queryByText('Entidade')).not.toBeInTheDocument();
});
test('changing the method or MB WAY number invalidates the billing acknowledgement',async()=>{
 configuration.methods=['multibanco','mbway']; transport.mockResolvedValue(response(preview));
 show(); await ready(); await reviewAndAcknowledge();
 fireEvent.click(screen.getByRole('radio',{name:'MB WAY'}));
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); expect(screen.getByRole('button',{name:'Enviar pedido MB WAY'})).toBeEnabled();
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'923456789'}});
 expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([url])=>url.endsWith('/quote'))).toBe(true);
});
test('a lost MB WAY response retains its UUID and only explicit reads can recover it',async()=>{
 configuration.methods=['mbway']; transport.mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response({order:mbwayOrder}));
 show(); fireEvent.change(await screen.findByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText(/O pedido pode já existir/); expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Atualizar estado do pagamento'}));
 await screen.findByText(/Confirme este pedido na aplicação MB WAY/);
 expect(transport.mock.calls.filter(([,options])=>options.method==='POST' && JSON.parse(options.body).method==='mbway')).toHaveLength(1);
 expect(transport.mock.calls.at(-1)[1].method).toBe('GET');
});
test('an MB WAY deadline only gives instructions; polling never expires or recreates the order locally',async()=>{
 jest.useFakeTimers();
 try {
  localStorage.setItem('circ-production-order:user',ID); transport.mockResolvedValue(response({order:{...mbwayOrder,expiresAt:'2000-01-01T00:04:00Z'}}));
  show(); await screen.findByText(/Prazo indicado para aprovação/);
  await act(async()=>{jest.advanceTimersByTime(15000);});
  expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
  expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 } finally { jest.useRealTimers(); }
});
test('a server refusal before creation permits a fresh review without keeping a phantom UUID',async()=>{
 configuration.methods=['mbway']; transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({error:'payment-method-unavailable'},false,409));
 const onLock=jest.fn(); show({onLock}); fireEvent.change(await screen.findByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('meio de pagamento não está disponível');
 expect(localStorage.getItem('circ-production-order:user')).toBeNull(); expect(onLock).toHaveBeenLastCalledWith(false);
});
test('bank transfer creates an acknowledged order with the server account and copyable unique reference',async()=>{
 configuration.methods=['bank_transfer']; transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order:bankOrder}));
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockResolvedValue(undefined)}});
 show(); await ready(); await reviewAndAcknowledge();
 fireEvent.click(screen.getByRole('button',{name:'Preparar transferência bancária'}));
 await screen.findByRole('region',{name:'Instruções de transferência bancária'});
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({id:ID,selection,stamp:preview.stamp,billingStamp:preview.billingStamp,method:'bank_transfer'});
 expect(screen.getByText(bankOrder.bankTransfer.iban)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Copiar referência'}));
 expect(await screen.findByText('Referência copiada.')).toBeInTheDocument(); expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ID);
 expect(screen.getByRole('button',{name:'Comunicar transferência efetuada'})).toBeDisabled();
 expect(screen.queryByLabelText(/comprovativo|upload|proof/i)).not.toBeInTheDocument();
});
test('a participant bank report only communicates a transfer and leaves the payment pending',async()=>{
 transport.mockResolvedValueOnce(response({order:bankOrder})).mockResolvedValueOnce(response({order:{...bankOrder,bankTransfer:{...bankOrder.bankTransfer,status:'under_review',revision:1}}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});
 const report=await screen.findByRole('button',{name:'Comunicar transferência efetuada'}); expect(report).toBeDisabled();
 fireEvent.change(screen.getByRole('textbox',{name:/Observação para a organização/}),{target:{value:' Transferência de hoje '}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Já efetuei a transferência/})); fireEvent.click(report);
 await screen.findByText(/Transferência comunicada — aguarda conferência/);
 expect(transport.mock.calls[1][0]).toBe(`/api/checkout/live/orders/${ID}/bank-transfer-report`);
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({id:ID,expectedRevision:0,note:'Transferência de hoje'});
 expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
 expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Comunicar transferência efetuada'})).not.toBeInTheDocument();
});
test('a bank report with an uncertain response requires a fresh read before another explicit report',async()=>{
 transport.mockResolvedValueOnce(response({order:bankOrder})).mockRejectedValueOnce(new Error('lost'))
  .mockResolvedValueOnce(response({order:bankOrder})).mockResolvedValueOnce(response({order:{...bankOrder,bankTransfer:{...bankOrder.bankTransfer,status:'under_review',revision:1}}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});
 const report=await screen.findByRole('button',{name:'Comunicar transferência efetuada'});
 fireEvent.click(screen.getByRole('checkbox',{name:/Já efetuei a transferência/})); fireEvent.click(report);
 await screen.findByText(/Atualize o estado deste pedido antes/); expect(report).toBeDisabled();
 fireEvent.click(report); expect(transport).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Atualizar estado do pagamento'}));
 await waitFor(()=>expect(report).toBeEnabled()); expect(transport.mock.calls[2][1].method).toBe('GET');
 fireEvent.click(report); await screen.findByText(/Transferência comunicada — aguarda conferência/);
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('supplementary MB WAY uses its own endpoint and keeps the primary payment reference intact',async()=>{
 configuration.methods=['mbway']; localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview))
  .mockResolvedValueOnce(response({order:{...secondaryOrder,method:'mbway',expiresAt:mbwayOrder.expiresAt}}));
 showSupplement(); fireEvent.change(await screen.findByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await ready(); await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText(/Confirme este pedido na aplicação MB WAY/);
 expect(transport.mock.calls[2][0]).toBe('/api/checkout/live/supplementary/orders');
 expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({selection:secondarySelection,method:'mbway',phone:'912345678'});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
});
