import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SandboxBankTransferReviewPage from './SandboxBankTransferReviewPage';
const mockUser = { uid: 'admin', getIdToken: jest.fn(async () => 'test-token') };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../components/AdminModuleNav', () => () => <nav>Admin</nav>);
const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49', OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const base = () => ({ id: SID, orders: [{ id: OID, method: 'bank_transfer', amountCents: 16000, status: 'pending', createdAt: '2026-10-10T10:00:00Z', bankTransfer: {
  simulated: true, flowVersion: 2, memo: 'C27T-SAMPLE', status: 'under_review', proofs: [], decisions: [], reports: [{ id: SID, at: '2026-10-10T10:00:00Z', note: 'Comunicado sem anexo.' }],
} }] });
const response = data => ({ ok: true, json: async () => JSON.parse(JSON.stringify(data)) });
// Flush initial async data reads and mount effects before a test can interact
// with the review. Finding an element alone need not settle those effects.
const mount = async query => {
  await act(async () => {
    render(<MemoryRouter initialEntries={[`/admin/transferencias-teste${query || ''}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SandboxBankTransferReviewPage /></MemoryRouter>);
  });
};
function setup() {
  let s = base();
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/sessions')) return response({ sessions: [{ id: SID, bankTransfers: s.orders.map(o => ({ id: o.id, memo: o.bankTransfer.memo, status: o.bankTransfer.status, amountCents: o.amountCents, createdAt: o.createdAt, proofCount: 0 })) }], truncated: false });
    if (url.endsWith('/review')) {
      const payload = JSON.parse(options.body);
      s.orders[0].status = 'confirmed'; s.orders[0].bankTransfer.status = 'confirmed';
      s.orders[0].bankTransfer.confirmation = { confirmedAt: '2026-10-10T11:00:00Z', creditReference: payload.creditReference };
      s.orders[0].bankTransfer.decisions.push({ id: OID, action: 'approve', at: '2026-10-10T11:00:00Z', actor: 'admin' });
    }
    return response({ session: s });
  });
}
beforeEach(() => { jest.clearAllMocks(); mockUser.getIdToken.mockResolvedValue('test-token'); Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => OID } }); });
afterEach(() => { delete global.fetch; });
test('queue shows no-proof reports without exposing participant payment controls', async () => {
  setup(); await mount();
  const item = await screen.findByRole('button', { name: /C27T-SAMPLE/ });
  expect(item).toHaveTextContent('Sem comprovativo — opcional');
  expect(screen.queryByRole('button', { name: 'Nova inscrição de teste' })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(item); });
  expect(await screen.findByText(/Sem comprovativo — não impede/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Já fiz a transferência — simular' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copiar IBAN' })).not.toBeInTheDocument();
});
test('a direct test/order link opens the right review and updates queue after approval', async () => {
  setup(); await mount(`?teste=${SID}&pedido=${OID}`);
  const approve = await screen.findByRole('button', { name: 'Validar transferência simulada' });
  expect(approve).toBeDisabled();
  const credit = screen.getByLabelText(/Confirmo, apenas para simulação/);
  await waitFor(() => expect(credit).not.toBeDisabled());
  await act(async () => { fireEvent.click(credit); });
  await waitFor(() => expect(approve).not.toBeDisabled());
  await act(async () => { fireEvent.click(approve); });
  await screen.findByText('Validação manual de teste registada');
  expect(screen.queryByRole('button', { name: /C27T-SAMPLE/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'confirmed' } });
  await screen.findByRole('button', { name: /C27T-SAMPLE/ });
  const [, options] = fetch.mock.calls.find(([url]) => url.endsWith('/review'));
  expect(options.headers.Authorization).toBe('Bearer test-token');
  expect(JSON.parse(options.body)).toMatchObject({ proofId: null, expectedRevision: 1, creditConfirmed: true, sandboxAcknowledged: true });
});
test('permission failures offer a safe error without any review requests', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'admin-required' }) }));
  await mount(); await screen.findByRole('alert');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Validar transferência simulada' })).not.toBeInTheDocument();
});
test('refresh and reopen remain read-only, with the original request identifier', async () => {
  setup(); await mount(`?teste=${SID}&pedido=${OID}`);
  await screen.findByRole('button', { name: 'Validar transferência simulada' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Atualizar fila' })); });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
  expect(screen.getByRole('link', { name: 'Voltar à inscrição de teste' })).toHaveAttribute('href', `/conta/inscricoes-teste?teste=${SID}`);
});
