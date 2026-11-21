import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnnouncementFeed from './AnnouncementFeed';
import { announcementsRequest } from '../pwa/announcements';
const mockUser = { uid: 'user' };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../pwa/announcements');
test('all account holders can read announcements without device permission, as plain text', async () => {
  announcementsRequest.mockResolvedValue({ notifications: [{ id: 'notice', title: '<img src=x onerror=bad()>', body: 'Novo aviso', createdAt: '2026-11-21T12:00:00Z' }] });
  render(<AnnouncementFeed />);
  expect(await screen.findByText('Novo aviso')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '<img src=x onerror=bad()>' })).toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar avisos' }));
  await waitFor(() => expect(announcementsRequest).toHaveBeenCalledTimes(2));
});
