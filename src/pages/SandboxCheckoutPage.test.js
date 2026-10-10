import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SandboxCheckoutPage from './SandboxCheckoutPage';
const mockUser = { uid: 'admin', getIdToken: jest.fn(async () => 'test-token') };
let mockLanguage = 'pt';
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
jest.mock('../components/AdminModuleNav', () => () => <nav>Admin</nav>);
const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const emptySession = () => ({ id: SID, environment: 'sandbox', createdAt: '2026-10-09T10:00:00Z', registration: null, orders: [], source: 'new' });
const order = () => ({ id: OID, status: 'pending', method: 'mbway', reference: '405001', entity: null,
  identifier: 'circ_order_ce7fcfd4baf74d4e9893d4dd2a0c4e49_1', amountCents: 9500, createdAt: '2026-10-09T10:00:00Z' });
const price = { quote: { amountCents: 9500, lines: [{ code: 'congress-onsite', quantity: 1, amountCents: 9500 }] }, stamp: 'server-price-stamp' };
const response = (value, ok = true) => ({ ok, json: async () => JSON.parse(JSON.stringify(value)) });
function setupFetch(initial = null) {
  let current = initial;
  global.fetch = jest.fn(async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    if (url.endsWith('/config')) return response({ configured: true, maxDinners: 20 });
    if (url.endsWith('/sessions') && !body) return response({ sessions: current ? [{ id: SID, createdAt: current.createdAt, confirmed: Boolean(current.registration) }] : [], truncated: false });
    if (url.endsWith('/sessions') && body) { current = emptySession(); return response({ session: current }); }
    if (url.endsWith('/quote')) return response(price);
    if (url.endsWith('/orders')) { current = { ...current, orders: [order()] }; return response({ session: current }); }
    if (url.endsWith('/inspect')) { current = { ...current, orders: [{ ...current.orders[0], providerState: 'paga' }] }; return response({ session: current }); }
    return response({ session: current });
  });
  return { update: value => { current = value; } };
}
const mount = path => render(<MemoryRouter initialEntries={[path || '/conta/inscricoes-teste']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SandboxCheckoutPage /></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); mockLanguage = 'pt'; mockUser.getIdToken.mockResolvedValue('test-token');
  let ids = 0;
  Object.defineProperty(window, 'crypto', { value: { randomUUID: () => ids++ ? OID : SID }, configurable: true });
});
afterEach(() => { delete global.fetch; jest.useRealTimers(); });
async function newTest() {
  const button = await screen.findByRole('button', { name: 'Nova inscrição de teste' });
  await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
  await screen.findByRole('button', { name: 'Preparar resumo de teste' });
}
test('a payment is created only after server summary and explicit sandbox acknowledgement', async () => {
  setupFetch(); mount(); await newTest();
  expect(fetch.mock.calls.filter(([, o]) => o.body).length).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Preparar resumo de teste' }));
  const create = await screen.findByRole('button', { name: /Criar pedido na sandbox/ }); expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Número MB WAY para a sandbox/), { target: { value: '911111111' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que este pedido/ }));
  expect(create).not.toBeDisabled(); fireEvent.click(create);
  await screen.findByText('405001');
  const [, options] = fetch.mock.calls.find(([url]) => url.endsWith('/orders'));
  const body = JSON.parse(options.body);
  expect(body.stamp).toBe('server-price-stamp'); expect(body.phone).toBe('911111111');
  expect(body.amountCents).toBeUndefined(); expect(body.environment).toBeUndefined();
  expect(options.headers.Authorization).toBe('Bearer test-token');
  expect(JSON.stringify(localStorage)).not.toContain('911111111');
  expect(screen.queryByText(/^Inscrição de teste confirmada$/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nova inscrição de teste' })).toBeDisabled();
});
test('reloading restores an existing checkout without creating or inspecting any payment', async () => {
  const s = { ...emptySession(), orders: [order()] }; setupFetch(s);
  localStorage.setItem('circ-checkout-sandbox-admin', SID); mount();
  await screen.findByText('405001');
  expect(fetch.mock.calls.every(([, options]) => !options.body)).toBe(true);
  expect(screen.getByText(/Não ocupa vagas reais/)).toBeInTheDocument();
});
test('automatic record refresh shows signed confirmation without a manual provider query', async () => {
  jest.useFakeTimers();
  const initial = { ...emptySession(), orders: [order()] }; const server = setupFetch(initial);
  mount(`/conta/inscricoes-teste?teste=${SID}`); await screen.findByText('405001');
  server.update({ ...initial, registration: { status: 'confirmed', source: 'sandbox_payment', selection: { profile: 'external' }, entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } },
    orders: [{ ...order(), status: 'confirmed', entity: '10045', notification: { receivedAt: '2026-10-09T10:01:00Z', verifiedAt: '2026-10-09T10:01:00Z', transactionId: '29750001' } }] });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByRole('heading', { name: 'Inscrição de teste confirmada' })).toBeInTheDocument();
  expect(screen.getByText('29750001')).toBeInTheDocument();
  expect(fetch.mock.calls.every(([url, options]) => !url.endsWith('/inspect') && !options.body)).toBe(true);
  const count = fetch.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(20000); }); expect(fetch.mock.calls.length).toBe(count);
});
test('manual paid query is visibly distinguished from a confirmed registration', async () => {
  setupFetch({ ...emptySession(), orders: [order()] }); mount(`/conta/inscricoes-teste?teste=${SID}`);
  await screen.findByText('405001'); fireEvent.click(screen.getByRole('button', { name: 'Consultar estado na Eupago' }));
  expect(await screen.findByText(/paga — não substitui a notificação validada/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Inscrição de teste confirmada' })).not.toBeInTheDocument();
});
test('a student rejection prevents the payment form from opening', async () => {
  setupFetch(); const previous = fetch.getMockImplementation();
  fetch.mockImplementation((url, options) => url.endsWith('/quote') ? Promise.resolve(response({ error: 'student-not-approved' }, false)) : previous(url, options));
  mount(); await newTest(); fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'student' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preparar resumo de teste' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('não está aprovado');
  expect(screen.queryByRole('button', { name: /Criar pedido na sandbox/ })).not.toBeInTheDocument();
});
test('unknown creation preserves diagnostic and offers recovery, not a new payment', async () => {
  setupFetch({ ...emptySession(), orders: [{ ...order(), reference: null, status: 'creation_unknown', creationDiagnostic: 'provider/timeout' }] });
  mount(`/conta/inscricoes-teste?teste=${SID}`);
  await screen.findByText('provider/timeout');
  expect(screen.getByRole('button', { name: 'Nova inscrição de teste' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Recuperar referência sem criar outro pedido' })).toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.body)).toBe(true);
});
test('copying an existing registration sends no invented voucher or payment data', async () => {
  setupFetch(); mount();
  const copy = await screen.findByRole('button', { name: 'Copiar inscrição confirmada para testar complementos' });
  await waitFor(() => expect(copy).not.toBeDisabled()); fireEvent.click(copy);
  await screen.findByRole('button', { name: 'Preparar resumo de teste' });
  const [, options] = fetch.mock.calls.find(([, o]) => o.body);
  expect(JSON.parse(options.body)).toEqual({ id: SID, source: 'registration-copy' });
});
test('missing configuration disables all creation controls', async () => {
  global.fetch = jest.fn(async () => response({ configured: false })); mount();
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Nova inscrição de teste' })).toBeDisabled();
  expect(fetch.mock.calls.length).toBe(1);
});
test('English copy remains available inside the existing language system', async () => {
  mockLanguage = 'en'; setupFetch(); mount();
  await screen.findByRole('heading', { name: 'Test registration and payment' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'New test registration' })).not.toBeDisabled());
  expect(screen.getByText('Testing only — no real charges')).toBeInTheDocument();
});

test('bank transfer selection creates only the bank method and never sends a phone', async () => {
  setupFetch(); mount(); await newTest(); fireEvent.click(screen.getByRole('button', { name: 'Preparar resumo de teste' }));
  await screen.findByRole('button', { name: /Criar pedido na sandbox/ });
  fireEvent.change(screen.getByLabelText('Meio de pagamento'), { target: { value: 'bank_transfer' } });
  expect(screen.queryByLabelText(/Número MB WAY/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que este pedido/ }));
  fireEvent.click(screen.getByRole('button', { name: /Criar pedido de transferência de teste/ }));
  await screen.findByText('405001');
  const body = JSON.parse(fetch.mock.calls.find(([url]) => url.endsWith('/orders'))[1].body);
  expect(body.method).toBe('bank_transfer'); expect(body.phone).toBeUndefined(); expect(body.amountCents).toBeUndefined();
});
