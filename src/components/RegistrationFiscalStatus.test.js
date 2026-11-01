import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegistrationFiscalStatus from './RegistrationFiscalStatus';
import { useAuth } from '../auth/AuthContext';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
const ID='11111111-1111-4111-8111-111111111111';
const registration={isTest:false,userId:'participant',payment:{status:'paid',method:'multibanco',orderId:ID}};
const pending={id:ID,status:'paid',fiscalStatus:'pending_authorization',canResumeFiscal:true,amountCents:5500,currency:'EUR'};
const response=order=>({ok:true,json:async()=>({order})});
function show(value=registration){return render(<MemoryRouter><RegistrationFiscalStatus registration={value}/></MemoryRouter>);}
beforeEach(()=>{global.fetch=jest.fn();useAuth.mockReturnValue({isAdmin:true,user:{uid:'admin',getIdToken:async()=>'session'}});});
test('admin explicitly confirms the existing participant invoice before one resume POST',async()=>{
 fetch.mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response({...pending,fiscalStatus:'issued',canResumeFiscal:false}));
 show();fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 const confirm=screen.getByRole('button',{name:'Confirmar retoma'});expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(confirm);
 expect(await screen.findByText('Fatura-recibo emitida')).toBeInTheDocument();
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({confirmation:'RETOMAR FATURACAO AUTORIZADA'});
});
test('issued, unknown and unapproved jobs never offer a retry',async()=>{
 for(const order of [{...pending,fiscalStatus:'issued'},{...pending,fiscalStatus:'outcome_unknown'},{...pending,canResumeFiscal:false}]){
  fetch.mockResolvedValueOnce(response(order)); const view=show();fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('status');expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();view.unmount();
 }
});
test('a lost POST response locks another attempt until a fresh successful read',async()=>{
 fetch.mockResolvedValueOnce(response(pending)).mockRejectedValueOnce(new Error('network'));
 show();fireEvent.click(screen.getByRole('button'));fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar retoma'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('O resultado da retoma requer consulta');
 expect(screen.getByRole('button',{name:'Confirmar retoma'})).toBeDisabled();expect(fetch).toHaveBeenCalledTimes(2);
});
test('non-administrators cannot use the fiscal controls',()=>{
 useAuth.mockReturnValue({isAdmin:false,user:{uid:'participant'}});show();expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
});
const SUP='22222222-2222-4222-8222-222222222222';
test('the pending supplementary invoice is consulted and resumed without touching the paid primary order',async()=>{
 const supplement={...pending,id:SUP,amountCents:3500};
 fetch.mockResolvedValueOnce(response(supplement)).mockResolvedValueOnce(response({...supplement,fiscalStatus:'issued',canResumeFiscal:false}));
 show({...registration,fiscalPendingOrderId:SUP,documentCount:1});
 expect(screen.getByText('Faturação da compra adicional')).toBeInTheDocument();
 expect(screen.queryByText('Documento fiscal emitido')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar retoma'}));
 await screen.findByText('Fatura-recibo emitida');
 expect(fetch.mock.calls.map(([url])=>url)).toEqual([`/api/checkout/live/orders/${SUP}`,`/api/checkout/live/orders/${SUP}/fiscal-resume`]);
});
test('a company voucher exposes only its pending personal purchase invoice',async()=>{
 const voucher={...registration,payment:{status:'paid',method:'company_voucher'}};
 const view=show(voucher);expect(screen.queryByRole('button')).not.toBeInTheDocument();
 fetch.mockResolvedValueOnce(response({...pending,id:SUP,amountCents:3000}));
 view.rerender(<MemoryRouter><RegistrationFiscalStatus registration={{...voucher,fiscalPendingOrderId:SUP}}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 await screen.findByRole('button',{name:'Retomar faturação autorizada'});
 expect(fetch.mock.calls[0][0]).toBe(`/api/checkout/live/orders/${SUP}`);
});
test('changing the pending fiscal order discards the previous resume confirmation',async()=>{
 fetch.mockResolvedValueOnce(response(pending));const view=show();
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 fireEvent.click(screen.getByRole('checkbox'));
 view.rerender(<MemoryRouter><RegistrationFiscalStatus registration={{...registration,fiscalPendingOrderId:SUP}}/></MemoryRouter>);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Consultar faturação'})).toBeEnabled();
 expect(fetch.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(0);
});
test('a real bank transfer uses the existing order fiscal controls and requires explicit server permission',async()=>{
 fetch.mockResolvedValueOnce(response({...pending,method:'bank_transfer'})).mockResolvedValueOnce(response({...pending,method:'bank_transfer',fiscalStatus:'issued',canResumeFiscal:false}));
 show({...registration,payment:{...registration.payment,method:'bank_transfer'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 const confirm=screen.getByRole('button',{name:'Confirmar retoma'});expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(confirm);
 await screen.findByText('Fatura-recibo emitida');
 expect(fetch.mock.calls.map(([url])=>url)).toEqual([`/api/checkout/live/orders/${ID}`,`/api/checkout/live/orders/${ID}/fiscal-resume`]);
});
test('an unconfirmed bank credit has no fiscal resume even if the job advertises pending authorization',async()=>{
 fetch.mockResolvedValueOnce(response({...pending,status:'pending',method:'bank_transfer'}));
 show({...registration,payment:{...registration.payment,method:'bank_transfer',status:'pending'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 await screen.findByRole('status');
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test.each([false,undefined,'true'])('a pending bank invoice without an explicit true permission never offers resume (%s)',async canResumeFiscal=>{
 fetch.mockResolvedValueOnce(response({...pending,method:'bank_transfer',fiscalStatus:'pending',canResumeFiscal}));
 show({...registration,payment:{...registration.payment,method:'bank_transfer'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 await screen.findByRole('status');
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a server-authorized bank invoice that has not started requires one explicit confirmation to resume',async()=>{
 const notStarted={...pending,method:'bank_transfer',fiscalStatus:'pending',canResumeFiscal:true};
 fetch.mockResolvedValueOnce(response(notStarted)).mockResolvedValueOnce(response({...notStarted,fiscalStatus:'issued',canResumeFiscal:false}));
 show({...registration,fiscalPendingOrderId:ID,payment:{...registration.payment,method:'bank_transfer'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 const resume=await screen.findByRole('button',{name:'Retomar faturação autorizada'});
 expect(screen.getByText('Emissão ainda não iniciada; confirme para retomar.')).toBeInTheDocument();
 expect(screen.queryByText(/Renove primeiro a ligação/)).not.toBeInTheDocument();
 expect(fetch).toHaveBeenCalledTimes(1);
 fireEvent.click(resume); const confirm=screen.getByRole('button',{name:'Confirmar retoma'}); expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Conferi este pagamento confirmado e pretendo retomar a emissão da fatura-recibo.'}));
 fireEvent.click(confirm); fireEvent.click(confirm);
 await screen.findByText('Fatura-recibo emitida');
 expect(fetch.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(1);
 expect(fetch.mock.calls[1][0]).toBe(`/api/checkout/live/orders/${ID}/fiscal-resume`);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({confirmation:'RETOMAR FATURACAO AUTORIZADA'});
});
test('server permission cannot resume a pending invoice before the bank payment is confirmed',async()=>{
 fetch.mockResolvedValueOnce(response({...pending,method:'bank_transfer',status:'pending',fiscalStatus:'pending',canResumeFiscal:true}));
 show({...registration,payment:{...registration.payment,method:'bank_transfer',status:'pending'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'})); await screen.findByRole('status');
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a paid MB WAY order with fiscal review stays confirmed and offers no fiscal retry',async()=>{
 fetch.mockResolvedValueOnce(response({...pending,method:'mbway',fiscalStatus:'review_required',canResumeFiscal:true}));
 show({...registration,payment:{...registration.payment,method:'mbway'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 await screen.findByText('Pagamento confirmado. A fatura-recibo está pendente de conferência pela organização.');
 expect(screen.getByRole('status')).toHaveTextContent('Faturação requer conferência');
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
const stripeReview={...pending,method:'stripe_card',fiscalStatus:'review_required',fiscalResumeReason:'stripe-instrument',canResumeFiscal:true};
test('a server-authorized Stripe instrument review requires explicit confirmation without TOConline renewal',async()=>{
 fetch.mockResolvedValueOnce(response(stripeReview)).mockResolvedValueOnce(response({...stripeReview,fiscalStatus:'issued',canResumeFiscal:false,fiscalDocumentNo:'FR CIRC2027/Stripe'}));
 show({...registration,payment:{...registration.payment,method:'stripe_card'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));
 fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 expect(screen.getByText(/Confira as permissões de leitura da Stripe/)).toBeInTheDocument();
 expect(screen.queryByText(/Renove primeiro a ligação ao TOConline/)).not.toBeInTheDocument();
 const confirm=screen.getByRole('button',{name:'Confirmar retoma'});expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Conferi as permissões de leitura da Stripe e pretendo consultar este pagamento para concluir a faturação.'}));
 fireEvent.click(confirm);fireEvent.click(confirm);await screen.findByText(/FR CIRC2027\/Stripe/);
 expect(fetch.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(1);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({confirmation:'RETOMAR FATURACAO AUTORIZADA'});
});
test.each([
 {canResumeFiscal:false},{canResumeFiscal:undefined},{fiscalResumeReason:undefined},{fiscalResumeReason:'unapproved'},
 {method:'mbway'},{status:'pending'},
])('Stripe review without the exact server permission/reason remains read-only (%j)',async change=>{
 fetch.mockResolvedValueOnce(response({...stripeReview,...change}));
 show({...registration,payment:{...registration.payment,method:'stripe_card'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));await screen.findByRole('status');
 expect(screen.queryByRole('button',{name:'Retomar faturação autorizada'})).not.toBeInTheDocument();
 expect(fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true);
});
test('a Stripe instrument that remains unresolved never claims a receipt was issued',async()=>{
 fetch.mockResolvedValueOnce(response(stripeReview)).mockResolvedValueOnce(response({...stripeReview,canResumeFiscal:false}));
 show({...registration,payment:{...registration.payment,method:'stripe_card'}});
 fireEvent.click(screen.getByRole('button',{name:'Consultar faturação'}));fireEvent.click(await screen.findByRole('button',{name:'Retomar faturação autorizada'}));
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar retoma'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Confirmar retoma'})).not.toBeInTheDocument());
 await screen.findByText('Pagamento confirmado. A fatura-recibo está pendente de conferência pela organização.');
 expect(screen.queryByText('Fatura-recibo emitida')).not.toBeInTheDocument();
 expect(fetch.mock.calls.filter(([,options])=>options.method==='POST')).toHaveLength(1);
});
