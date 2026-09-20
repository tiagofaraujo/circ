import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { submitStudentVerification, withdrawStudentVerification } from '../../auth/studentVerificationStore';
import StudentVerification from './StudentVerification';
jest.mock('../../auth/studentVerificationStore', () => ({ submitStudentVerification: jest.fn(), withdrawStudentVerification: jest.fn() }));
const user = { uid: 'student', emailVerified: true };
const ready = { status: 'ready', profileName: 'Maria Leonor de Sá', approved: false };
function show(verification = ready, account = user) { return render(<MemoryRouter><StudentVerification user={account} verification={verification} /></MemoryRouter>); }
beforeEach(() => { jest.clearAllMocks(); URL.createObjectURL = jest.fn(() => 'blob:private-proof'); URL.revokeObjectURL = jest.fn(); });
test('requires email verification before offering a document form', () => {
  show(ready, { ...user, emailVerified: false });
  expect(screen.getByText(/Confirme o email da sua conta/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Comprovativo de matrícula')).not.toBeInTheDocument();
});
test('submits school, course and a checked document; no age question', async () => {
  submitStudentVerification.mockResolvedValue();
  const { unmount } = show();
  expect(screen.getByText(/Sem limite de idade/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Escola / instituição'), { target: { value: 'Escola de Saúde' } });
  fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'Imagem Médica e Radioterapia' } });
  fireEvent.change(screen.getByLabelText('Comprovativo de matrícula'), { target: { files: [new File(['%PDF-1.4\n'], 'document.pdf', { type: 'application/pdf' })] } });
  const check = await screen.findByRole('checkbox');
  expect(screen.getByRole('button', { name: 'Enviar para análise' })).toBeDisabled();
  fireEvent.click(check);
  fireEvent.click(screen.getByRole('button', { name: 'Enviar para análise' }));
  await waitFor(() => expect(submitStudentVerification).toHaveBeenCalledWith({ school: 'Escola de Saúde', course: 'Imagem Médica e Radioterapia', proof: { mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' } }));
  expect(await screen.findByText('Comprovativo enviado. Aguarde a análise pelo secretariado.')).toBeInTheDocument();
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-proof');
});
test('shows pending, correction, approval and changed-name states', () => {
  const data = { school: 'Escola de Saúde', course: 'IMR', status: 'pending' };
  const { rerender } = show({ ...ready, data });
  expect(screen.getByText('Comprovativo em análise')).toBeInTheDocument();
  expect(screen.queryByLabelText('Comprovativo de matrícula')).not.toBeInTheDocument();
  rerender(<MemoryRouter><StudentVerification user={user} verification={{ ...ready, data: { ...data, status: 'correction', reviewNote: 'Falta o ano letivo.' } }} /></MemoryRouter>);
  expect(screen.getByText('Falta o ano letivo.')).toBeInTheDocument();
  expect(screen.getByLabelText('Comprovativo de matrícula')).toBeInTheDocument();
  rerender(<MemoryRouter><StudentVerification user={user} verification={{ ...ready, approved: true, data: { ...data, status: 'approved' } }} /></MemoryRouter>);
  expect(screen.getByText('Tarifa de estudante aprovada')).toBeInTheDocument();
  rerender(<MemoryRouter><StudentVerification user={user} verification={{ ...ready, nameChanged: true, data: { ...data, status: 'approved' } }} /></MemoryRouter>);
  expect(screen.getByText('Nome do perfil alterado: é necessária nova análise')).toBeInTheDocument();
  expect(screen.queryByText('Tarifa de estudante aprovada')).not.toBeInTheDocument();
});
test('withdrawal requires explicit confirmation', async () => {
  withdrawStudentVerification.mockResolvedValue();
  show({ ...ready, data: { school: 'Escola', course: 'IMR', status: 'pending' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retirar pedido e apagar comprovativo' }));
  expect(withdrawStudentVerification).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar remoção' })).not.toBeInTheDocument());
  expect(withdrawStudentVerification).toHaveBeenCalledTimes(1);
});
