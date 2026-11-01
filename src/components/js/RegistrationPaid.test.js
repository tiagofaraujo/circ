import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExistingRegistrationAddOns } from './RegistrationBuilder';
import PublicLiveCheckout from '../PublicLiveCheckout';
jest.mock('../RegistrationInvoice', () => () => <div>Issued invoice</div>);
jest.mock('../PublicLiveCheckout', () => jest.fn(() => <div>Supplement checkout</div>));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({verified:false}) }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: () => ({approved:true}) }));
const registration = { id:'circ-2027-user', participantName:'Participante', voucherId:'voucher', isTest:false, status:'confirmed',
 selection:{profile:'external',congressMode:'onsite'}, entitlements:{morningCourse:true,afternoonCourse:false,dinnerQuantity:2},
 payment:{status:'paid',amountCents:0,coveredAmountCents:9500,payer:'Empresa'} };
const user = {uid:'user',emailVerified:true};
const show = (value=registration) => render(<MemoryRouter><ExistingRegistrationAddOns registration={value} user={user} en={false} /></MemoryRouter>);
beforeEach(()=>{jest.clearAllMocks();PublicLiveCheckout.mockImplementation(()=><div>Supplement checkout</div>);});
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
