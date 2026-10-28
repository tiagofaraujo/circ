import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileAppInstall from './MobileAppInstall';
import { useMyCircInstall } from '../pwa/MyCircInstall';

jest.mock('../pwa/MyCircInstall', () => ({ useMyCircInstall: jest.fn() }));

const originalAgent = navigator.userAgent;
const install = jest.fn();

beforeEach(() => {
  install.mockReset();
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36' });
  useMyCircInstall.mockReturnValue({ installed: false, prompt: null, install });
});

afterAll(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalAgent });
});

test('a tap uses the available browser installation prompt instead of showing instructions', () => {
  useMyCircInstall.mockReturnValue({ installed: false, prompt: {}, install });
  render(<MobileAppInstall en={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Instalar My CIRC' }));
  expect(install).toHaveBeenCalledTimes(1);
  expect(document.getElementById('mobile-app-install-instructions')).not.toBeVisible();
});

test('without a native prompt, Android offers an explicit Chrome handoff and no iPhone instructions', () => {
  render(<MobileAppInstall en={false} />);
  expect(screen.queryByRole('link', { name: /Abrir no Chrome/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Instalar My CIRC' }));
  const link = screen.getByRole('link', { name: /Abrir no Chrome/ });
  expect(link.getAttribute('href')).toBe('intent://circ-coimbra.org/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcirc-coimbra.org%2F;end');
  expect(screen.getByText(/No Chrome, toque em Instalar e confirme/)).toBeVisible();
  expect(screen.queryByText(/No iPhone/)).not.toBeInTheDocument();
  expect(install).not.toHaveBeenCalled();
});

test('iPhone gets home screen instructions without an Android intent', () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  render(<MobileAppInstall en />);
  fireEvent.click(screen.getByRole('button', { name: 'Install My CIRC' }));
  expect(screen.getByText(/On iPhone \/ iPad, open this website in Safari/)).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('the mobile promotion is omitted when already running as an installed app', () => {
  useMyCircInstall.mockReturnValue({ installed: true, prompt: null, install });
  const { container } = render(<MobileAppInstall en={false} />);
  expect(container).toBeEmptyDOMElement();
});
