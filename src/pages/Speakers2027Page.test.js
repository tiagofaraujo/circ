import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Speakers2027Page from './Speakers2027Page';

jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));

function renderDirectory(path = '/oradores') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/oradores" element={<Speakers2027Page />} />
      <Route path="/oradores/:speakerId" element={<Speakers2027Page />} />
    </Routes>
  </MemoryRouter>);
}

test('shows moderators after the invited speakers in the same card grid', () => {
  renderDirectory();
  const moderators = screen.getByRole('region', { name: 'Moderadores' });
  const cards = within(moderators).getAllByRole('article');
  const speaker = screen.getByRole('heading', { name: 'Fides Schwartz' }).closest('article');
  expect(speaker.compareDocumentPosition(moderators) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cards).toHaveLength(9);
  expect(cards.every(card => card.classList.contains('guest-card'))).toBe(true);
  expect(within(moderators).getByRole('img', { name: 'Samuel Oliveira' })).toBeInTheDocument();
  const raquel = within(moderators).getByRole('heading', { name: 'Raquel Reis' }).closest('article');
  expect(within(raquel).getByText('ULS Santo António')).toBeVisible();
  expect(within(raquel).queryByRole('link')).not.toBeInTheDocument();
});

test.each(['Joana Santos', 'Samuel Oliveira'])('opens the biography of %s and links back to the moderators', name => {
  renderDirectory('/oradores#moderadores');
  const moderators = within(screen.getByRole('region', { name: 'Moderadores' }));
  fireEvent.click(moderators.getByRole('link', { name: `${name} — biografia` }));
  expect(screen.getByRole('heading', { name, level: 1 })).toBeVisible();
  expect(screen.getByRole('link', { name: /Todos os moderadores/ })).toHaveAttribute('href', '/oradores#moderadores');
});
