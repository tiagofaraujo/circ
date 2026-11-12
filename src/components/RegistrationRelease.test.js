import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegistrationRelease from './RegistrationRelease';
import { useAuth } from '../auth/AuthContext';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
const registration = { id: 'circ-2027-owner', participantEmail: 'araujotiagofc@gmail.com', participantName: 'Pessoa Exemplo', payment: { status: 'paid', amountCents: 9500 } };
const preview = { registrationId: registration.id, email: registration.participantEmail, name: registration.participantName,
  amountCents: 9500, currency: 'EUR', paymentStatus: 'paid', documentNumbers: ['FR CIRC2027/10'], stamp: 'a'.repeat(64), allowed: true };
const released = { released: true, registrationId: registration.id, archiveId: 'archive-original' };
const response = (data, ok = true, status = ok ? 200 : 503) => ({ ok, status, json: async () => data });
const user = { uid: 'admin', email: 'circ.chuc@gmail.com', emailVerified: true, getIdToken: jest.fn(async () => 'firebase-session') };
const posts = () => fetch.mock.calls.filter(([, options]) => options.method === 'POST');
const show = (props = {}) => render(<RegistrationRelease registration={registration} {...props} />);
async function prepare() { fireEvent.click(screen.getByRole('button', { name: 'Preparar nova inscrição para esta conta' })); return screen.findByRole('button', { name: 'Libertar nova inscrição' }); }
beforeEach(() => {
  jest.clearAllMocks(); useAuth.mockReturnValue({ user, isAdmin: true });
  global.fetch = jest.fn(async (_, options) => options.method === 'GET' ? response(preview) : response(released));
});

test('only the verified admin view of the exact designated row exposes this action', () => {
  const view = show({ registration: { ...registration, participantEmail: 'other@example.com' } });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<RegistrationRelease registration={{ ...registration, participantEmail: 'araujotiagofc@gmail.com.evil.test' }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  useAuth.mockReturnValue({ user, isAdmin: false }); view.rerender(<RegistrationRelease registration={registration} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});

test('previews the financial record and requires explicit acknowledgement before one stamped POST', async () => {
  const onReleased = jest.fn(); show({ onReleased }); const submit = await prepare();
  expect(screen.getByText('Pessoa Exemplo', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByText('FR CIRC2027/10')).toBeInTheDocument();
  expect(screen.getByText(/Os pagamentos e as faturas-recibo existentes são conservados/)).toBeInTheDocument();
  expect(submit).toBeDisabled(); expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(submit); fireEvent.click(submit);
  expect(await screen.findByRole('status')).toHaveTextContent('Inscrição libertada');
  expect(posts()).toHaveLength(1);
  expect(posts()[0][0]).toBe(`/api/admin/registrations/${registration.id}/release`);
  expect(JSON.parse(posts()[0][1].body)).toEqual({ stamp: preview.stamp, confirmation: 'LIBERTAR NOVA INSCRICAO' });
  expect(onReleased).toHaveBeenCalledTimes(1); expect(onReleased).toHaveBeenCalledWith(released);
});

test.each([
  ['open-payment', 'Ainda existe um pedido de pagamento em aberto'],
  ['closed-attempt-unverified', 'O encerramento sem pagamento de um pedido associado ainda não está confirmado'],
  ['unknown-reason', 'O estado desta inscrição não permite libertar uma nova inscrição'],
])('explains a blocked preview without exposing a confirmation action (%s)', async (reason, message) => {
  fetch.mockResolvedValue(response({ error: 'registration-release-blocked', reason }, false, 409)); show();
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

test.each([
  ['a different registration', { registrationId: 'circ-2027-other' }], ['another email', { email: 'other@example.com' }],
  ['a denied preview', { allowed: false }], ['an invalid stamp', { stamp: 'invalid' }],
  ['a nonpositive amount', { amountCents: 0 }], ['a fractional cent', { amountCents: 9500.5 }],
  ['an unsafe amount', { amountCents: Number.MAX_SAFE_INTEGER + 1 }], ['another currency', { currency: 'USD' }],
  ['a missing document list', { documentNumbers: undefined }],
])('rejects %s without exposing a confirmation action', async (_, values) => {
  fetch.mockResolvedValue(response({ ...preview, ...values })); show();
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conferir');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(posts()).toHaveLength(0);
});

test('an ambiguous POST preserves the original stamp and requires a new checkbox before explicit idempotent replay', async () => {
  let sent = 0;
  fetch.mockImplementation(async (_, options) => {
    if (options.method === 'GET') return response(preview);
    if (sent++ === 0) throw new Error('network');
    return response(released);
  });
  const onReleased = jest.fn(); const view = show({ onReleased });
  const submit = await prepare(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('O resultado da libertação não foi confirmado');
  const consult = screen.getByRole('button', { name: 'Consultar resultado da libertação' });
  expect(consult).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Preparar nova inscrição para esta conta' })).not.toBeInTheDocument();
  // A new active registration can reuse the same document ID. It must not replace the frozen stamp.
  view.rerender(<RegistrationRelease registration={{ ...registration, payment: { status: 'pending', amountCents: 15000 } }} onReleased={onReleased} />);
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'GET')).toHaveLength(1);
  expect(posts()).toHaveLength(1); expect(onReleased).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(consult);
  await screen.findByRole('status');
  expect(posts()).toHaveLength(2); expect(posts()[0][1].body).toBe(posts()[1][1].body);
  expect(onReleased).toHaveBeenCalledTimes(1);
});

test('a stale preview rejection requires a new manual preview and acknowledgement', async () => {
  let previewCount = 0;
  fetch.mockImplementation(async (_, options) => options.method === 'GET'
    ? response({ ...preview, stamp: (++previewCount === 1 ? 'a' : 'b').repeat(64) })
    : response({ error: 'registration-changed' }, false, 409));
  show(); let submit = await prepare(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('A inscrição mudou');
  expect(previewCount).toBe(1); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  submit = await prepare(); expect(submit).toBeDisabled(); expect(previewCount).toBe(2);
  expect(posts()).toHaveLength(1);
});

test('a malformed success is treated as uncertain and never calls the list callback', async () => {
  fetch.mockImplementation(async (_, options) => response(options.method === 'GET' ? preview : { ...released, registrationId: 'circ-2027-other' }));
  const onReleased = jest.fn(); show({ onReleased }); const submit = await prepare();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(submit);
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Consultar resultado da libertação' })).toBeDisabled();
  expect(onReleased).not.toHaveBeenCalled(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('a callback failure does not turn a confirmed release into another actionable request', async () => {
  show({ onReleased: () => { throw new Error('list refresh failed'); } }); const submit = await prepare();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(submit);
  expect(await screen.findByRole('status')).toHaveTextContent('Inscrição libertada');
  await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  expect(posts()).toHaveLength(1);
});
