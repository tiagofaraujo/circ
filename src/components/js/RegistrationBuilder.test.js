import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegistrationBuilder from './RegistrationBuilder';
import { useAuth } from '../../auth/AuthContext';
import { useUlsEligibility } from '../../auth/ulsEligibilityStore';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import { useRegistrationCapacity } from '../../auth/registrationCapacity';
import PublicLiveCheckout from '../PublicLiveCheckout';
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: jest.fn() }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: jest.fn() }));
jest.mock('../../auth/registrationCapacity', () => ({ useRegistrationCapacity: jest.fn() }));
let mockCapacityEnabled;
jest.mock('../../data/registration2027', () => ({
 ...jest.requireActual('../../data/registration2027'),
 get REGISTRATION_CAPACITY_ENABLED() { return mockCapacityEnabled; },
}));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
jest.mock('./StudentVerification', () => () => <div>Student document form</div>);
jest.mock('../CompanyVoucher', () => ({ __esModule: true, default: () => <div>Tem um voucher de empresa?</div>, CompanyRegistrationGate: ({ children }) => children(null) }));
jest.mock('../PublicLiveCheckout', () => jest.fn(() => <div>Production checkout</div>));
const capacity = { status: 'ready', limits: { onsite: 400, morningCourse: 170, afternoonCourse: 170 }, remaining: { onsite: 10, morningCourse: 10, afternoonCourse: 10 }, refresh: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); mockCapacityEnabled = false; useRegistrationCapacity.mockReturnValue(capacity); PublicLiveCheckout.mockImplementation(() => <div>Production checkout</div>); useAuth.mockReturnValue({ user: { uid: 'user', emailVerified: true }, isAdmin: false }); useStudentVerification.mockReturnValue({ approved: false }); useUlsEligibility.mockReturnValue({ verified: false }); });
test('public registration defaults to onsite and exposes the real catalogue without administrative samples', () => {
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByText('Production checkout')).toBeInTheDocument();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } });
 expect(screen.queryByText(/Modo de teste|Criar inscrição de teste|15 de novembro/)).not.toBeInTheDocument();
 expect(screen.getByRole('radio', { name: /Congresso virtual/ })).toBeEnabled();
 expect(screen.getByRole('radio', { name: /Cursos pré-congresso/ })).toBeEnabled();
 expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeEnabled();
});
test('student and ULS rates require eligibility even for the administrator', () => {
 useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
 const { rerender } = render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByText('Student document form')).toBeInTheDocument();
 useStudentVerification.mockReturnValue({ approved: true }); rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(true);
 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
test('onsite ULS participants see how to use an organiser voucher instead of the company voucher form', () => {
 useUlsEligibility.mockReturnValue({ verified: true });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByText('Tem um voucher de empresa?')).toBeInTheDocument();
 expect(screen.queryByText('Tem um voucher de organizador?')).not.toBeInTheDocument();

 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 expect(screen.queryByText('Tem um voucher de empresa?')).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('Tem um voucher de organizador?'));
 expect(screen.getByText(/Pague apenas o congresso presencial à tarifa ULS Coimbra/)).toBeVisible();
 expect(screen.queryByLabelText(/Código do voucher/)).not.toBeInTheDocument();
 expect(screen.queryByRole('button', { name: 'Aplicar voucher de organizador' })).not.toBeInTheDocument();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: {
  profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0,
 } });

 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 expect(screen.getByText('Retire os cursos e os bilhetes de jantar da seleção antes de pagar.')).toBeVisible();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 expect(screen.queryByText('Tem um voucher de organizador?')).not.toBeInTheDocument();
});
test('email verification is required before preparing payment', () => {
 useAuth.mockReturnValue({ user: { uid: 'user', emailVerified: false }, isAdmin: false });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByRole('alert')).toHaveTextContent('Confirme o email');
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
test('full finite options do not replace the current selection and virtual plus dinner remains available', () => {
 mockCapacityEnabled = true;
 useRegistrationCapacity.mockReturnValue({ ...capacity, remaining: { onsite: 0, morningCourse: 0, afternoonCourse: 0 } });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeChecked();
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeDisabled();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeDisabled();
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: { congressMode: 'virtual', dinnerQuantity: 2 } });
 expect(screen.getByText(/Os pedidos pendentes não reservam lugares/)).toBeInTheDocument();
});
test.each(['loading', 'error'])('capacity %s blocks finite purchases but permits virtual attendance', status => {
 mockCapacityEnabled = true;
 useRegistrationCapacity.mockReturnValue({ ...capacity, status, remaining: null });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(true);
 expect(screen.getByRole('radio', { name: /Congresso virtual/ })).toBeEnabled();
});
test('remaining places are visible and the manual refresh is passed through to checkout', () => {
 mockCapacityEnabled = true;
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByText('10 / 400 lugares disponíveis')).toBeInTheDocument();
 expect(screen.getAllByText('10 / 170 lugares disponíveis')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button', { name: 'Atualizar lugares disponíveis' }));
 expect(capacity.refresh).toHaveBeenCalledTimes(1);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].onCapacityRefresh).toBe(capacity.refresh);
});

test('suspended capacity allows onsite registration with both courses and dinner even when the lookup is unavailable', () => {
 useRegistrationCapacity.mockReturnValue({ ...capacity, status: 'error', remaining: null });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(useRegistrationCapacity).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user' }), false);
 expect(screen.queryByRole('region', { name: 'Lugares disponíveis' })).not.toBeInTheDocument();
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeEnabled();
 fireEvent.click(screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: {
  congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 1,
 } });
});
