import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRegistrationCapacity } from './registrationCapacity';

const user = { uid: 'participant', getIdToken: jest.fn(async () => 'participant-jwt') };
const capacity = remaining => ({ limits: { onsite: 400, morningCourse: 170, afternoonCourse: 170 },
  paid: { onsite: 400 - remaining, morningCourse: 170 - remaining, afternoonCourse: 170 - remaining },
  remaining: { onsite: remaining, morningCourse: remaining, afternoonCourse: remaining } });
const response = (data, ok = true) => ({ ok, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function Probe({ account = user, enabled = true }) {
  const state = useRegistrationCapacity(account, enabled);
  return <><p data-testid="capacity-state">{JSON.stringify(state)}</p><button onClick={state.refresh}>Refresh places</button></>;
}
const state = () => JSON.parse(screen.getByTestId('capacity-state').textContent);
beforeEach(() => { user.getIdToken.mockReset().mockResolvedValue('participant-jwt'); global.fetch = jest.fn(async () => response(capacity(30))); });

test('reads authenticated counts only, with no writes or arbitrary response data', async () => {
  fetch.mockResolvedValue(response({ ...capacity(30), privateData: 'unexpected-private-data' }));
  render(<Probe />);
  await waitFor(() => expect(state().status).toBe('ready'));
  expect(state().remaining.onsite).toBe(30);
  expect(screen.getByTestId('capacity-state')).not.toHaveTextContent('unexpected-private-data');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/api/checkout/live/capacity', expect.objectContaining({
    method: 'GET', cache: 'no-store', headers: { Authorization: 'Bearer participant-jwt' },
  }));
});

test('disabled and signed-out instances neither read nor install an active focus refresh', async () => {
  const { rerender } = render(<Probe enabled={false} />);
  fireEvent(window, new Event('focus')); fireEvent.click(screen.getByRole('button'));
  expect(fetch).not.toHaveBeenCalled();
  expect(state().status).toBe('idle');
  rerender(<Probe account={null} />);
  fireEvent(window, new Event('focus'));
  expect(fetch).not.toHaveBeenCalled();
});

test('manual and focus reads replace stale counts, clear failures and deduplicate pending requests', async () => {
  render(<Probe />);
  await waitFor(() => expect(state().status).toBe('ready'));
  const pending = deferred();
  fetch.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button')); fireEvent(window, new Event('focus'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(state()).toMatchObject({ status: 'loading', remaining: null });
  await act(async () => pending.resolve(response({ error: 'private-error-value' }, false)));
  expect(state()).toMatchObject({ status: 'error', remaining: null });
  fetch.mockResolvedValue(response(capacity(12)));
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(state().remaining?.onsite).toBe(12));
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

test('malformed counts remain unavailable rather than authorizing a finite selection', async () => {
  fetch.mockResolvedValue(response({ ...capacity(30), remaining: { onsite: '30', morningCourse: 30, afternoonCourse: 30 } }));
  render(<Probe />);
  await waitFor(() => expect(state().status).toBe('error'));
  expect(state().remaining).toBeNull();
});

test('inconsistent remaining counts do not authorize places, while an over-limit paid count safely reports zero', async () => {
  fetch.mockResolvedValue(response({ ...capacity(30), paid: { onsite: 400, morningCourse: 140, afternoonCourse: 140 } }));
  render(<Probe />);
  await waitFor(() => expect(state().status).toBe('error'));
  fetch.mockResolvedValue(response({ ...capacity(0), paid: { onsite: 401, morningCourse: 171, afternoonCourse: 171 } }));
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(state().status).toBe('ready'));
  expect(state().remaining).toEqual({ onsite: 0, morningCourse: 0, afternoonCourse: 0 });
});

test('account changes abort old reads and cancel their queued explicit refresh', async () => {
  const oldRead = deferred();
  fetch.mockReturnValueOnce(oldRead.promise).mockResolvedValue(response(capacity(8)));
  const { rerender } = render(<Probe />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const oldSignal = fetch.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole('button'));
  rerender(<Probe account={{ uid: 'other', getIdToken: async () => 'other-jwt' }} />);
  await waitFor(() => expect(state()).toMatchObject({ uid: 'other', status: 'ready', remaining: { onsite: 8 } }));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => oldRead.resolve(response(capacity(100))));
  expect(state().remaining.onsite).toBe(8);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('multiple explicit refreshes during a pending read queue exactly one fresh read after it finishes', async () => {
  const beforePayment = deferred();
  const afterPayment = deferred();
  fetch.mockReturnValueOnce(beforePayment.promise).mockReturnValueOnce(afterPayment.promise);
  render(<Probe />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button')); fireEvent.click(screen.getByRole('button'));
  fireEvent(window, new Event('focus'));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => beforePayment.resolve(response(capacity(30))));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(state().status).toBe('loading');
  // Repeated notifications while the queued read runs also share that read.
  fireEvent.click(screen.getByRole('button'));
  await act(async () => afterPayment.resolve(response(capacity(29))));
  expect(state().remaining.onsite).toBe(29);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('signing out during token acquisition prevents the subsequent request', async () => {
  const token = deferred();
  user.getIdToken.mockReturnValue(token.promise);
  const { rerender } = render(<Probe />);
  rerender(<Probe account={null} />);
  await act(async () => token.resolve('stale-jwt'));
  expect(fetch).not.toHaveBeenCalled();
  expect(state().status).toBe('idle');
});

test('effect replays replace cancelled requests without getting stuck', async () => {
  render(<StrictMode><Probe /></StrictMode>);
  await waitFor(() => expect(state().status).toBe('ready'));
  expect(fetch).toHaveBeenCalledTimes(1);
});
