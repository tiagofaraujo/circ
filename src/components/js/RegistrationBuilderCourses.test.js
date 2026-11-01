import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import RegistrationBuilder from './RegistrationBuilder';
import PublicLiveCheckout from '../PublicLiveCheckout';
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({ verified: false }) }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: () => ({ approved: true }) }));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
jest.mock('./StudentVerification', () => () => <div>Student verification</div>);
let mockRegistration = null;
jest.mock('../CompanyVoucher', () => ({ __esModule: true, default: () => null, CompanyRegistrationGate: ({ children }) => children(mockRegistration) }));
jest.mock('../PublicLiveCheckout', () => jest.fn(() => <div>Production checkout</div>));
const show = () => render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
const checkout = () => PublicLiveCheckout.mock.calls.at(-1)[0];
beforeEach(() => {
 jest.clearAllMocks(); mockRegistration = null; PublicLiveCheckout.mockImplementation(() => <div>Production checkout</div>);
 useAuth.mockReturnValue({ user: { uid: 'participant', emailVerified: true }, isAdmin: false });
});
test('students can buy one or both courses and courses-only requires at least one selection', () => {
 show(); fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ })); fireEvent.click(screen.getByRole('radio', { name: /Cursos pré-congresso/ }));
 expect(checkout().eligible).toBe(false);
 fireEvent.click(screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ }));
 expect(checkout().eligible).toBe(true);
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 expect(checkout().selection).toEqual({ profile:'student', congressMode:'courses-only', morningCourse:true, afternoonCourse:true, dinnerQuantity:0 });
 expect(screen.getByText(/70\s*€/)).toBeInTheDocument();
});
test('course prices retain the external affiliation for students and the ULS rate for ULS staff', () => {
 show(); const morning = () => screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ }).closest('label');
 expect(morning()).toHaveTextContent(/35\s*€/);
 fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ })); expect(morning()).toHaveTextContent(/35\s*€/);
 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ })); expect(morning()).toHaveTextContent(/20\s*€/);
 expect(checkout().eligible).toBe(false);
});
test('virtual attendance and dinner quantity flow to the frozen server quote without changing the catalogue', () => {
 show(); fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade de bilhetes de jantar' }), { target: { value:'2' } });
 expect(checkout().selection).toEqual({ profile:'external', congressMode:'virtual', morningCourse:false, afternoonCourse:false, dinnerQuantity:2 });
 expect(screen.getByText(/120\s*€/)).toBeInTheDocument();
});
test('a pending primary order freezes the existing selection and an admin has no test bypass', () => {
 mockRegistration = { id:'circ-2027-participant', isTest:false, status:'submitted', selection:{ profile:'student', congressMode:'courses-only', morningCourse:true, afternoonCourse:false, dinnerQuantity:1 }, payment:{status:'pending'} };
 useAuth.mockReturnValue({ user:{uid:'participant', emailVerified:true},isAdmin:true }); show();
 expect(screen.getByRole('radio', { name:/Cursos pré-congresso/ })).toBeChecked();
 expect(screen.getByRole('radio', { name:/Congresso virtual/ })).toBeDisabled();
 expect(screen.getByRole('checkbox', { name:/Pós-processamento em ressonância magnética/ })).toBeChecked();
 expect(screen.getByRole('checkbox', { name:/Via Verde AVC/ })).toBeDisabled();
 expect(checkout().selection).toMatchObject({ congressMode:'courses-only', morningCourse:true,dinnerQuantity:1 });
 expect(screen.queryByRole('button',{name:/teste|simular/i})).not.toBeInTheDocument();
});
