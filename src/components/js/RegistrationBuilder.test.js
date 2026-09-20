import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import RegistrationBuilder from './RegistrationBuilder';
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({ verified: false }) }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: jest.fn() }));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
jest.mock('./StudentVerification', () => () => <div>Student document form</div>);
jest.mock('../../auth/registrationStore', () => ({
  subscribeToAdminTestRegistration: (_user, callback) => { callback(null); return () => {}; },
  subscribeToAdminTestAddOnOrders: (_user, callback) => { callback([]); return () => {}; },
  saveAdminTestRegistration: jest.fn(), saveAdminTestAddOnOrder: jest.fn(),
}));
beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'student', emailVerified: true }, isAdmin: false });
  useStudentVerification.mockReturnValue({ approved: false });
});
test('only approval unlocks student participation; external remains available', () => {
  const { rerender } = render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Congressista externo/ }));
  const congress = screen.getByRole('radio', { name: /CIRC 2027/ });
  expect(congress).toBeEnabled();
  fireEvent.click(congress);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  expect(congress).toBeDisabled();
  expect(congress).not.toBeChecked();
  useStudentVerification.mockReturnValue({ approved: true });
  rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  expect(congress).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Inscrições abrem a 15 de novembro' })).toBeDisabled();
});
test('administrative simulation remains clearly labelled as a test', () => {
  useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  expect(screen.getByRole('radio', { name: /CIRC 2027/ })).toBeEnabled();
  expect(screen.getByText('Modo de teste administrativo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar inscrição de teste' })).toBeDisabled();
});
