import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminSecretariatPage from './AdminSecretariatPage';
import { updateCredentialDelivery, updateParticipantCheckIn } from '../auth/adminOperationsStore';

let mockRegistrations = [];
const operator = { uid: 'staff', email: 'staff@example.test' };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: operator }) }));
jest.mock('../auth/adminStore', () => ({ subscribeToRegistrations: onData => { onData(mockRegistrations); return () => {}; } }));
jest.mock('../auth/adminOperationsStore', () => ({
  attendanceKey: day => `day_${day.replace(/-/g, '_')}`,
  updateCredentialDelivery: jest.fn(async () => {}),
  updateParticipantCheckIn: jest.fn(async () => {}),
}));
jest.mock('../components/AdminModuleNav', () => () => null);
const registration = { id: 'circ-2027-participant', eventId: 'circ-2027', participantName: 'Participante', participantEmail: 'participant@example.test',
  userId: 'participant', primaryRegistration: true, isTest: false, testMode: false,
  status: 'confirmed', payment: { status: 'paid' }, selection: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true } };
const held = { ...registration, id: 'circ-2027-held-participant', userId: 'held-participant', participantName: 'Vaga Pendente', status: 'submitted', capacityReviewOrderId: 'paid-held-order',
  entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false } };
const show = () => render(<MemoryRouter><AdminSecretariatPage /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); mockRegistrations = []; });

test('a held primary payment is excluded from attendance, credentials and counts but remains searchable for review', () => {
  mockRegistrations = [held]; show();
  expect(screen.getByRole('region', { name: 'Inscrições que exigem conferência' })).toHaveTextContent('Vaga Pendente');
  expect(screen.getByText('0 participante(s) por chegar')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Fazer check-in|Por entregar|Anular/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Congresso · Dia 1/ }));
  expect(screen.queryByRole('button', { name: /Fazer check-in|Por entregar/ })).not.toBeInTheDocument();
  expect(screen.getByText('0 participante(s) por chegar')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Procurar participante' }), { target: { value: 'another participant' } });
  expect(screen.queryByRole('region', { name: 'Inscrições que exigem conferência' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Procurar participante' }), { target: { value: held.id } });
  expect(screen.getByText(/Pagamento recebido, mas a vaga aguarda conferência/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Abrir gestão de inscrições' })).toHaveAttribute('href', '/admin');
  expect(updateParticipantCheckIn).not.toHaveBeenCalled();
  expect(updateCredentialDelivery).not.toHaveBeenCalled();
});

test('a held supplementary purchase preserves only the original physical attendance and course grants', async () => {
  const original = { ...registration, capacityReviewOrderId: 'supplement-held', entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: false } };
  mockRegistrations = [original]; show();
  expect(screen.getByText('Curso manhã')).toBeInTheDocument();
  expect(screen.queryByText('Curso manhã · Curso tarde')).not.toBeInTheDocument();
  expect(screen.getByText('0 / 1')).toBeInTheDocument();
  expect(screen.getByText('0 / 0')).toBeInTheDocument();
  expect(screen.getByText(/Vaga adicional em conferência.*Apenas as participações já confirmadas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Fazer check-in/ }));
  await waitFor(() => expect(updateParticipantCheckIn).toHaveBeenCalledWith(operator, original, '2027-04-08', true));
  await waitFor(() => expect(screen.getByRole('button', { name: /Por entregar/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Por entregar/ }));
  await waitFor(() => expect(updateCredentialDelivery).toHaveBeenCalledWith(operator, original, true));
  fireEvent.click(screen.getByRole('button', { name: /Congresso · Dia 1/ }));
  expect(screen.getByRole('button', { name: /Fazer check-in/ })).toBeEnabled();
});

test('a genuine confirmed paid legacy registration without an entitlement map retains its granted participation', () => {
  mockRegistrations = [registration]; show();
  expect(screen.getByText('Curso manhã · Curso tarde')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Fazer check-in/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Por entregar/ })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /Congresso · Dia 2/ }));
  expect(screen.getByRole('button', { name: /Fazer check-in/ })).toBeEnabled();
});

test.each([
  ['held primary', held],
  ['refunded registration', { ...registration, status: 'cancelled', payment: { status: 'refunded' } }],
])('existing check-in and credential records can be reversed for an ineligible %s', async (_, value) => {
  const recorded = { ...value, attendance: { day_2027_04_08: { checkedIn: true } }, credential: { delivered: true } };
  mockRegistrations = [recorded]; show();
  expect(screen.getByText('0 participante(s) por chegar')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Anular check-in de/ }));
  await waitFor(() => expect(updateParticipantCheckIn).toHaveBeenCalledWith(operator, recorded, '2027-04-08', false));
  const credentialUndo = screen.getByRole('button', { name: /^Anular entrega da credencial de/ });
  await waitFor(() => expect(credentialUndo).toBeEnabled());
  fireEvent.click(credentialUndo);
  await waitFor(() => expect(updateCredentialDelivery).toHaveBeenCalledWith(operator, recorded, false));
  expect(screen.queryByRole('button', { name: /Fazer check-in|Por entregar/ })).not.toBeInTheDocument();
});
