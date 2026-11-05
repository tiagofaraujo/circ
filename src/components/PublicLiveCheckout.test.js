import React, { act } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
let configuration, billingReadiness;
beforeEach(() => {
 localStorage.clear(); transport.mockReset();
 configuration = { enabled:true, environment:'production', methods:['multibanco'] };
 billingReadiness = { ready:true, issues:[] };
 global.fetch = jest.fn((url, options) => url === '/api/checkout/live/config' ? Promise.resolve(response(configuration))
  : url === '/api/checkout/live/billing-readiness' ? Promise.resolve(response(billingReadiness)) : transport(url, options));
 Object.defineProperty(window, 'crypto', { configurable:true, value:{ randomUUID:() => ID } });
});
test('scheduled opening shows the date, blocks new payment and refreshes configuration at midnight', async () => {
 jest.useFakeTimers().setSystemTime(new Date('2026-11-14T23:59:58Z'));
 configuration={enabled:false,environment:'production',publicOpen:false,methods:[],registrationOpenAt:'2026-11-15T00:00:00Z'};
 const view=show();
 try {
  expect(await screen.findByText('Os pagamentos abrem a 15 de novembro de 2026, às 00h00 de Lisboa.')).toHaveAttribute('role','status');
  expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
  expect(transport).not.toHaveBeenCalled();
  configuration={...configuration,enabled:true,publicOpen:true,methods:['multibanco']};
  await act(async()=>{jest.advanceTimersByTime(2025);});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeEnabled());
  expect(screen.queryByText('Os pagamentos abrem a 15 de novembro de 2026, às 00h00 de Lisboa.')).not.toBeInTheDocument();
  expect(transport).not.toHaveBeenCalled();
 } finally { view.unmount();jest.useRealTimers(); }
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
 const account={uid:user.uid,getIdToken:jest.fn().mockResolvedValueOnce('session').mockResolvedValueOnce('session').mockResolvedValueOnce('session').mockImplementationOnce(()=>token)};
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

const liveMbwayOrder={...mbwayOrder,reference:'MBWAY-REF',canRetry:false};
const closedMbwayOrder={...liveMbwayOrder,status:'expired',canRetry:true,paidAt:null};
const mbwayRegistration={id:'circ-2027-user',status:'submitted',payment:{orderId:ID,status:'pending',method:'mbway'}};
test('only explicit MB WAY reconciliation and a fresh billing, phone and consent review can create a replacement UUID',async()=>{
 configuration.methods=['mbway']; const uuid=jest.fn(()=>PRIMARY_ID);
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:uuid}});
 transport.mockResolvedValueOnce(response({order:liveMbwayOrder})).mockResolvedValueOnce(response({order:closedMbwayOrder}))
  .mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 const onLock=jest.fn(); show({registration:mbwayRegistration,onLock});
 const reconcile=await screen.findByRole('button',{name:'Consultar pedido na MB WAY'});
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 fireEvent.click(reconcile); fireEvent.click(reconcile);
 fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 expect(transport.mock.calls[1][0]).toBe(`/api/checkout/live/orders/${ID}/mbway-reconcile`);
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({});
 expect(uuid).not.toHaveBeenCalled(); expect(localStorage.getItem('circ-production-order:user')).toBeNull();
 expect(screen.getByRole('textbox',{name:/Número MB WAY/})).toHaveValue('');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'+351 923456789'}});
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 const create=await screen.findByRole('button',{name:'Enviar pedido MB WAY'}); expect(create).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(create);
 await screen.findByText(/Confirme este pedido na aplicação MB WAY/);
 expect(uuid).toHaveBeenCalledTimes(1);
 expect(JSON.parse(transport.mock.calls[2][1].body)).toEqual({selection});
 expect(JSON.parse(transport.mock.calls[3][1].body)).toEqual({id:PRIMARY_ID,selection,stamp:preview.stamp,billingStamp:preview.billingStamp,method:'mbway',phone:'923456789',replacesOrderId:ID});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(onLock).toHaveBeenCalledWith(false);
});
test.each([
 ['pending',true,null],['expired',false,null],['cancelled',undefined,null],['expired','true',null],['expired',true,'2026-11-01T12:00:00Z'],
])('status %s permission %s and paidAt %s cannot independently allow a new payment',async(status,canRetry,paidAt)=>{
 transport.mockResolvedValueOnce(response({order:{...liveMbwayOrder,status,canRetry,paidAt}}));
 show({registration:mbwayRegistration}); await screen.findByText(ID,{selector:'code'});
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('an unconfirmed MB WAY reference cannot be reconciled or retried by the browser',async()=>{
 transport.mockResolvedValueOnce(response({order:{...liveMbwayOrder,status:'creation_unknown',reference:null,canRetry:true}}));
 show({registration:mbwayRegistration}); await screen.findByText('Pedido por confirmar');
 expect(screen.queryByRole('button',{name:'Consultar pedido na MB WAY'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('reconciliation that still reports pending never enables retry and polling only reads the existing order',async()=>{
 jest.useFakeTimers();
 try{
  transport.mockResolvedValue(response({order:liveMbwayOrder})); show({registration:mbwayRegistration});
  fireEvent.click(await screen.findByRole('button',{name:'Consultar pedido na MB WAY'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Consultar pedido na MB WAY'})).toBeEnabled());
  await act(async()=>{jest.advanceTimersByTime(15000);});
  expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
  expect(transport.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(1);
  expect(transport.mock.calls.every(([url,options])=>options.method==='GET'||url.endsWith('/mbway-reconcile'))).toBe(true);
 }finally{jest.useRealTimers();}
});
test('a lost reconciliation response keeps the existing UUID and never prepares another payment',async()=>{
 transport.mockResolvedValueOnce(response({order:liveMbwayOrder})).mockRejectedValueOnce(new Error('lost'));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Consultar pedido na MB WAY'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('não envie outro pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(transport).toHaveBeenCalledTimes(2);
});
test('a historical local order follows its server replacement instead of offering another attempt',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...closedMbwayOrder,canRetry:false,replacementOrderId:PRIMARY_ID}}))
  .mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 show({registration:{...mbwayRegistration,payment:{...mbwayRegistration.payment,orderId:PRIMARY_ID}}});
 await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls.map(([url])=>url)).toEqual([`/api/checkout/live/orders/${ID}`,`/api/checkout/live/orders/${PRIMARY_ID}`]);
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
});
test('a retained new UUID takes precedence over a stale registration after a lost creation response',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 show({registration:mbwayRegistration}); await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls[0][0]).toBe(`/api/checkout/live/orders/${PRIMARY_ID}`);
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
});
test('a new UUID with an unresolved lookup is retained even when the registration still refers to an old closed attempt',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404));
 show({registration:mbwayRegistration}); expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
});
test('a lost replacement creation response retains the new UUID for recovery with the old registration',async()=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error('lost'));
 const view=show({registration:mbwayRegistration});
 fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByRole('alert'); expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 view.unmount(); transport.mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 show({registration:mbwayRegistration}); await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls.at(-1)[0]).toBe(`/api/checkout/live/orders/${PRIMARY_ID}`);
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});
test('a server prewrite conflict recovers another browser replacement without another payment creation',async()=>{
 configuration.methods=['mbway']; const candidate='33333333-3333-4333-8333-333333333333';
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>candidate}});
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error:'replacement-required'},false,409))
  .mockResolvedValueOnce(response({order:{...closedMbwayOrder,canRetry:false,replacementOrderId:PRIMARY_ID}}))
  .mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
});
test('a late confirmed payment wins over a retry preparation and keeps the receipt in organiser review',async()=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 const paid={...liveMbwayOrder,status:'paid',canRetry:false,fiscalStatus:'review_required',paidAt:'2026-11-01T12:00:00Z'};
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error:'registration-exists'},false,409)).mockResolvedValueOnce(response({order:paid}));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText('Pagamento confirmado');
 expect(screen.getByText(/A fatura-recibo está pendente de conferência pela organização/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(screen.queryByText('A aguardar pagamento')).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('a supplementary retry preserves the primary payment UUID and submits the predecessor on its own endpoint',async()=>{
 configuration.methods=['mbway']; localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 const next='33333333-3333-4333-8333-333333333333'; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>next}});
 transport.mockResolvedValueOnce(response({order:{...closedMbwayOrder,kind:'supplementary',amountCents:6500}}))
  .mockResolvedValueOnce(response(secondaryPreview)).mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:next,kind:'supplementary',amountCents:6500}}));
 showSupplement(); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls[2][0]).toBe('/api/checkout/live/supplementary/orders');
 expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({id:next,replacesOrderId:ID,method:'mbway',selection:secondarySelection});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(next);
 expect(transport.mock.calls[0][0]).toBe('/api/checkout/live/supplementary-order');
});
test.each([
 ['replacement-check-unavailable','expired',503],['replacement-not-closed','review_required',409],
])('a definitive precreation %s restores the predecessor and discards only the unreserved candidate',async(error,status,httpStatus)=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 const predecessor={...closedMbwayOrder,status,canRetry:false};
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error,order:predecessor},false,httpStatus));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi criado um novo pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.getByText(ID,{selector:'code'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument();
 expect(transport).toHaveBeenCalledTimes(3);
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});
test('a failed predecessor closure check needs a fresh read and a new explicit preparation before another attempt',async()=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error:'replacement-check-unavailable',order:{...closedMbwayOrder,canRetry:false}},false,503))
  .mockResolvedValueOnce(response({order:closedMbwayOrder}));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'})); await screen.findByRole('alert');
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Atualizar estado do pagamento'}));
 fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 expect(screen.getByRole('textbox',{name:/Número MB WAY/})).toHaveValue('');
 expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
 expect(transport.mock.calls[3][0]).toBe(`/api/checkout/live/orders/${ID}`);
 expect(transport.mock.calls[3][1].method).toBe('GET');
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});
test('an invalid predecessor in a precreation refusal is not adopted and is recovered by its known identifier',async()=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error:'replacement-not-closed',order:{...closedMbwayOrder,id:PRIMARY_ID,canRetry:false}},false,409))
  .mockResolvedValueOnce(response({order:{...liveMbwayOrder,status:'review_required',canRetry:false}}));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'})); await screen.findByRole('alert');
 expect(transport.mock.calls[3][0]).toBe(`/api/checkout/live/orders/${ID}`);
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
});
test('a missing precreation predecessor and failed reread retain the known old identifier with creation blocked',async()=>{
 configuration.methods=['mbway']; Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 transport.mockResolvedValueOnce(response({order:closedMbwayOrder})).mockResolvedValueOnce(response(preview))
  .mockResolvedValueOnce(response({error:'replacement-check-unavailable'},false,503)).mockRejectedValueOnce(new Error('offline'));
 show({registration:mbwayRegistration}); fireEvent.click(await screen.findByRole('button',{name:'Preparar nova tentativa de pagamento'}));
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await reviewAndAcknowledge(); fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Consulte o estado deste pedido');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.getByRole('button',{name:'Atualizar estado do pagamento'})).toBeEnabled();
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Enviar pedido MB WAY'})).not.toBeInTheDocument();
});

