import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsPage from './NotificationsPage';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import * as push from '../pwa/pushNotifications';

jest.mock('../auth/AuthContext');
jest.mock('../context/LanguageContext');
jest.mock('../pwa/pushNotifications');
const user = { uid: 'user', getIdToken: jest.fn() };
const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/test' };
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user, isAdmin: false });
  useLanguage.mockReturnValue({ language: 'pt' });
  push.pushSupported.mockReturnValue(true);
  push.needsHomeScreen.mockReturnValue(false);
  push.currentPushSubscription.mockResolvedValue(null);
  push.loadPushConfig.mockResolvedValue({ enabled: false, testOnly: true });
  push.pushRequest.mockResolvedValue({ subscribed: true });
  push.enablePush.mockResolvedValue(device);
  window.Notification = { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') };
});
const show = () => render(<MemoryRouter><NotificationsPage /></MemoryRouter>);

test('loading a page never asks for permission; disabled server hides opt-in', async () => {
  show();
  expect(await screen.findByText(/ainda não estão disponíveis/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect(push.enablePush).not.toHaveBeenCalled();
});

test('test mode permits only the organiser and labels the test honestly', async () => {
  push.loadPushConfig.mockResolvedValue({ enabled: true, testOnly: true, publicKey: 'key' });
  const first = show();
  expect(await screen.findByText(/ainda não estão disponíveis/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
  first.unmount();
  useAuth.mockReturnValue({ user, isAdmin: true });
  show();
  const activate = await screen.findByRole('button', { name: 'Ativar notificações' });
  fireEvent.click(activate);
  expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Notificações ativadas neste dispositivo.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enviar teste para este dispositivo' }));
  expect(await screen.findByText(/Teste aceite pelo serviço de envio/)).toBeInTheDocument();
  expect(push.pushRequest).toHaveBeenCalledWith(user, 'test', { endpoint: device.endpoint });
});

test('iPhone users receive Home Screen instructions before requesting permission', async () => {
  push.needsHomeScreen.mockReturnValue(true);
  push.loadPushConfig.mockResolvedValue({ enabled: true, testOnly: false, publicKey: 'key' });
  show();
  expect(await screen.findByText(/No iPhone ou iPad/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verificar estado' })).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument();
});

test('browser permission denial and save failures do not display enabled', async () => {
  push.loadPushConfig.mockResolvedValue({ enabled: true, testOnly: false, publicKey: 'key' });
  push.enablePush.mockRejectedValue(new Error('permission-not-granted'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('A autorização não foi concedida');
  expect(screen.queryByText('Notificações ativadas neste dispositivo.')).not.toBeInTheDocument();
});

test('unsubscribe remains possible while the feature is paused', async () => {
  push.currentPushSubscription.mockResolvedValue(device);
  push.disablePush.mockResolvedValue();
  show();
  const disable = await screen.findByRole('button', { name: 'Desativar neste dispositivo' });
  fireEvent.click(disable);
  expect(await screen.findByText('Notificações desativadas.')).toBeInTheDocument();
  expect(push.disablePush).toHaveBeenCalledWith(user);
});

test('a stale browser subscription is not considered a saved opt-in', async () => {
  push.currentPushSubscription.mockResolvedValue(device);
  push.loadPushConfig.mockResolvedValue({ enabled: true, testOnly: false, publicKey: 'key' });
  push.pushRequest.mockResolvedValue({ subscribed: false });
  show();
  expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
});
