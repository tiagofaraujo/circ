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
const selection = () => PublicLiveCheckout.mock.calls.at(-1)[0].selection;
beforeEach(() => {
  jest.clearAllMocks(); mockRegistration = null;
  PublicLiveCheckout.mockImplementation(() => <div>Production checkout</div>);
  useAuth.mockReturnValue({ user: { uid: 'participant', emailVerified: true }, isAdmin: false });
});

test('the course catalogue is visible to students but unavailable options cannot enter a live checkout', () => {
  show();
  fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ }));
  expect(screen.getByRole('radio', { name: /Apenas cursos/ })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /Congresso virtual/ })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /Jantar do congresso/ })).toBeDisabled();
  expect(selection()).toEqual({ profile: 'student', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  expect(screen.getByText(/A compra de cursos, jantar, participação virtual/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /15 de novembro|Criar inscrição de teste/ })).not.toBeInTheDocument();
});

test('the published course rates retain the external affiliation for students and the ULS rate for ULS staff', () => {
  show();
  const morningLabel = () => screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ }).closest('label');
  expect(morningLabel()).toHaveTextContent(/35\s*€/);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ }));
  expect(morningLabel()).toHaveTextContent(/35\s*€/);
  fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
  expect(morningLabel()).toHaveTextContent(/20\s*€/);
  expect(selection()).toMatchObject({ profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: false });
});

test('administrators use the same production checkout without a simulated course purchase action', () => {
  useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
  show();
  expect(screen.getByText('Production checkout')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /teste|simular|complementar/i })).not.toBeInTheDocument();
  expect(selection()).toMatchObject({ profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false });
});

test('a legacy administrative sample requires review instead of offering another purchase', () => {
  mockRegistration = { id: 'test-participant', isTest: true, selection: { profile: 'student', congressMode: 'onsite', morningCourse: true } };
  show();
  expect(screen.getByRole('alert')).toHaveTextContent('necessita de conferência pela organização');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(PublicLiveCheckout).not.toHaveBeenCalled();
});