const historicalOrder={...order,kind:'primary',status:'paid',historicalRegistration:true,fiscalStatus:'issued',fiscalDocumentNo:'FR CIRC2027/old'};
test('an explicitly archived order followed by an empty canonical lookup permits a fully new MB WAY review',async()=>{
 configuration.methods=['mbway']; localStorage.setItem('circ-production-order:user',ID);
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>PRIMARY_ID}});
 transport.mockResolvedValueOnce(response({order:historicalOrder})).mockResolvedValueOnce(response({error:'not-found'},false,404))
  .mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({order:{...liveMbwayOrder,id:PRIMARY_ID}}));
 show(); await screen.findByRole('textbox',{name:/Número MB WAY/});
 await waitFor(()=>expect(localStorage.getItem('circ-production-order:user')).toBeNull());
 expect(transport.mock.calls.map(([url])=>url)).toEqual([`/api/checkout/live/orders/${ID}`,'/api/checkout/live/primary-order']);
 expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument();
 expect(screen.queryByText('FR CIRC2027/old')).not.toBeInTheDocument();
 fireEvent.change(screen.getByRole('textbox',{name:/Número MB WAY/}),{target:{value:'912345678'}});
 await ready(); await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Enviar pedido MB WAY'}));
 await screen.findByText('A aguardar pagamento');
 expect(JSON.parse(transport.mock.calls[3][1].body)).toEqual({id:PRIMARY_ID,selection,stamp:preview.stamp,billingStamp:preview.billingStamp,method:'mbway',phone:'912345678'});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
});
test('a canonical active order replaces an archived browser UUID without exposing another payment action',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:historicalOrder})).mockResolvedValueOnce(response({order:{...order,id:PRIMARY_ID,kind:'primary'}}));
 show(); await screen.findByText('A aguardar pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(screen.queryByRole('button',{name:'Rever valor e faturação'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a canonical lookup failure preserves the historical recovery handle and blocks a new payment',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:historicalOrder})).mockRejectedValueOnce(new Error('offline'));
 show();expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(transport).toHaveBeenCalledTimes(2);
});
test('an ordinary missing saved order is never treated as permission to abandon its UUID',async()=>{
 localStorage.setItem('circ-production-order:user',ID);transport.mockResolvedValueOnce(response({error:'not-found'},false,404));
 show();expect(await screen.findByRole('alert')).toHaveTextContent('Não gere outro pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
});
test('a historical marker must be the explicit boolean and belong to the requested order',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...historicalOrder,historicalRegistration:'true'}}));
 show();await screen.findByText('Pagamento confirmado');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(transport).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button',{name:'Rever valor e faturação'})).not.toBeInTheDocument();
});
test('a historical response with a different identifier cannot clear the saved order',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...historicalOrder,id:PRIMARY_ID}}));
 show();await screen.findByRole('alert');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(transport).toHaveBeenCalledTimes(1);
});
test('a stale registration snapshot stays blocked after archival until the subscription removes it',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:historicalOrder})).mockResolvedValueOnce(response({error:'not-found'},false,404));
 const onLock=jest.fn(), registration={id:'circ-2027-user',payment:{orderId:ID,status:'pending',method:'multibanco'}};
 const view=show({registration,onLock});await screen.findByText(/A inscrição anterior foi arquivada/);
 expect(localStorage.getItem('circ-production-order:user')).toBeNull();
 expect(screen.queryByRole('button',{name:'Rever valor e faturação'})).not.toBeInTheDocument();
 view.rerender(<MemoryRouter><PublicLiveCheckout user={user} selection={selection} eligible registration={null} onLock={onLock}/></MemoryRouter>);
 await ready();expect(onLock).toHaveBeenLastCalledWith(false);
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a new payment snapshot for the same registration identifier recovers its active order after archival',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:historicalOrder})).mockResolvedValueOnce(response({error:'not-found'},false,404))
  .mockResolvedValueOnce(response({order:{...order,id:PRIMARY_ID,kind:'primary'}}));
 const registration={id:'circ-2027-user',payment:{orderId:ID,status:'pending',method:'multibanco'}};
 const view=show({registration});await screen.findByText(/A inscrição anterior foi arquivada/);
 view.rerender(<MemoryRouter><PublicLiveCheckout user={user} selection={selection} eligible registration={{...registration,payment:{...registration.payment,orderId:PRIMARY_ID}}}/></MemoryRouter>);
 await screen.findByText('A aguardar pagamento');
 expect(transport.mock.calls[2][0]).toBe(`/api/checkout/live/orders/${PRIMARY_ID}`);
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(screen.queryByRole('button',{name:'Rever valor e faturação'})).not.toBeInTheDocument();
});
test('an archived supplementary UUID is resolved separately and never clears the primary payment handle',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);localStorage.setItem('circ-production-supplementary-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...historicalOrder,kind:'supplementary'}})).mockResolvedValueOnce(response({error:'not-found'},false,404));
 showSupplement();await screen.findByText(/A inscrição anterior foi arquivada/);
 expect(transport.mock.calls[1][0]).toBe('/api/checkout/live/supplementary-order');
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBeNull();
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
});
test('a historical-order creation refusal also requires the explicit marker and a canonical lookup',async()=>{
 transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({error:'historical-order',order:historicalOrder},false,409))
  .mockResolvedValueOnce(response({error:'not-found'},false,404));
 show();await ready();await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await waitFor(()=>expect(localStorage.getItem('circ-production-order:user')).toBeNull());await ready();
 expect(transport.mock.calls[2][0]).toBe('/api/checkout/live/primary-order');
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
});

