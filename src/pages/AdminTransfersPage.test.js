import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminTransfersPage from './AdminTransfersPage';
let mockIsAdmin = true;
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin:mockIsAdmin, user: { uid: 'admin', getIdToken: async () => 'firebase-session' }, access: { canManageRegistrations: true } }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
const ID = '11111111-1111-4111-8111-111111111111';
const DECISION = '22222222-2222-4222-8222-222222222222';
const order = { id: ID, kind: 'primary', ownerName: 'Participante Exemplo', registrationId: 'circ-2027-participant',
  status: 'pending', method: 'bank_transfer', amountCents: 9500, currency: 'EUR', createdAt: '2026-10-30T12:00:00Z',
  bankTransfer: { status: 'under_review', revision: 2, paymentReference: 'CIRC-ABC', payee: 'Associação Hemisfério Disciplinado', iban: 'PT50000000000000000000000' } };
const response = (data, ok = true, status = ok ? 200 : 503) => ({ ok, status, json:async () => Array.isArray(data.orders) ? {truncated:false,nextCursor:null,...data} : data });
const posts = () => fetch.mock.calls.filter(([, options]) => options.method === 'POST');
function show() { return render(<MemoryRouter><AdminTransfersPage /></MemoryRouter>); }
async function openReview() { fireEvent.click(await screen.findByRole('button', { name: 'Conferir' })); }
function fill() {
  fireEvent.change(screen.getByLabelText('Montante creditado (€)'), { target: { value: '95,00' } });
  fireEvent.change(screen.getByLabelText('Data do crédito bancário'), { target: { value: '2026-10-31' } });
  fireEvent.change(screen.getByLabelText('Referência do movimento no extrato'), { target: { value: 'BANK-ENTRY-42' } });
}
beforeEach(() => {
  mockIsAdmin = true;
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => DECISION) } });
  global.fetch = jest.fn(async (_, options) => options.method === 'GET' ? response({ orders: [order], truncated: false })
    : response({ order: { ...order, status: 'paid', bankTransfer: { ...order.bankTransfer, status: 'confirmed', revision: 3 } } }));
});
afterEach(() => { jest.useRealTimers(); });

test('reads the queue and requires actual credit details and explicit confirmation before one approval', async () => {
  show(); await openReview();
  const approve = screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' });
  expect(approve).toBeDisabled(); expect(screen.getByLabelText('Montante creditado (€)')).toHaveValue('');
  fill(); expect(approve).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(approve); fireEvent.click(approve);
  expect(await screen.findByText('Pagamento confirmado. Este pedido não permite uma nova validação.')).toBeInTheDocument();
  expect(posts()).toHaveLength(1);
  expect(JSON.parse(posts()[0][1].body)).toEqual({ id: DECISION, expectedRevision: 2, creditConfirmed: true,
    amountCents: 9500, currency: 'EUR', creditReference: 'BANK-ENTRY-42', bookingDate: '2026-10-31', reason: '' });
  expect(posts()[0][0]).toBe(`/api/checkout/live/orders/${ID}/bank-transfer-review`);
});

test('a future date or invalid decimal cannot produce an approval request', async () => {
  show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
  const approve = screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' });
  fireEvent.change(screen.getByLabelText('Data do crédito bancário'), { target: { value: '2026-11-02' } });
  expect(approve).toBeDisabled(); fireEvent.click(approve); expect(posts()).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Data do crédito bancário'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Montante creditado (€)'), { target: { value: '95,001' } });
  expect(approve).toBeDisabled(); expect(posts()).toHaveLength(0);
});

