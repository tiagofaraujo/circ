import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '../auth/AuthContext';
import { loadStudentProof, loadStudentRequests, reviewStudentRequest } from '../auth/studentVerificationStore';
import AdminStudentsPage from './AdminStudentsPage';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/studentVerificationStore', () => ({ loadStudentProof: jest.fn(), loadStudentRequests: jest.fn(), reviewStudentRequest: jest.fn(), removeReviewedStudentProof: jest.fn() }));
jest.mock('../components/AdminModuleNav', () => () => null);
const request = { id: 'student', profileName: 'Maria Leonor de Sá', school: 'Escola de Saúde', course: 'IMR', email: 'student@example.test', academicYear: '2026/2027', revision: 1, status: 'pending', proofAvailable: true };
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { uid: 'reviewer' } });
  loadStudentRequests.mockResolvedValue({ items: [request], cursor: null });
  loadStudentProof.mockResolvedValue({ mimeType: 'image/jpeg', base64: '/9j/QUJDREVGR0g=' });
  reviewStudentRequest.mockResolvedValue();
  URL.createObjectURL = jest.fn(() => 'blob:private-proof');
  URL.revokeObjectURL = jest.fn();
});
async function openRequest() {
  render(<AdminStudentsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Maria Leonor de Sá/ }));
  await screen.findByRole('checkbox');
}
test('proofs are loaded only when a request is opened and approval requires document review', async () => {
  render(<AdminStudentsPage />);
  const item = await screen.findByRole('button', { name: /Maria Leonor de Sá/ });
  expect(loadStudentProof).not.toHaveBeenCalled();
  fireEvent.click(item);
  const check = await screen.findByRole('checkbox');
  expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  fireEvent.click(check);
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
  await screen.findByText('Decisão guardada. O estado já está disponível na conta do estudante.');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument());
  expect(reviewStudentRequest).toHaveBeenCalledWith(request, 'approved', '');
});
test('correction requires a reason and sends it to the store', async () => {
  await openRequest();
  expect(screen.getByRole('button', { name: 'Pedir correção' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Nota para o estudante'), { target: { value: 'Falta o ano letivo.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pedir correção' }));
  await screen.findByText('Decisão guardada. O estado já está disponível na conta do estudante.');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pedir correção' })).not.toBeInTheDocument());
  expect(reviewStudentRequest).toHaveBeenCalledWith(request, 'correction', 'Falta o ano letivo.');
});
test('a secretariat member cannot approve their own request in the interface', async () => {
  useAuth.mockReturnValue({ user: { uid: 'student' } });
  await openRequest();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  expect(screen.getByText(/O seu próprio pedido tem de ser analisado/)).toBeInTheDocument();
});
