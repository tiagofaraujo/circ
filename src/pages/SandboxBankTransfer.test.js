import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
const node = (order, en, view) => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SandboxBankTransfer sessionId={ID} order={order} en={en} api={api} run={run} busy={false} onUpdate={update} view={view} /></MemoryRouter>;
const show = (order = base(), en = false, view = 'participant') => render(node(order, en, view));
beforeEach(() => {
  jest.clearAllMocks(); api.mockResolvedValue({ session: { id: ID } });
  Object.defineProperty(window, 'crypto', { value: { randomUUID: () => ID }, configurable: true });
});
test('awaiting proof shows sandbox instructions without real bank details or approval', () => {
  show(); expect(screen.getByText(/O IBAN real não está disponível/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Anexar comprovativo (opcional)'));
  expect(screen.queryByRole('button', { name: 'Validar transferência simulada' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar comprovativo de teste' })).toBeDisabled();
  expect(api).not.toHaveBeenCalled();
});
test('manual approval needs proof review and the explicit simulated credit check', async () => {
  show(pendingReview(), false, 'organisation'); const approve = screen.getByRole('button', { name: 'Validar transferência simulada' });
  expect(approve).toBeDisabled(); fireEvent.click(screen.getByLabelText('Analisei a última versão do comprovativo de teste.'));
  expect(approve).toBeDisabled(); fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  expect(approve).not.toBeDisabled(); fireEvent.click(approve);
  await waitFor(() => expect(update).toHaveBeenCalled());
  const [path, body] = api.mock.calls[0]; expect(path).toMatch(/\/review$/);
  expect(body.decision).toBe('approve'); expect(body.creditConfirmed).toBe(true); expect(body.proofReviewed).toBe(true);
  expect(body.proofId).toBe(PID); expect(body.amount).toBe('160.00'); expect(body.sandboxAcknowledged).toBe(true);
});
test('rejection requires a reason and includes the latest proof ID', async () => {
  show(pendingReview(), false, 'organisation'); const reject = screen.getByRole('button', { name: 'Pedir esclarecimento' });
  expect(reject).toBeDisabled(); fireEvent.change(screen.getByLabelText('Nota / motivo do esclarecimento ou cancelamento'), { target: { value: 'Documento ilegível' } });
  fireEvent.click(reject); await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ decision: 'reject', proofId: PID, reason: 'Documento ilegível' });
});
test('a new proof revision clears the old approval checkboxes', () => {
  const order = pendingReview(); const view = show(order, false, 'organisation');
  fireEvent.click(screen.getByLabelText('Analisei a última versão do comprovativo de teste.'));
  fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  expect(screen.getByRole('button', { name: 'Validar transferência simulada' })).not.toBeDisabled();
  const next = { ...order, bankTransfer: { ...order.bankTransfer, proofs: [...order.bankTransfer.proofs, { ...order.bankTransfer.proofs[0], id: ID }] } };
  view.rerender(node(next, false, 'organisation'));
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
  show(); fireEvent.click(screen.getByText('Anexar comprovativo (opcional)')); fireEvent.click(screen.getByRole('button', { name: 'Usar comprovativo fictício' }));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ filename: 'comprovativo-ficticio.png', mimeType: 'image/png', sampleAcknowledged: true, expectedProofId: null });
  jest.restoreAllMocks();
});
test('English transfer instructions use the same flow', () => {
  show(base(), true); expect(screen.getByText(/The real IBAN is unavailable/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Attach proof (optional)'));
  expect(screen.getByRole('button', { name: 'Use fictional proof' })).toBeInTheDocument();
});

test('participant reports without a file and never sees administrative approval fields', async () => {
  show();
  expect(screen.queryByLabelText('Valor conferido (EUR)')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pedir esclarecimento' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copiar IBAN' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Já fiz a transferência — simular' }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][0]).toMatch(/\/report$/);
  expect(api.mock.calls[0][1]).toMatchObject({ id: ID, expectedRevision: 0, sandboxAcknowledged: true, note: '' });
  expect(api.mock.calls[0][1].base64).toBeUndefined();
  expect(screen.getByRole('link', { name: 'Abrir área da organização' })).toHaveAttribute('href', `/admin/transferencias-teste?teste=${ID}&pedido=${ID}`);
});
test('reported transfers warn against duplicate payment and leave proofs optional', () => {
  const order = base(); order.bankTransfer.status = 'under_review'; order.bankTransfer.reports = [{ id: ID, at: '2026-10-10T10:00:00Z' }];
  show(order); expect(screen.getByText(/Não repita o pagamento/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Já fiz a transferência — simular' })).not.toBeInTheDocument();
  expect(screen.getByText('Anexar comprovativo (opcional)')).toBeInTheDocument();
});
test('organiser can validate a reported transfer without a proof after checking the credit', async () => {
  const order = base(); order.bankTransfer.status = 'under_review'; order.bankTransfer.reports = [{ id: ID, at: '2026-10-10T10:00:00Z' }];
  show(order, false, 'organisation');
  expect(screen.queryByRole('button', { name: 'Já fiz a transferência — simular' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Analisei a última versão do comprovativo de teste.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Validar transferência simulada' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  fireEvent.click(screen.getByRole('button', { name: 'Validar transferência simulada' }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ decision: 'approve', proofId: null, expectedRevision: 1, creditConfirmed: true });
});
test('clarification reason appears to the participant and a new report carries their optional reply', async () => {
  const order = base(); order.bankTransfer.status = 'rejected'; order.bankTransfer.decisions = [{ id: PID, action: 'reject', reason: 'Indique quem fez a transferência', at: '2026-10-10T10:00:00Z' }];
  show(order); expect(screen.getAllByText('Indique quem fez a transferência').length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Resposta (opcional)'), { target: { value: 'Transferiu a empresa.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pedir nova conferência — teste' }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][1]).toMatchObject({ expectedRevision: 1, note: 'Transferiu a empresa.' });
});
test('a new report without a proof clears stale administrative credit confirmation', () => {
  const order = base(); order.bankTransfer.status = 'under_review'; order.bankTransfer.reports = [{ id: ID, at: '2026-10-10T10:00:00Z' }];
  const view = show(order, false, 'organisation'); fireEvent.click(screen.getByLabelText(/Confirmo, apenas para simulação/));
  const next = { ...order, bankTransfer: { ...order.bankTransfer, reports: [...order.bankTransfer.reports, { id: PID, at: '2026-10-10T11:00:00Z' }] } };
  view.rerender(node(next, false, 'organisation'));
  expect(screen.getByRole('button', { name: 'Validar transferência simulada' })).toBeDisabled();
});
