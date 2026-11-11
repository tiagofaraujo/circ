import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyCircShell from './MyCircShell';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMyCircInstall } from '../pwa/MyCircInstall';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: jest.fn() }));
jest.mock('../pwa/MyCircInstall', () => ({ useMyCircInstall: jest.fn() }));

beforeEach(() => {
  useAuth.mockReturnValue({ user: null, access: {}, isAdmin: false, signOut: jest.fn() });
  useMyCircInstall.mockReturnValue({ installed: false });
});

test.each([
  ['pt', 'Mudar para inglês'],
  ['en', 'Switch to Portuguese'],
])('the My CIRC language button uses the current UI language (%s)', (language, label) => {
  const toggleLanguage = jest.fn();
  useLanguage.mockReturnValue({ language, toggleLanguage });

  render(<MemoryRouter><MyCircShell><p>My CIRC</p></MyCircShell></MemoryRouter>);

  const button = screen.getByRole('button', { name: label });
  fireEvent.click(button);
  expect(toggleLanguage).toHaveBeenCalledTimes(1);
});
