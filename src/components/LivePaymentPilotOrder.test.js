import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LivePaymentPilotOrder from './LivePaymentPilotOrder';

const ID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const user = { uid: 'admin', getIdToken: async () => 'token' };
const preview = { creationEnabled: true, stamp: '1'.repeat(64), billingStamp: '2'.repeat(64),
  preparedAt: '2026-10-31T12:00:00Z', quote: { amountCents: 9500, currency: 'EUR', selection: { profile: 'external' } } };
const order = { id: ID, status: 'pending', amountCents: 9500, currency: 'EUR', reference: '123456789', entity: '12345' };
const key = 'circ-live-pilot-order:admin';
beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => ID) } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ order }) }));
});
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });
function acknowledge() {
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
}

test('flag off blocks reference creation even after confirmation checkboxes are selected', () => {
  render(<LivePaymentPilotOrder user={user} preview={{ ...preview, creationEnabled: false }} />);
  acknowledge();
  const button = screen.getByRole('button', { name: 'Gerar referência Multibanco real' });
  expect(button).toBeDisabled(); fireEvent.click(button);
  expect(fetch).not.toHaveBeenCalled(); expect(window.confirm).not.toHaveBeenCalled();
});

test('creating requires reviewed data and approval; cancel sends nothing', () => {
  render(<LivePaymentPilotOrder user={user} preview={preview} />);
  const button = screen.getByRole('button', { name: 'Gerar referência Multibanco real' });
  expect(button).toBeDisabled(); acknowledge();
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(button);
  expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/95,00.*Associação Hemisfério Disciplinado/));
  expect(fetch).not.toHaveBeenCalled(); expect(sessionStorage.getItem(key)).toBeNull();
});

test('identifier is persisted before the only creating POST, then entity and reference can be read without another write', async () => {
  fetch.mockImplementation(async (url, options) => {
    expect(sessionStorage.getItem(key)).toBe(ID);
    return { ok: true, json: async () => ({ order }) };
  });
  render(<LivePaymentPilotOrder user={user} preview={preview} />);
  acknowledge();
  const button = screen.getByRole('button', { name: 'Gerar referência Multibanco real' });
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByText('123456789')).toBeInTheDocument();
  expect(screen.getByText('A aguardar pagamento')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/checkout/live/orders');
  expect(JSON.parse(options.body)).toMatchObject({ id: ID, method: 'multibanco', stamp: preview.stamp,
    billingStamp: preview.billingStamp, pilotAcknowledged: true, pilotConfirmation: 'CRIAR REFERENCIA REAL' });
  expect(screen.queryByRole('button', { name: 'Gerar referência Multibanco real' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar este pedido' }));
  await screen.findByText('123456789');
  expect(fetch.mock.calls[1][0]).toBe(`/api/checkout/live/orders/${ID}`);
  expect(fetch.mock.calls[1][1].method).toBe('GET');
});

test('lost creation response keeps the same identifier and recovers even without a new preview', async () => {
  fetch.mockRejectedValueOnce(new Error('connection lost'));
  const first = render(<LivePaymentPilotOrder user={user} preview={preview} />);
  acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco real' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/referência pode já existir/);
  expect(sessionStorage.getItem(key)).toBe(ID);
  first.unmount();
  render(<LivePaymentPilotOrder user={user} preview={null} />);
  expect(screen.getByText(ID)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar este pedido' }));
  await screen.findByText('123456789');
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});

test('browser storage failure blocks creation before any request', async () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<LivePaymentPilotOrder user={user} preview={preview} />);
  acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco real' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Nenhum pedido foi enviado/);
  expect(fetch).not.toHaveBeenCalled();
});

test('known pre-write rejection requires a fresh preview; unknown failures never clear recovery information', async () => {
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'billing-preview-changed' }) });
  const view = render(<LivePaymentPilotOrder user={user} preview={preview} />);
  acknowledge(); fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco real' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Atualize a pré-visualização/);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.getByRole('button', { name: 'Gerar referência Multibanco real' })).toBeDisabled();
  view.rerender(<LivePaymentPilotOrder user={user} preview={{ ...preview, preparedAt: '2026-10-31T12:05:00Z' }} />);
  acknowledge();
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'PRIVATE-PROVIDER-ERROR' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Gerar referência Multibanco real' }));
  await waitFor(() => expect(sessionStorage.getItem(key)).toBe(ID));
  expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE-PROVIDER-ERROR');
  expect(screen.queryByRole('button', { name: 'Gerar referência Multibanco real' })).not.toBeInTheDocument();
});

test('English recovery shows a confirmed payment and fiscal status without any new payment', async () => {
  sessionStorage.setItem(key, ID);
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ order: { ...order, status: 'paid', fiscalStatus: 'issued' } }) });
  render(<LivePaymentPilotOrder user={user} preview={null} en />);
  fireEvent.click(screen.getByRole('button', { name: 'Check this order' }));
  expect(await screen.findByText('Payment confirmed')).toBeInTheDocument();
  expect(screen.getByText(/Fiscal document: Issued/)).toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('an existing server order can be recovered with no preview and no browser identifier using GET only', async () => {
  render(<LivePaymentPilotOrder user={user} preview={null} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido existente' }));
  expect(await screen.findByText('123456789')).toBeInTheDocument();
  expect(screen.getByText('12345')).toBeInTheDocument();
  expect(sessionStorage.getItem(key)).toBe(ID);
  expect(fetch).toHaveBeenCalledWith('/api/checkout/live/primary-order', expect.objectContaining({ method: 'GET' }));
  expect(window.confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Gerar referência Multibanco real' })).not.toBeInTheDocument();
});

test('failed recovery reveals no private backend errors and cannot create a replacement order', async () => {
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'PRIVATE-ERROR' }) });
  render(<LivePaymentPilotOrder user={user} preview={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido existente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Nenhum pedido foi criado');
  expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE-ERROR');
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('recovery explains a missing order or a failed ownership check using only safe labels', async () => {
  fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'order-recovery-mismatch', failedChecks: ['owner','real','PRIVATE-DETAIL'] }) });
  render(<LivePaymentPilotOrder user={user} preview={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido existente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conferências em falta: titular, identificação como produção');
  expect(screen.getByRole('alert')).not.toHaveTextContent('PRIVATE-DETAIL');
});
