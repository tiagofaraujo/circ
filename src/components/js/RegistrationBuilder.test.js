import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import { saveAdminTestRegistration, saveAdminTestAddOnOrder, subscribeToAdminTestRegistration } from '../../auth/registrationStore';
import RegistrationBuilder from './RegistrationBuilder';
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({ verified: false }) }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: jest.fn() }));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
jest.mock('./StudentVerification', () => () => <div>Student document form</div>);
jest.mock('../../auth/registrationStore', () => ({
  subscribeToAdminTestRegistration: jest.fn(),
  subscribeToAdminTestAddOnOrders: (_user, callback) => { callback([]); return () => {}; },
  saveAdminTestRegistration: jest.fn(), saveAdminTestAddOnOrder: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  subscribeToAdminTestRegistration.mockImplementation((_user, callback) => { callback(null); return () => {}; });
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
  expect(screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ })).toBeDisabled();
  expect(screen.getByRole('radio', { name: /Apenas cursos/ })).toBeDisabled();
  useStudentVerification.mockReturnValue({ approved: true });
  rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  expect(congress).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ })).toBeEnabled();
  expect(screen.getByRole('radio', { name: /Apenas cursos/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Inscrições abrem a 15 de novembro' })).toBeDisabled();
});

test('students can select both courses and lose access when approval is withdrawn', () => {
  useStudentVerification.mockReturnValue({ approved: true });
  const { rerender } = render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  const mode = screen.getByRole('radio', { name: /Apenas cursos/ });
  const morning = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ });
  const afternoon = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Tarde/ });
  fireEvent.click(mode);
  fireEvent.click(morning);
  fireEvent.click(afternoon);
  expect(morning).toBeChecked();
  expect(afternoon).toBeChecked();
  expect(screen.getByText(/70\s*€/)).toBeInTheDocument();
  useStudentVerification.mockReturnValue({ approved: false });
  rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  expect(mode).not.toBeChecked();
  expect(morning).not.toBeChecked();
  expect(afternoon).not.toBeChecked();
  expect(morning).toBeDisabled();
});

test('student courses-only simulation requires a course and submits the selected courses', async () => {
  useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Apenas cursos/ }));
  const submit = screen.getByRole('button', { name: 'Criar inscrição de teste' });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Tarde/ }));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(saveAdminTestRegistration).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'admin' }), expect.objectContaining({
      profile: 'student', courseAffiliation: 'external', congressMode: 'courses-only',
      morningCourse: true, afternoonCourse: true, total: 70,
    })
  ));
});

test('a legacy student registration can add the remaining course without buying the same course again', async () => {
  useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
  subscribeToAdminTestRegistration.mockImplementation((_user, callback) => {
    callback({ id: 'test-admin', isTest: true, selection: { profile: 'student', congressMode: 'onsite', morningCourse: true } });
    return () => {};
  });
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  const morning = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ });
  const afternoon = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Tarde/ });
  expect(morning).toBeChecked();
  expect(morning).toBeDisabled();
  expect(afternoon).toBeEnabled();
  fireEvent.click(afternoon);
  fireEvent.click(screen.getByRole('button', { name: /pedido complementar/i }));
  await waitFor(() => expect(saveAdminTestAddOnOrder).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'admin' }), { morningCourse: false, afternoonCourse: true, dinnerQuantity: 0 }
  ));
});
test('administrative simulation remains clearly labelled as a test', () => {
  useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  expect(screen.getByRole('radio', { name: /CIRC 2027/ })).toBeEnabled();
  expect(screen.getByText('Modo de teste administrativo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar inscrição de teste' })).toBeDisabled();
});
