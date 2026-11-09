import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { useLanguage } from '../../context/LanguageContext';

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: jest.fn() }));

beforeEach(() => {
  useLanguage.mockReturnValue({ language: 'pt', setLanguage: jest.fn() });
});

test('closes the mobile menu with Escape and restores keyboard focus', () => {
  render(<MemoryRouter><Navbar /></MemoryRouter>);
  const toggle = screen.getByRole('button', { name: 'Abrir menu' });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('navigation', { name: 'Navegação móvel' })).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
});

test('closes the menu after a mobile navigation link is selected', () => {
  render(<MemoryRouter><Navbar /></MemoryRouter>);
  const toggle = screen.getByRole('button', { name: 'Abrir menu' });
  fireEvent.click(toggle);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegação móvel' }))
    .getByRole('link', { name: 'Programa' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('mobile navigation has an English accessible name when EN is selected', () => {
  useLanguage.mockReturnValue({ language: 'en', setLanguage: jest.fn() });
  render(<MemoryRouter><Navbar /></MemoryRouter>);
  expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
});
