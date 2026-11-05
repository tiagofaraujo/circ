import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExistingRegistrationAddOns } from './RegistrationBuilder';
import PublicLiveCheckout from '../PublicLiveCheckout';
import { useRegistrationCapacity } from '../../auth/registrationCapacity';
jest.mock('../RegistrationInvoice', () => () => <div>Issued invoice</div>);
jest.mock('../PublicLiveCheckout', () => jest.fn(() => <div>Supplement checkout</div>));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({verified:false}) }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: () => ({approved:true}) }));
jest.mock('../../auth/registrationCapacity', () => ({ useRegistrationCapacity: jest.fn() }));
const registration = { id:'circ-2027-user', participantName:'Participante', voucherId:'voucher', isTest:false, status:'confirmed',
 selection:{profile:'external',congressMode:'onsite'}, entitlements:{morningCourse:true,afternoonCourse:false,dinnerQuantity:2},
 payment:{status:'paid',amountCents:0,coveredAmountCents:9500,payer:'Empresa'} };
const user = {uid:'user',emailVerified:true};
const show = (value=registration) => render(<MemoryRouter><ExistingRegistrationAddOns registration={value} user={user} en={false} /></MemoryRouter>);
const capacity = { status: 'ready', limits: { onsite: 400, morningCourse: 170, afternoonCourse: 170 }, remaining: { onsite: 10, morningCourse: 10, afternoonCourse: 10 }, refresh: jest.fn() };
beforeEach(()=>{jest.clearAllMocks();useRegistrationCapacity.mockReturnValue(capacity);PublicLiveCheckout.mockImplementation(()=><div>Supplement checkout</div>);});
test('paid voucher entitlements prevent duplicate courses and supplements have their own checkout',()=>{
 show(); expect(screen.getByRole('heading',{name:'Resumo da inscrição'})).toBeInTheDocument();
 expect(screen.getByRole('checkbox',{name:/Pós-processamento em ressonância magnética/})).toBeChecked();
 expect(screen.getByRole('checkbox',{name:/Pós-processamento em ressonância magnética/})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Via Verde AVC/}));
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'1'}});
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({kind:'supplementary',eligible:true,selection:{morningCourse:false,afternoonCourse:true,dinnerQuantity:1}});
 expect(screen.queryByText('Issued invoice')).not.toBeInTheDocument();
 expect(screen.getByText('Bilhetes de jantar: 2')).toBeInTheDocument();
});
test('an original paid registration retains its invoice and amount while selecting additional purchases',()=>{
 show({...registration,voucherId:null,payment:{status:'paid',amountCents:9500},supplementaryPaidAmountCents:6000});
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'3'}});
 expect(screen.getByText('Issued invoice')).toBeInTheDocument();
 expect(screen.getByText(/95\s*€/)).toBeInTheDocument();
 expect(screen.getByText('Compras adicionais pagas:')).toHaveTextContent(/60\s*€/);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].selection.dinnerQuantity).toBe(3);
 expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
test('cancelled or refunded registrations do not offer a new purchase',()=>{
 show({...registration,status:'cancelled',payment:{status:'refunded',amountCents:9500}});
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(PublicLiveCheckout).not.toHaveBeenCalled();
});
test('a voucher participant can access invoices for their own additional purchases',()=>{
 show({...registration,addOnOrderCount:1,documentCount:1});
 expect(screen.getByText('Documentos das suas compras adicionais')).toBeInTheDocument();
 expect(screen.getByText('Issued invoice')).toBeInTheDocument();
 expect(screen.getByText(/O documento de faturação original pertence à compra da empresa/)).toBeInTheDocument();
});
test('a paid MB WAY registration remains visibly paid while its receipt awaits the organisers',()=>{
 show({...registration,voucherId:null,fiscalPendingOrderId:'11111111-1111-4111-8111-111111111111',payment:{status:'paid',method:'mbway',amountCents:9500}});
 expect(screen.getByText('Paga')).toBeInTheDocument();
 expect(screen.getByText(/A fatura-recibo está pendente de conclusão pela organização/)).toBeInTheDocument();
 expect(screen.queryByText('Em conferência')).not.toBeInTheDocument();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
test('owned courses consume no additional places while dinner remains available when all capacities are full',()=>{
 useRegistrationCapacity.mockReturnValue({...capacity,remaining:{onsite:0,morningCourse:0,afternoonCourse:0}});
 show();
 expect(screen.getByRole('checkbox',{name:/Pós-processamento em ressonância magnética/})).toBeChecked();
 expect(screen.getByRole('checkbox',{name:/Via Verde AVC/})).toBeDisabled();
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'1'}});
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({eligible:true,selection:{morningCourse:false,afternoonCourse:false,dinnerQuantity:1}});
});
test('capacity review preserves the received payment and prevents another purchase without claiming selected entitlements',()=>{
 show({...registration,entitlements:undefined,capacityReviewOrderId:'review-order',selection:{...registration.selection,morningCourse:true},payment:{status:'paid',amountCents:9500}});
 expect(screen.getByText('Pagamento recebido · Vaga em conferência')).toBeInTheDocument();
 expect(screen.getByText(/a vaga ou inscrição aguarda conferência pela organização.*Não efetue outro pagamento/)).toBeInTheDocument();
 expect(screen.queryByText('Curso da manhã incluído')).not.toBeInTheDocument();
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:'Adicionar cursos ou bilhetes de jantar'})).not.toBeInTheDocument();
 expect(PublicLiveCheckout).not.toHaveBeenCalled();
});
