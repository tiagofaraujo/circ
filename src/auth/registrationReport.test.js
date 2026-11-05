import React, { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRegistrationReport } from './registrationReport';

const user = { uid: 'paulo', getIdToken: jest.fn(async () => 'viewer-token') };
const result = { registrations: [{ id: 'circ-2027-participant' }], payments: [], generatedAt: '2026-11-05T12:00:00Z' };
const response = data => ({ ok: true, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function View({ account = user, enabled = true }) {
  const report = useRegistrationReport(account, enabled);
  return <><p role="status">{report.status}</p><p>{report.error}</p><span aria-label="Inscrições">{report.registrations.map(item => item.id).join(',')}</span><button type="button" onClick={report.refresh} disabled={report.refreshing}>Atualizar</button></>;
}

beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn(async () => response(result)); user.getIdToken.mockResolvedValue('viewer-token'); });
afterEach(() => { jest.useRealTimers(); delete global.fetch; });

test('the consultation report authenticates a read-only request and refreshes on focus, timer and manual request', async () => {
  render(<View />);
  await screen.findByText('ready');
  expect(screen.getByRole('status')).toHaveTextContent('ready');
  expect(screen.getByLabelText('Inscrições')).toHaveTextContent('circ-2027-participant');
  expect(fetch).toHaveBeenCalledWith('/api/admin/registrations/report', expect.objectContaining({ method: 'GET', cache: 'no-store',
    headers: { Authorization: 'Bearer viewer-token' }, signal: expect.any(AbortSignal) }));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).not.toBeDisabled());
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(fetch).toHaveBeenCalledTimes(4);
});

test('background refresh preserves the same account snapshot without replacing the dashboard with a loading view', async () => {
  render(<View />);
  await screen.findByText('ready');
  const next = deferred();
  fetch.mockImplementationOnce(() => next.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  expect(screen.getByRole('status')).toHaveTextContent('ready');
  expect(screen.getByLabelText('Inscrições')).toHaveTextContent('circ-2027-participant');
  expect(screen.getByRole('button', { name: 'Atualizar' })).toBeDisabled();
  await act(async () => { next.resolve(response({ registrations: [{ id: 'fresh-result' }], payments: [] })); });
  expect(screen.getByLabelText('Inscrições')).toHaveTextContent('fresh-result');
  expect(screen.getByRole('button', { name: 'Atualizar' })).not.toBeDisabled();
});

test.each([{}, { registrations: [], payments: null }, { registrations: [{ id: null }], payments: [] }])('malformed reports do not become successful zero statistics: %j', async body => {
  fetch.mockResolvedValue(response(body));
  render(<View />);
  await screen.findByText('error');
  expect(screen.getByRole('status')).toHaveTextContent('error');
  expect(screen.getByText(/Não foi possível carregar as inscrições/)).toBeInTheDocument();
  expect(screen.getByLabelText('Inscrições')).toBeEmptyDOMElement();
});

test('account changes abort the previous request and never display its late response', async () => {
  const first = deferred();
  fetch.mockImplementationOnce(() => first.promise).mockResolvedValue(response({ registrations: [{ id: 'current-account' }], payments: [] }));
  const view = render(<View />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const previousSignal = fetch.mock.calls[0][1].signal;
  view.rerender(<View account={{ uid: 'second', getIdToken: async () => 'second-token' }} />);
  await screen.findByText('ready');
  expect(previousSignal.aborted).toBe(true);
  await act(async () => { first.resolve(response(result)); });
  expect(screen.getByLabelText('Inscrições')).toHaveTextContent('current-account');
  expect(screen.getByLabelText('Inscrições')).not.toHaveTextContent('circ-2027-participant');
});

test('disabled consultation and unmounted views perform no background reads', async () => {
  const view = render(<View enabled={false} />);
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<View />);
  await screen.findByText('ready');
  expect(fetch).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(120000); window.dispatchEvent(new Event('focus')); });
  expect(fetch).toHaveBeenCalledTimes(1);
});
