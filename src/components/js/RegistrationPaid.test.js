import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExistingRegistrationAddOns } from './RegistrationBuilder';
jest.mock('../RegistrationInvoice', () => () => <div>Issued invoice</div>);
const registration = { id: 'circ-2027-user', participantName: 'Participante', voucherId: 'voucher', isTest: false,
 selection: { profile: 'external', congressMode: 'onsite' }, entitlements: { morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 },
 payment: { status: 'paid', amountCents: 0, coveredAmountCents: 9500, payer: 'Empresa' } };
test('paid registration shows its entitlements without another payment or simulated extras', () => {
 render(<MemoryRouter><ExistingRegistrationAddOns registration={registration} user={{uid:'user'}} en={false} /></MemoryRouter>);
 expect(screen.getByRole('heading', {name:'Resumo da inscrição'})).toBeInTheDocument();
 expect(screen.getByText('Curso da manhã incluído')).toBeInTheDocument();
 expect(screen.getByText('Bilhetes de jantar: 2')).toBeInTheDocument();
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
 expect(screen.queryByText('Issued invoice')).not.toBeInTheDocument();
});
test('a paid real primary registration retains access to its issued invoice', () => {
 render(<MemoryRouter><ExistingRegistrationAddOns registration={{...registration, voucherId:null}} user={{uid:'user'}} en={false} /></MemoryRouter>);
 expect(screen.getByText('Issued invoice')).toBeInTheDocument();
});
