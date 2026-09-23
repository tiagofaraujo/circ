import { act, fireEvent, render, screen } from '@testing-library/react';
import { loadStudentProof } from '../auth/studentVerificationStore';
import StudentUploadedProof from './StudentUploadedProof';
jest.mock('../auth/studentVerificationStore', () => ({ loadStudentProof: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:private-proof');
  URL.revokeObjectURL = jest.fn();
});
test('a delayed document from an old revision is not shown after replacement', async () => {
  let resolveOld;
  loadStudentProof.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { rerender } = render(<StudentUploadedProof key="student:1" userId="student" revision={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprovativo enviado' }));
  rerender(<StudentUploadedProof key="student:2" userId="student" revision={2} />);
  await act(async () => resolveOld({ mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' }));
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('a denied read shows an error and does not expose a document link', async () => {
  loadStudentProof.mockRejectedValueOnce({ code: 'permission-denied' });
  render(<StudentUploadedProof userId="student" revision={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprovativo enviado' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível aceder ao comprovativo.');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