const STRIPE_ID='cs_live_checkoutSession12345';
const STRIPE_URL=`https://checkout.stripe.com/c/pay/${STRIPE_ID}#stripe-hosted-checkout`;
const stripeOrder={...order,kind:'primary',method:'stripe_card',reference:STRIPE_ID,entity:null,
 stripe:{id:STRIPE_ID,url:STRIPE_URL,expiresAt:1793620800,status:'open',paymentStatus:'unpaid'}};
test('Stripe is one server-enabled method and creates only an acknowledged hosted payment with the UUID retained',async()=>{
 configuration.methods=['stripe_card'];
 transport.mockResolvedValueOnce(response(preview)).mockImplementationOnce(async()=>{
  expect(localStorage.getItem('circ-production-order:user')).toBe(ID);return response({order:stripeOrder});
 });
 show();await ready();expect(screen.getAllByRole('radio')).toHaveLength(1);
 expect(screen.getByRole('radio',{name:'Cartão (Stripe)'})).toBeChecked();
 expect(screen.queryByRole('button',{name:/Apple Pay|Google Pay|PayPal|Klarna|Revolut/i})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 const create=await screen.findByRole('button',{name:'Preparar pagamento na Stripe'});expect(create).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(create);fireEvent.click(create);
 const link=await screen.findByRole('link',{name:'Pagar na Stripe'});
 expect(link).toHaveAttribute('href',STRIPE_URL);expect(link).toHaveAttribute('referrerpolicy','no-referrer');
 expect(link).toHaveAttribute('rel','noopener noreferrer');
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({id:ID,selection,stamp:preview.stamp,billingStamp:preview.billingStamp,method:'stripe_card'});
 expect(transport).toHaveBeenCalledTimes(2);expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
test('a hidden Stripe method has no card option until the server advertises it',async()=>{
 show();await ready();expect(screen.queryByRole('radio',{name:'Cartão (Stripe)'})).not.toBeInTheDocument();
 expect(screen.queryByText(/carteiras digitais disponíveis/)).not.toBeInTheDocument();
});
test.each([
 // eslint-disable-next-line no-script-url -- Untrusted URL fixture must be rejected.
 'javascript:alert(1)',`http://checkout.stripe.com/c/pay/${STRIPE_ID}`,`https://checkout.stripe.com.evil.invalid/c/pay/${STRIPE_ID}`,
 `https://user@checkout.stripe.com/c/pay/${STRIPE_ID}`,`https://checkout.stripe.com:444/c/pay/${STRIPE_ID}`,
 `https://payments.circ-coimbra.org/c/pay/${STRIPE_ID}`,'https://checkout.stripe.com/c/pay/cs_test_checkoutSession12345',
 'https://checkout.stripe.com/c/pay/cs_live_differentSession12345',`https://checkout.stripe.com/c/pay/${STRIPE_ID}/extra`,
 `https://checkout.stripe.com/c/pay/${STRIPE_ID}?redirect=https://example.com`,
])('unsafe or mismatched Stripe URL %s is never offered and never permits another order',async url=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...stripeOrder,stripe:{...stripeOrder.stripe,url}}}));
 show();expect(await screen.findByRole('alert')).toHaveTextContent('endereço seguro');
 expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button',{name:'Preparar pagamento na Stripe'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('Stripe session reference must match the hosted link session',async()=>{
 transport.mockResolvedValueOnce(response({order:{...stripeOrder,reference:'cs_live_differentSession12345'}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});
 await screen.findByRole('alert');expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('an existing pending Stripe payment can be resumed without creating a new session',async()=>{
 localStorage.setItem('circ-production-order:user',ID);transport.mockResolvedValueOnce(response({order:stripeOrder}));
 show();expect(await screen.findByRole('link',{name:'Pagar na Stripe'})).toHaveAttribute('href',STRIPE_URL);
 expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0][1].method).toBe('GET');
});
test.each(['return','cancel','success&payment_status=paid'])('Stripe return query %s neither confirms nor cancels or creates a payment',async outcome=>{
 localStorage.setItem('circ-production-order:user',ID);transport.mockResolvedValueOnce(response({order:stripeOrder}));
 render(<MemoryRouter initialEntries={[`/conta/inscricoes?stripe=${outcome}&order=${ID}`]}><PublicLiveCheckout user={user} selection={selection} eligible/></MemoryRouter>);
 await screen.findByText('A aguardar pagamento');expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Pagar na Stripe'})).toHaveAttribute('href',STRIPE_URL);
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('a lost Stripe creation response retains its UUID and recovers the same hosted session',async()=>{
 configuration.methods=['stripe_card'];transport.mockResolvedValueOnce(response(preview)).mockRejectedValueOnce(new Error('lost'))
  .mockResolvedValueOnce(response({order:stripeOrder}));
 const view=show();await ready();await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Preparar pagamento na Stripe'}));
 await screen.findByRole('alert');expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 view.unmount();show();await screen.findByRole('link',{name:'Pagar na Stripe'});
 expect(transport.mock.calls.at(-1)[0]).toBe(`/api/checkout/live/orders/${ID}`);
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});
test('explicit Stripe reconciliation reads the existing payment without claiming paid from a complete session alone',async()=>{
 transport.mockResolvedValueOnce(response({order:stripeOrder})).mockResolvedValueOnce(response({order:{...stripeOrder,stripe:{...stripeOrder.stripe,status:'complete',paymentStatus:'paid',url:null}}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});
 const inspect=await screen.findByRole('button',{name:'Consultar pedido na Stripe'});
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 fireEvent.click(inspect);fireEvent.click(inspect);
 await screen.findByText(/A conclusão deste pagamento está a ser confirmada/);
 expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(transport.mock.calls[1][0]).toBe(`/api/checkout/live/orders/${ID}/stripe-reconcile`);
 expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({});expect(transport).toHaveBeenCalledTimes(2);
});
test('failed Stripe inspection retains the original payment and prevents a new session',async()=>{
 transport.mockResolvedValueOnce(response({order:stripeOrder})).mockRejectedValueOnce(new Error('offline'));
 show({registration:{id:'registration',payment:{orderId:ID}}});fireEvent.click(await screen.findByRole('button',{name:'Consultar pedido na Stripe'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('não crie outro pagamento');
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
 expect(screen.queryByRole('button',{name:'Preparar pagamento na Stripe'})).not.toBeInTheDocument();
});
test.each(['expired','cancelled'])('a server-closed Stripe request %s has no payment link or general retry',async status=>{
 transport.mockResolvedValueOnce(response({order:{...stripeOrder,status,canRetry:true,stripe:{...stripeOrder.stripe,status:'expired'}}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});await screen.findByText(/Este pedido foi encerrado/);
 expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova tentativa de pagamento'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-order:user')).toBe(ID);
});
test('a passed Stripe deadline does not expire or replace an open session in the browser',async()=>{
 jest.useFakeTimers();
 try{
  transport.mockResolvedValue(response({order:{...stripeOrder,stripe:{...stripeOrder.stripe,expiresAt:946684800}}}));
  show({registration:{id:'registration',payment:{orderId:ID}}});await screen.findByText(/Prazo indicado pela Stripe/);
  await act(async()=>{jest.advanceTimersByTime(15000);});
  expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Pagar na Stripe'})).toBeInTheDocument();
  expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 }finally{jest.useRealTimers();}
});
test('a confirmed Stripe payment never offers payment again and polls the pending receipt until issued',async()=>{
 jest.useFakeTimers();
 try{
  const paid={...stripeOrder,status:'paid',paidAt:'2026-11-01T12:00:00Z',fiscalStatus:'pending',stripe:{...stripeOrder.stripe,status:'complete',paymentStatus:'paid',url:null}};
  transport.mockResolvedValueOnce(response({order:paid})).mockResolvedValueOnce(response({order:{...paid,fiscalStatus:'issued',fiscalDocumentNo:'FR CIRC2027/Stripe'}}));
  show({registration:{id:'registration',payment:{orderId:ID}}});
  await screen.findByText(/A fatura-recibo está em processamento/);
  expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
  await act(async()=>{jest.advanceTimersByTime(5000);});await screen.findByText('FR CIRC2027/Stripe');
  const reads=transport.mock.calls.length;await act(async()=>{jest.advanceTimersByTime(15000);});
  expect(transport).toHaveBeenCalledTimes(reads);expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 }finally{jest.useRealTimers();}
});
test('a paid Stripe order in fiscal review remains confirmed with no payment or resume session link',async()=>{
 transport.mockResolvedValueOnce(response({order:{...stripeOrder,status:'paid',fiscalStatus:'review_required'}}));
 show({registration:{id:'registration',payment:{orderId:ID}}});await screen.findByText('Pagamento confirmado');
 expect(screen.getByText(/A fatura-recibo está pendente de conferência pela organização/)).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Consultar pedido na Stripe'})).not.toBeInTheDocument();
});
test('supplementary Stripe checkout keeps its independent UUID and the original paid registration handle',async()=>{
 configuration.methods=['stripe_card'];localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({error:'not-found'},false,404)).mockResolvedValueOnce(response(secondaryPreview))
  .mockResolvedValueOnce(response({order:{...stripeOrder,kind:'supplementary',amountCents:6500}}));
 showSupplement();await ready();await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Preparar pagamento na Stripe'}));
 await screen.findByRole('link',{name:'Pagar na Stripe'});
 expect(transport.mock.calls[2][0]).toBe('/api/checkout/live/supplementary/orders');
 expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({id:ID,method:'stripe_card',selection:secondarySelection});
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
});
test('a historical Stripe order still requires the explicit archive marker and an empty canonical lookup before release',async()=>{
 localStorage.setItem('circ-production-order:user',ID);
 transport.mockResolvedValueOnce(response({order:{...stripeOrder,status:'paid',historicalRegistration:true}}))
  .mockResolvedValueOnce(response({error:'not-found'},false,404));
 show();await ready();expect(localStorage.getItem('circ-production-order:user')).toBeNull();
 expect(transport.mock.calls[1][0]).toBe('/api/checkout/live/primary-order');
 expect(screen.queryByRole('link',{name:'Pagar na Stripe'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('missing fiscal minima block review with field-specific guidance before any payment request',async()=>{
 billingReadiness={ready:false,issues:['profile-incomplete','billing-tax-number-invalid','billing-address-required','billing-postcode-invalid','billing-city-required','billing-country-unmapped']};
 show();const notice=await screen.findByRole('region',{name:'Dados obrigatórios para faturação'});
 await within(notice).findByText(/NIF: indique um número/);
 expect(within(notice).getByText(/Nome completo: preencha entre 5 e 200/)).toBeInTheDocument();
 expect(within(notice).getByText(/Morada de faturação: preencha/)).toBeInTheDocument();
 expect(within(notice).getByText(/Código postal: utilize o formato 0000-000/)).toBeInTheDocument();
 expect(within(notice).getByText(/Localidade de faturação: preencha/)).toBeInTheDocument();
 expect(within(notice).getByText(/País de faturação: nesta fase é aceite Portugal/)).toBeInTheDocument();
 expect(within(notice).getByRole('link',{name:'Completar dados obrigatórios no Perfil'})).toHaveAttribute('href','/conta/perfil#faturacao');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(transport).not.toHaveBeenCalled();
 expect(fetch).toHaveBeenCalledWith('/api/checkout/live/billing-readiness',expect.objectContaining({method:'GET',headers:{Authorization:'Bearer session'}}));
});
test('a complete optional profile score cannot override invalid required billing details',async()=>{
 localStorage.setItem('circ_demo_account',JSON.stringify({profileCompletionPercentage:100}));
 billingReadiness={ready:false,issues:['billing-tax-number-is-seller']};show();
 await screen.findByText(/NIF: use o número do adquirente/);
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();expect(transport).not.toHaveBeenCalled();
});
test.each([{ready:'true',issues:[]},{ready:true,issues:['billing-address-required']}])('an invalid or inconsistent billing readiness response fails closed (%j)',async readiness=>{
 billingReadiness=readiness;show();
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar os dados de faturação');
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();expect(transport).not.toHaveBeenCalled();
});
test('a failed billing check permits a read-only refresh without automatically preparing payment',async()=>{
 const original=fetch.getMockImplementation();let unavailable=true;
 fetch.mockImplementation((url,options)=>url.endsWith('/billing-readiness')&&unavailable?Promise.reject(new Error('offline')):original(url,options));
 show();await screen.findByRole('alert');unavailable=false;
 fireEvent.click(screen.getByRole('button',{name:'Atualizar dados de faturação'}));await ready();
 expect(screen.queryByRole('region',{name:'Dados obrigatórios para faturação'})).not.toBeInTheDocument();
 expect(transport).not.toHaveBeenCalled();expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('returning from Profile invalidates the previous preview and consent before rechecking billing',async()=>{
 transport.mockResolvedValueOnce(response(preview));show();await ready();await reviewAndAcknowledge();
 expect(screen.getByRole('button',{name:'Gerar referência Multibanco'})).toBeEnabled();
 billingReadiness={ready:false,issues:['billing-tax-number-invalid']};fireEvent(window,new Event('focus'));
 await screen.findByText(/NIF: indique um número/);
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 billingReadiness={ready:true,issues:[]};fireEvent(window,new Event('focus'));await ready();
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(transport.mock.calls.filter(([url])=>url.endsWith('/orders'))).toHaveLength(0);
});
test('an old account billing response cannot unlock the new account checkout',async()=>{
 const original=fetch.getMockImplementation();let release,reads=0;
 fetch.mockImplementation((url,options)=>url.endsWith('/billing-readiness')
  ? ++reads===1?new Promise(resolve=>{release=()=>resolve(response({ready:true,issues:[]}));}):Promise.resolve(response({ready:false,issues:['billing-city-required']}))
  :original(url,options));
 const view=show();await waitFor(()=>expect(reads).toBe(1));
 view.rerender(<MemoryRouter><PublicLiveCheckout user={{...user,uid:'another-account'}} selection={selection} eligible/></MemoryRouter>);
 await screen.findByText(/Localidade de faturação: preencha/);await act(async()=>release());
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();expect(transport).not.toHaveBeenCalled();
});
test('missing current profile details never hide an existing payment with its frozen billing snapshot',async()=>{
 billingReadiness={ready:false,issues:['billing-address-required']};transport.mockResolvedValueOnce(response({order}));
 show({registration:{id:'registration',payment:{orderId:ID}},eligible:false});
 await screen.findByText('123456789',{selector:'dd'});
 expect(screen.queryByRole('region',{name:'Dados obrigatórios para faturação'})).not.toBeInTheDocument();
 expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a billing rejection before order creation clears only that candidate and requires corrected fiscal details',async()=>{
 transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({error:'billing-customer-unconfirmed',issues:['billing-postcode-invalid']},false,409));
 show();await ready();await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByText(/Código postal: utilize o formato 0000-000/);
 expect(localStorage.getItem('circ-production-order:user')).toBeNull();
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
});
test('unknown readiness codes produce safe guidance instead of exposing raw server values',async()=>{
 billingReadiness={ready:false,issues:['untrusted-private-server-detail']};show();
 await screen.findByText('Reveja e guarde os dados de faturação no Perfil.');
 expect(screen.queryByText('untrusted-private-server-detail')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Rever valor e faturação'})).toBeDisabled();
});
test.each([['capacity-full',409],['capacity-unavailable',503],['capacity-review-required',409]])('a precreation %s never strands the new UUID or creates another payment',async(error,status)=>{
 const onCapacityRefresh=jest.fn();transport.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({error,unavailable:['onsite']},false,status));
 show({onCapacityRefresh});await ready();await reviewAndAcknowledge();fireEvent.click(screen.getByRole('button',{name:'Gerar referência Multibanco'}));
 await screen.findByRole('alert');expect(onCapacityRefresh).toHaveBeenCalledTimes(1);
 expect(localStorage.getItem('circ-production-order:user')).toBeNull();
 expect(screen.queryByRole('button',{name:'Gerar referência Multibanco'})).not.toBeInTheDocument();
 expect(transport.mock.calls.filter(([url,options])=>url.endsWith('/orders')&&options.method==='POST')).toHaveLength(1);
});
test('a capacity refusal identifies the finite choices and refreshes availability without creating an order',async()=>{
 const onCapacityRefresh=jest.fn();transport.mockResolvedValueOnce(response({error:'capacity-full',unavailable:['morningCourse','afternoonCourse']},false,409));
 show({onCapacityRefresh});await ready();fireEvent.click(screen.getByRole('button',{name:'Rever valor e faturação'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Curso da manhã · Curso da tarde');
 expect(onCapacityRefresh).toHaveBeenCalledTimes(1);expect(localStorage.getItem('circ-production-order:user')).toBeNull();
});
test('a received payment held for capacity review remains paid and cannot be cleared for another supplement',async()=>{
 localStorage.setItem('circ-production-order:user',PRIMARY_ID);
 transport.mockResolvedValueOnce(response({order:{...secondaryOrder,status:'paid',fiscalStatus:'issued',capacityStatus:'review_required',capacityUnavailable:['afternoonCourse']}}));
 showSupplement();await screen.findByText(/O pagamento foi recebido/);
 expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Preparar nova compra'})).not.toBeInTheDocument();
 expect(localStorage.getItem('circ-production-supplementary-order:user')).toBe(ID);
 expect(localStorage.getItem('circ-production-order:user')).toBe(PRIMARY_ID);
});
test('capacity refreshes once when the existing order becomes paid rather than on every receipt update',async()=>{
 jest.useFakeTimers();
 try{
  const onCapacityRefresh=jest.fn();localStorage.setItem('circ-production-order:user',ID);
  transport.mockResolvedValueOnce(response({order})).mockResolvedValueOnce(response({order:{...order,status:'paid',fiscalStatus:'pending'}}))
   .mockResolvedValueOnce(response({order:{...order,status:'paid',fiscalStatus:'issued',fiscalDocumentNo:'FR CIRC2027/paid'}}));
  show({onCapacityRefresh});await screen.findByText('A aguardar pagamento');expect(onCapacityRefresh).not.toHaveBeenCalled();
  await act(async()=>{jest.advanceTimersByTime(5000);});await screen.findByText('Pagamento confirmado');
  expect(onCapacityRefresh).toHaveBeenCalledTimes(1);
  await act(async()=>{jest.advanceTimersByTime(5000);});await screen.findByText('FR CIRC2027/paid');
  expect(onCapacityRefresh).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
 }finally{jest.useRealTimers();}
});
