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
