import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Edition2025Film from './Edition2025Film';

let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
const mount = () => render(<MemoryRouter><Edition2025Film /></MemoryRouter>);
beforeEach(() => { mockLanguage = 'pt'; });

test('shows the previous edition with a first-party lazy cover and no initial iframe', () => {
  const { container } = mount();
  expect(screen.getByRole('heading', { name: 'CIRC 2025, em filme.' })).toBeInTheDocument();
  const image = screen.getByRole('img');
  expect(image).toHaveAttribute('src', '/circ2025/hero-auditorium.webp');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(container.querySelector('iframe')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('[rel="preconnect"]')).toBeNull();
});

test('only the explicit play action loads the supplied video in privacy-enhanced mode', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Reproduzir o vídeo do CIRC 2025 no YouTube' }));
  const iframe = screen.getByTitle('Vídeo da edição CIRC 2025 — Eyes on the Future');
  const url = new URL(iframe.src);
  expect(url.origin).toBe('https://www.youtube-nocookie.com');
  expect(url.pathname).toBe('/embed/bvVn2Bl3BRw');
  expect(url.searchParams.get('autoplay')).toBe('1');
  expect(url.searchParams.get('playsinline')).toBe('1');
  expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  expect(iframe).toHaveAttribute('allowfullscreen');
  expect(iframe).toHaveFocus();
});

test('closing unloads the player and restores keyboard focus', () => {
  const { container } = mount();
  fireEvent.click(screen.getByRole('button', { name: /Reproduzir o vídeo/ }));
  fireEvent.click(screen.getByRole('button', { name: /Fechar vídeo/ }));
  expect(container.querySelector('iframe')).toBeNull();
  expect(screen.getByRole('button', { name: /Reproduzir o vídeo/ })).toHaveFocus();
});

test('keeps both the edition archive and a direct YouTube fallback available', () => {
  mount();
  expect(screen.getByRole('link', { name: /Explorar a edição de 2025/ })).toHaveAttribute('href', '/2025');
  const fallback = screen.getByRole('link', { name: /Ver no YouTube/ });
  expect(fallback).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bvVn2Bl3BRw');
  expect(fallback).toHaveAttribute('target', '_blank');
  expect(fallback).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByRole('button', { name: /Reproduzir o vídeo/ })).toHaveAttribute('aria-describedby', 'circ2025-film-privacy');
});

test('translates the complete experience and the player language to English', () => {
  mockLanguage = 'en';
  mount();
  expect(screen.getByRole('heading', { name: 'CIRC 2025, on film.' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Play the CIRC 2025 video on YouTube' }));
  expect(screen.getByTitle('CIRC 2025 edition video — Eyes on the Future').src).toContain('hl=en');
  expect(screen.getByRole('button', { name: /Close video/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Watch on YouTube/ })).toBeInTheDocument();
});
