import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { saveAdminTestRegistration, saveAdminTestAddOnOrder, subscribeToAdminTestRegistration } from '../../auth/registrationStore';
import RegistrationBuilder from './RegistrationBuilder';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: () => ({ verified: false }) }));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
// Keep these course scenarios applicable when documentary verification is integrated.
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: () => ({ approved: true }) }), { virtual: true });
jest.mock('./StudentVerification', () => () => <div>Student verification</div>, { virtual: true });
jest.mock('../../auth/registrationStore', () => ({
  subscribeToAdminTestRegistration: jest.fn(),
  subscribeToAdminTestAddOnOrders: (_user, callback) => { callback([]); return () => {}; },
  saveAdminTestRegistration: jest.fn(), saveAdminTestAddOnOrder: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { uid: 'student', emailVerified: true }, isAdmin: false });
  subscribeToAdminTestRegistration.mockImplementation((_user, callback) => { callback(null); return () => {}; });
});

test('students can choose morning, afternoon or both without changing the public opening date', () => {
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Apenas cursos/ }));
  const morning = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ });
  const afternoon = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Tarde/ });
  expect(morning).toBeEnabled();
  expect(afternoon).toBeEnabled();
  fireEvent.click(morning);
  fireEvent.click(afternoon);
  expect(morning).toBeChecked();
  expect(afternoon).toBeChecked();
  expect(screen.getByText(/70\s*€/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inscrições abrem a 15 de novembro' })).toBeDisabled();
});

test('switching from external to student preserves courses and the courses-only option', () => {
  render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
  fireEvent.click(screen.getByRole('radio', { name: /Congressista externo/ }));
  const mode = screen.getByRole('radio', { name: /Apenas cursos/ });
  const morning = screen.getByRole('checkbox', { name: /Curso Pré-Congresso · Manhã/ });
  fireEvent.click(mode);
  fireEvent.click(morning);
  fireEvent.click(screen.getByRole('radio', { name: /Estudante IMR/ }));
  expect(mode).toBeChecked();
  expect(morning).toBeChecked();
  expect(screen.queryByText('Cursos não disponíveis para estudantes')).not.toBeInTheDocument();
});

test('student courses-only simulation requires a course and persists both selected courses', async () => {
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

test('a legacy student registration can add the remaining course once', async () => {
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