test('a lost response requires a fresh read and preserves the exact decision UUID and payload for explicit retry', async () => {
  let sent = 0;
  fetch.mockImplementation(async (_, options) => {
    if (options.method === 'GET') return response({ orders: [order] });
    if (sent++ === 0) throw new Error('network');
    return response({ order: { ...order, status: 'paid', bankTransfer: { ...order.bankTransfer, status: 'confirmed', revision: 3 } } });
  });
  show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Atualize a lista antes de voltar a tentar');
  expect(screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' })).toBeDisabled();
  expect(screen.getByLabelText('Montante creditado (€)')).toBeDisabled();
  expect(posts()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
  expect(posts()).toHaveLength(1);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' }));
  await screen.findByText('Pagamento confirmado. Este pedido não permite uma nova validação.');
  expect(posts()).toHaveLength(2); expect(posts()[0][1].body).toBe(posts()[1][1].body);
  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});

test('confirmed payments have no approval controls even when returned in the queue', async () => {
  fetch.mockResolvedValue(response({ orders: [{ ...order, status: 'paid', bankTransfer: { ...order.bankTransfer, status: 'confirmed' } }] }));
  show(); await screen.findByText('Não existem transferências para este filtro.');
  fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'all' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  expect(screen.queryByRole('button', { name: 'Validar crédito e confirmar pagamento' })).not.toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

test('a failed list refresh prevents approval using stale rows', async () => {
  show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
  fetch.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('A confirmação fica indisponível');
  expect(screen.getByRole('button', { name: 'Validar crédito e confirmar pagamento' })).toBeDisabled();
  expect(posts()).toHaveLength(0);
});

test('a delegated manager cannot read or confirm the owner-only transfer queue', () => {
  mockIsAdmin = false; show();
  expect(screen.getByRole('alert')).toHaveTextContent('requer a conta de administração');
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

const SECOND = '33333333-3333-4333-8333-333333333333';
const THIRD = '44444444-4444-4444-8444-444444444444';
const FOURTH = '55555555-5555-4555-8555-555555555555';
const anotherOrder = (id, ownerName) => ({...order,id,ownerName,bankTransfer:{...order.bankTransfer,paymentReference:id}});
async function lookup(id) {
 fireEvent.change(screen.getByLabelText('Pesquisar'),{target:{value:id}});
 fireEvent.click(screen.getByRole('button',{name:'Localizar pedido por identificador'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Localizar pedido por identificador'})).toBeEnabled());
}
test('pagination appends and deduplicates while exact lookup preserves the list and server cursor',async()=>{
 const second=anotherOrder(SECOND,'Segundo'), third=anotherOrder(THIRD,'Terceiro'), fourth=anotherOrder(FOURTH,'Quarto');
 fetch.mockResolvedValueOnce(response({orders:[order,second],truncated:true,nextCursor:SECOND}))
  .mockResolvedValueOnce(response({orders:[second,third],truncated:true,nextCursor:THIRD}))
  .mockResolvedValueOnce(response({orders:[fourth]})).mockResolvedValueOnce(response({orders:[]}));
 show(); fireEvent.click(await screen.findByRole('button',{name:'Carregar mais pedidos'}));
 await screen.findByText('Terceiro'); expect(screen.getByText(/Pedidos carregados: 3/)).toBeInTheDocument();
 expect(screen.getAllByRole('row')).toHaveLength(4);
 expect(fetch.mock.calls[1][0]).toBe(`/api/checkout/live/bank-transfers?after=${SECOND}`);
 const reads=fetch.mock.calls.length;
 fireEvent.change(screen.getByLabelText('Pesquisar'),{target:{value:FOURTH}});
 expect(fetch).toHaveBeenCalledTimes(reads);
 fireEvent.click(screen.getByRole('button',{name:'Localizar pedido por identificador'}));
 await screen.findByRole('heading',{name:'Conferência do crédito bancário'});
 expect(fetch.mock.calls[2][0]).toBe(`/api/checkout/live/bank-transfers?orderId=${FOURTH}`);
 expect(screen.getByText(/Pedidos carregados: 4/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Pesquisar'),{target:{value:''}});
 expect(screen.getAllByRole('row')).toHaveLength(5);
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais pedidos'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Carregar mais pedidos'})).not.toBeInTheDocument());
 expect(fetch.mock.calls[3][0]).toBe(`/api/checkout/live/bank-transfers?after=${THIRD}`);
 expect(screen.getByText('Terceiro')).toBeInTheDocument(); expect(posts()).toHaveLength(0);
});
test('a pending transfer after 100 paid records remains accessible through load more',async()=>{
 const history=Array.from({length:100},(_,index)=>({...anotherOrder(`${String(index+10).padStart(8,'0')}-1111-4111-8111-111111111111`,`Histórico ${index}`),status:'paid',bankTransfer:{...order.bankTransfer,status:'confirmed',revision:3}}));
 const cursor=history[99].id;
 fetch.mockResolvedValueOnce(response({orders:history,truncated:true,nextCursor:cursor})).mockResolvedValueOnce(response({orders:[order]}));
 show(); await screen.findByText('Não existem transferências neste filtro entre os pedidos carregados.');
 expect(screen.getByText(/Ainda existem pedidos por carregar/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais pedidos'}));
 await screen.findByText('Participante Exemplo');
 expect(screen.getByRole('button',{name:'Conferir'})).toBeEnabled();
 expect(fetch.mock.calls[1][0]).toBe(`/api/checkout/live/bank-transfers?after=${cursor}`);
 expect(screen.getByText(/Pedidos carregados: 101/)).toBeInTheDocument();
});
test('an empty filtered page still follows the server cursor to a later pending transfer',async()=>{
 fetch.mockResolvedValueOnce(response({orders:[],truncated:true,nextCursor:SECOND}))
  .mockResolvedValueOnce(response({orders:[],truncated:true,nextCursor:THIRD})).mockResolvedValueOnce(response({orders:[order]}));
 show(); fireEvent.click(await screen.findByRole('button',{name:'Carregar mais pedidos'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Carregar mais pedidos'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais pedidos'}));
 await screen.findByText('Participante Exemplo');
 expect(fetch.mock.calls[2][0]).toBe(`/api/checkout/live/bank-transfers?after=${THIRD}`);
});
test('a repeated or invalid server cursor cannot append untrusted pages',async()=>{
 fetch.mockResolvedValueOnce(response({orders:[order],truncated:true,nextCursor:SECOND}))
  .mockResolvedValueOnce(response({orders:[anotherOrder(THIRD,'Inesperado')],truncated:true,nextCursor:SECOND}));
 show(); fireEvent.click(await screen.findByRole('button',{name:'Carregar mais pedidos'}));
 await screen.findByRole('alert');
 expect(screen.queryByText('Inesperado')).not.toBeInTheDocument();
 expect(screen.getByText(/Pedidos carregados: 1/)).toBeInTheDocument(); expect(posts()).toHaveLength(0);
});
test('an exact lookup validates the returned identifier and preserves the existing queue on a mismatch',async()=>{
 fetch.mockResolvedValueOnce(response({orders:[order]})).mockResolvedValueOnce(response({orders:[order]}));
 show(); await openReview(); await lookup(SECOND);
 expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar');
 expect(screen.getByText(/Pedidos carregados: 1/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'})).toBeDisabled();
 expect(posts()).toHaveLength(0);
});
test('an unknown exact identifier leaves the queue and any uncertain decision intact',async()=>{
 fetch.mockResolvedValueOnce(response({orders:[order]})).mockResolvedValueOnce(response({orders:[]}));
 show(); await openReview(); await lookup(SECOND);
 expect(screen.getByRole('status')).toHaveTextContent('Não foi encontrado um pedido');
 expect(screen.getByText(/Pedidos carregados: 1/)).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Conferência do crédito bancário'})).toBeInTheDocument();
 expect(posts()).toHaveLength(0);
});
test('unrelated pages and lookups never unlock an uncertain credit decision; rereading its order preserves the same decision',async()=>{
 const second=anotherOrder(SECOND,'Segundo'); let sent=0;
 fetch.mockImplementation(async(url,options)=>{
  if(options.method==='POST'){
   if(sent++===0)throw new Error('lost');
   return response({order:{...order,status:'paid',bankTransfer:{...order.bankTransfer,status:'confirmed',revision:3}}});
  }
  if(url.endsWith(`?after=${SECOND}`))return response({orders:[second]});
  if(url.endsWith(`?orderId=${SECOND}`))return response({orders:[second]});
  if(url.endsWith(`?orderId=${ID}`))return response({orders:[order]});
  return response({orders:[order],truncated:true,nextCursor:SECOND});
 });
 show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'})); await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais pedidos'})); await screen.findByText('Segundo');
 expect(screen.getByRole('checkbox')).toBeDisabled();
 await lookup(SECOND);
 fireEvent.change(screen.getByLabelText('Pesquisar'),{target:{value:''}});
 fireEvent.click(screen.getAllByRole('button',{name:'Conferir'})[0]);
 expect(screen.getByRole('checkbox')).toBeDisabled(); expect(posts()).toHaveLength(1);
 await lookup(ID); expect(screen.getByRole('checkbox')).toBeEnabled();
 expect(screen.getByLabelText('Montante creditado (€)')).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'}));
 await screen.findByText('Pagamento confirmado. Este pedido não permite uma nova validação.');
 expect(posts()).toHaveLength(2); expect(posts()[0][1].body).toBe(posts()[1][1].body);
 expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
});
test('refresh keeps a selected order outside the first page through an exact reread',async()=>{
 const second=anotherOrder(SECOND,'Selecionado');
 fetch.mockResolvedValueOnce(response({orders:[order],truncated:true,nextCursor:THIRD})).mockResolvedValueOnce(response({orders:[second]}))
  .mockResolvedValueOnce(response({orders:[order],truncated:true,nextCursor:THIRD})).mockResolvedValueOnce(response({orders:[second]}));
 show(); await screen.findByRole('button',{name:'Carregar mais pedidos'}); await lookup(SECOND);
 fireEvent.click(screen.getByRole('button',{name:'Atualizar lista'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Atualizar lista'})).toBeEnabled());
 expect(fetch.mock.calls[3][0]).toBe(`/api/checkout/live/bank-transfers?orderId=${SECOND}`);
 expect(screen.getByRole('heading',{name:'Conferência do crédito bancário'})).toBeInTheDocument();
 expect(screen.getByText(/Pedidos carregados: 2/)).toBeInTheDocument();
});
test('a lower-revision page cannot regress an already confirmed lookup order',async()=>{
 const paid={...order,status:'paid',bankTransfer:{...order.bankTransfer,status:'confirmed',revision:3}};
 fetch.mockResolvedValueOnce(response({orders:[],truncated:true,nextCursor:SECOND}))
  .mockResolvedValueOnce(response({orders:[paid]})).mockResolvedValueOnce(response({orders:[order]}));
 show(); await screen.findByRole('button',{name:'Carregar mais pedidos'}); await lookup(ID);
 fireEvent.click(screen.getByRole('button',{name:'Carregar mais pedidos'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Carregar mais pedidos'})).not.toBeInTheDocument());
 expect(screen.getByText('Pagamento confirmado. Este pedido não permite uma nova validação.')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Validar crédito e confirmar pagamento'})).not.toBeInTheDocument();
});
test('credit date cannot precede the order creation day in Lisbon',async()=>{
 fetch.mockResolvedValue(response({orders:[{...order,createdAt:'2026-10-24T23:30:00Z'}]}));
 show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
 const date=screen.getByLabelText('Data do crédito bancário'); expect(date).toHaveAttribute('min','2026-10-25');
 fireEvent.change(date,{target:{value:'2026-10-24'}});
 expect(date).toHaveAttribute('aria-invalid','true');
 expect(date).toHaveAccessibleDescription(/anterior/i);
 expect(screen.getByText(/anterior/i)).toBeVisible();
 expect(screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'})).toBeDisabled(); expect(posts()).toHaveLength(0);
});

test('future credit dates and invalid statement references explain the disabled approval without sending a payment request',async()=>{
 show(); await openReview();
 const amount=screen.getByLabelText('Montante creditado (€)');
 const date=screen.getByLabelText('Data do crédito bancário');
 const reference=screen.getByLabelText('Referência do movimento no extrato');
 const approve=screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'});
 fireEvent.change(amount,{target:{value:'55'}});
 fireEvent.change(date,{target:{value:'2026-12-12'}});
 fireEvent.change(reference,{target:{value:'çkjç'}});
 fireEvent.click(screen.getByRole('checkbox'));
 expect(date).toHaveAttribute('aria-invalid','true');
 expect(date).toHaveAccessibleDescription(/posterior/i);
 expect(screen.getByText(/posterior/i)).toBeVisible();
 expect(screen.getByText(/posterior/i)).toHaveTextContent('01/11/2026');
 expect(reference).toHaveAttribute('aria-invalid','true');
 expect(reference).toHaveAccessibleDescription(/referência.*formato válido/i);
 expect(screen.getByText(/referência.*formato válido/i)).toBeVisible();
 expect(approve).toBeDisabled(); fireEvent.click(approve); expect(posts()).toHaveLength(0);

 fireEvent.change(date,{target:{value:'2026-11-01'}});
 expect(date).toHaveAttribute('aria-invalid','false');
 expect(screen.queryByText(/posterior/i)).not.toBeInTheDocument();
 expect(reference).toHaveAttribute('aria-invalid','true');
 expect(approve).toBeDisabled(); fireEvent.click(approve); expect(posts()).toHaveLength(0);

 fireEvent.change(reference,{target:{value:'BCP-ENTRY-42'}});
 expect(reference).toHaveAttribute('aria-invalid','false');
 expect(screen.queryByText(/referência.*formato válido/i)).not.toBeInTheDocument();
 expect(approve).toBeEnabled(); expect(posts()).toHaveLength(0);
});

test('excessive credited amounts and multiline notes stay blocked with field feedback until corrected',async()=>{
 show(); await openReview(); fill(); fireEvent.click(screen.getByRole('checkbox'));
 const amount=screen.getByLabelText('Montante creditado (€)');
 const note=screen.getByLabelText('Observação interna (opcional)');
 const approve=screen.getByRole('button',{name:'Validar crédito e confirmar pagamento'});
 fireEvent.change(amount,{target:{value:'100000,00'}});
 fireEvent.change(note,{target:{value:'Crédito conferido\nMovimento identificado'}});
 expect(amount).toHaveAttribute('aria-invalid','true');
 expect(amount).toHaveAccessibleDescription(/99[\s.]?999/);
 expect(screen.getByText(/99[\s.]?999/)).toBeVisible();
 expect(note).toHaveAttribute('aria-invalid','true');
 expect(note).toHaveAccessibleDescription(/linha|controlo/i);
 expect(screen.getByText(/linha|controlo/i)).toBeVisible();
 expect(approve).toBeDisabled(); fireEvent.click(approve); expect(posts()).toHaveLength(0);

 fireEvent.change(amount,{target:{value:'55,00'}});
 expect(amount).toHaveAttribute('aria-invalid','false');
 expect(note).toHaveAttribute('aria-invalid','true');
 expect(approve).toBeDisabled(); expect(posts()).toHaveLength(0);

 fireEvent.change(note,{target:{value:'Crédito conferido no extrato'}});
 expect(note).toHaveAttribute('aria-invalid','false');
 expect(screen.queryByText(/linha|controlo/i)).not.toBeInTheDocument();
 expect(approve).toBeEnabled(); expect(posts()).toHaveLength(0);
});
