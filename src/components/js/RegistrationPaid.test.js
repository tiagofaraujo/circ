import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExistingRegistrationAddOns } from './RegistrationBuilder';
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: () => ({ approved: true }) }));
const registration = { id: 'circ-2027-user', participantName: 'Participante Teste', voucherId: 'voucher', isTest: false,
 selection: { profile: 'external', courseAffiliation: 'external', congressMode: 'onsite' },
 entitlements: { morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 },
 payment: { status: 'paid', amountCents: 0, coveredAmountCents: 9500, payer: 'Empresa' } };
test('paid voucher shows actual entitlements and allows supplementary selection without test payments', () => {
 render(<MemoryRouter><ExistingRegistrationAddOns registration={registration} orders={[]} user={{uid:'user'}} en={false} period="early" /></MemoryRouter>);
 expect(screen.getByRole('heading', {name:'Resumo da inscrição'})).toBeInTheDocument();
 expect(screen.getByRole('link', {name:/Adicionar cursos e jantares/})).toBeInTheDocument();
 const choices=screen.getAllByRole('checkbox');
 expect(choices[0]).toBeChecked(); expect(choices[0]).toBeDisabled();
 fireEvent.click(choices[1]); expect(choices[1]).toBeChecked();
 expect(screen.getByText(/O pagamento de complementos ainda não está disponível/)).toBeInTheDocument();
 expect(screen.queryByRole('button', {name:/Criar pedido complementar de teste/})).not.toBeInTheDocument();
});
