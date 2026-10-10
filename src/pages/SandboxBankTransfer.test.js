import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SandboxBankTransfer from './SandboxBankTransfer';
const ID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const PID = '57892222-b856-41c9-a519-e2cc97bb3b69';
const base = () => ({ id: ID, amountCents: 16000, method: 'bank_transfer', status: 'pending', bankTransfer: {
  simulated: true, memo: `CIRC-TESTE-${ID}-1`, status: 'awaiting_proof', proofs: [], decisions: [],
} });
const pendingReview = () => ({ ...base(), bankTransfer: { ...base().bankTransfer, status: 'under_review',
  proofs: [{ id: PID, filename: 'teste.png', mimeType: 'image/png', uploadedAt: '2026-10-10T10:00:00Z' }],
} });
const api = jest.fn(), update = jest.fn(), run = work => work();
const show = (order = base(), en = false) => render(<SandboxBankTransfer sessionId={ID} order={order} en={en} api={api} run={run} busy={false} onUpdate={update} />);
beforeEach(() => {
  jest.clearAllMocks(); api.mockResolvedValue({ session: { id: ID } });
  Object.defineProperty(window, 'crypto', { value: { randomUUID: () => ID }, configurable: true });
});
test('awaiting proof shows sandbox instructions without real bank details or approval', () => {
  show(); expect(screen.getByText(/Sem IBAN neste ensaio/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Validar transferência simulada' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar comprovativo de teste' })).toBeDisabled();
  expect(api).not.toHaveBeenCalled();
});
test('manual approval needs proof review and the explicit simulated credit check', async () => {
  show(pendingReview()); const approve = screen.getByRole('button', { name: 'Validar transferência simulada' });
  expect(approve).toBeDisabled(); fireEvent.click(screen.getByLabelText('Analisei a última versão do comprovativo de teste.'));
  expect(approve).toBeDisabled(); fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  expect(approve).not.toBeDisabled(); fireEvent.click(approve);
  await waitFor(() => expect(update).toHaveBeenCalled());
  const [path, body] = api.mock.calls[0]; expect(path).toMatch(/\/review$/);
  expect(body.decision).toBe('approve'); expect(body.creditConfirmed).toBe(true); expect(body.proofReviewed).toBe(true);
  expect(body.proofId).toBe(PID); expect(body.amount).toBe('160.00'); expect(body.sandboxAcknowledged).toBe(true);
});
test('rejection requires a reason and includes the latest proof ID', async () => {
  show(pendingReview()); const reject = screen.getByRole('button', { name: 'Recusar comprovativo' });
  expect(reject).toBeDisabled(); fireEvent.change(screen.getByLabelText('Nota / motivo de recusa ou cancelamento'), { target: { value: 'Documento ilegível' } });
  fireEvent.click(reject); await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ decision: 'reject', proofId: PID, reason: 'Documento ilegível' });
});
test('a new proof revision clears the old approval checkboxes', () => {
  const order = pendingReview(); const view = show(order);
  fireEvent.click(screen.getByLabelText('Analisei a última versão do comprovativo de teste.'));
  fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  expect(screen.getByRole('button', { name: 'Validar transferência simulada' })).not.toBeDisabled();
  const next = { ...order, bankTransfer: { ...order.bankTransfer, proofs: [...order.bankTransfer.proofs, { ...order.bankTransfer.proofs[0], id: ID }] } };
  view.rerender(<SandboxBankTransfer sessionId={ID} order={next} en={false} api={api} run={run} busy={false} onUpdate={update} />);
  expect(screen.getByRole('button', { name: 'Validar transferência simulada' })).toBeDisabled();
});
test('a confirmed transfer is read-only and displays its distinct manual validation', () => {
  const order = pendingReview(); order.status = 'confirmed'; order.bankTransfer.confirmation = { confirmedAt: '2026-10-10T10:00:00Z', creditReference: 'TESTE-ABC' };
  show(order); expect(screen.getByText('Validação manual de teste registada')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Validar transferência simulada' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar pedido de teste' })).not.toBeInTheDocument();
});
test('a synthetic PNG can be generated locally without selecting a personal bank document', async () => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: jest.fn(), fillText: jest.fn() });
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
  show(); fireEvent.click(screen.getByRole('button', { name: 'Usar comprovativo fictício' }));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ filename: 'comprovativo-ficticio.png', mimeType: 'image/png', sampleAcknowledged: true, expectedProofId: null });
  jest.restoreAllMocks();
});
test('English transfer instructions use the same flow', () => {
  show(base(), true); expect(screen.getByText(/No IBAN in this rehearsal/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use fictional proof' })).toBeInTheDocument();
});
