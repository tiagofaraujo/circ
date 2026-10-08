import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AdminSandboxPaymentsPage from './AdminSandboxPaymentsPage';
const mockUser = { uid: 'admin-test', getIdToken: jest.fn(async () => 'test-token') };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../components/AdminModuleNav', () => () => <nav>Admin</nav>);
const ID = '8cf7f394-f73f-444b-bc83-9d6031176942';
const attempt = { id: ID, method: 'multibanco', status: 'pending', reference: '123456789', entity: '12345', identifier: 'circ_test_123' };
const response = value => ({ ok: true, json: async () => value });
beforeEach(() => { mockUser.getIdToken.mockResolvedValue('test-token'); sessionStorage.clear(); global.fetch = jest.fn(); Object.defineProperty(window, 'crypto', { value: { randomUUID: () => ID }, configurable: true }); });
afterEach(() => { delete global.fetch; });
test('admin explicitly creates sandbox request and amount never comes from browser', async () => {
  global.fetch.mockResolvedValueOnce(response({ configured: true })).mockResolvedValueOnce(response({ attempt }));
  render(<AdminSandboxPaymentsPage />);
  const button = await screen.findByRole('button', { name: 'Criar pagamento de teste de 1,00 €' });
  await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
  await screen.findByText('123456789');
  expect(fetch.mock.calls[1][0]).toBe('/api/payments/sandbox/attempts');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ id: ID, method: 'multibanco' });
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
  expect(screen.queryByRole('button', { name: 'Criar pagamento de teste de 1,00 €' })).not.toBeInTheDocument();
});
test('reload restores an existing attempt without creating a second payment', async () => {
  sessionStorage.setItem('circ-eupago-sandbox-admin-test', ID);
  global.fetch.mockResolvedValueOnce(response({ configured: true })).mockResolvedValueOnce(response({ attempt }));
  render(<AdminSandboxPaymentsPage />);
  await screen.findByText('123456789');
  expect(fetch.mock.calls).toHaveLength(2);
  expect(fetch.mock.calls.every(([, options]) => !options.body)).toBe(true);
  expect(screen.getByText(/A confirmação automática das inscrições ainda não está ativa/)).toBeInTheDocument();
});
test('uncertain MB WAY result retains diagnostic and requires backoffice check before a separate test', async () => {
  const previousId = '38c1b0d7-c6af-4d2a-a942-975c95eacb27';
  sessionStorage.setItem('circ-eupago-sandbox-admin-test', previousId);
  const unknown = { id: previousId, method: 'mbway', status: 'creation_unknown', identifier: 'circ_test_previous', creationDiagnostic: 'provider/rejected/code--8' };
  global.fetch.mockResolvedValueOnce(response({ configured: true })).mockResolvedValueOnce(response({ attempt: unknown }))
    .mockResolvedValueOnce(response({ attempt: { ...attempt, method: 'mbway' } }));
  render(<AdminSandboxPaymentsPage />);
  expect(await screen.findByText('provider/rejected/code--8')).toBeInTheDocument();
  const prepare = screen.getByRole('button', { name: 'Preparar outro teste' });
  expect(prepare).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmei no backoffice/ }));
  expect(prepare).not.toBeDisabled(); fireEvent.click(prepare);
  expect(fetch.mock.calls).toHaveLength(2);
  expect(sessionStorage.getItem('circ-eupago-sandbox-admin-test')).toBeNull();
  fireEvent.change(screen.getByLabelText('Meio de pagamento'), { target: { value: 'mbway' } });
  fireEvent.change(screen.getByLabelText(/Número de teste MB WAY/), { target: { value: '987654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar pagamento de teste de 1,00 €' }));
  await screen.findByText('123456789');
  expect(fetch.mock.calls).toHaveLength(3);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ id: ID, method: 'mbway', phone: '987654321' });
  expect(fetch.mock.calls.every(([path, options]) => options.method !== 'DELETE' && !path.includes(`${previousId}/inspect`))).toBe(true);
});
test('non-allowlisted creation diagnostics are not displayed', async () => {
  sessionStorage.setItem('circ-eupago-sandbox-admin-test', ID);
  global.fetch.mockResolvedValueOnce(response({ configured: true })).mockResolvedValueOnce(response({ attempt: { ...attempt, creationDiagnostic: 'provider/secret-data' } }));
  render(<AdminSandboxPaymentsPage />);
  await screen.findByText('123456789');
  expect(screen.queryByText('provider/secret-data')).not.toBeInTheDocument();
});
test('configured page observes a server notification without creating or inspecting a payment', async () => {
  jest.useFakeTimers();
  try {
    sessionStorage.setItem('circ-eupago-sandbox-admin-test', ID);
    global.fetch.mockResolvedValueOnce(response({ configured: true, webhook: {
      signingKeyPresent: true, channelPresent: true, serviceAccountPresent: true, path: '/api/payments/sandbox/notifications/test',
    } })).mockResolvedValueOnce(response({ attempt })).mockResolvedValueOnce(response({ attempt: {
      ...attempt, status: 'sandbox_paid', notification: { receivedAt: '2026-10-07T10:00:00Z', verifiedAt: '2026-10-07T10:00:01Z', transactionId: '1234' },
    } }));
    render(<AdminSandboxPaymentsPage />);
    await screen.findByText('123456789');
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(await screen.findByText('Pagamento de teste validado por notificação e consulta à Eupago')).toBeInTheDocument();
    expect(fetch.mock.calls).toHaveLength(3);
    expect(fetch.mock.calls.every(([path, options]) => !path.endsWith('/inspect') && !options.body)).toBe(true);
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(fetch.mock.calls).toHaveLength(3);
    expect(screen.getByText(/A confirmação automática das inscrições ainda não está ativa/)).toBeInTheDocument();
  } finally { jest.useRealTimers(); }
});
