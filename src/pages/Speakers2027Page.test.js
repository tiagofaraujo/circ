import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvitedSpeakers from '../components/InvitedSpeakers';
import Speakers2027Page from './Speakers2027Page';

jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));

const speakersWithoutBiography = [
  ['Rui Pedro Faria Pais', 'ULS Coimbra', 'rui-pedro-faria-pais'],
  ['Célia Antunes', 'ULS Coimbra', 'celia-antunes'],
  ['Rita Batista', 'ULS da Lezíria', 'rita-batista'],
  ['Ricardo Veiga', 'ULS Coimbra', 'ricardo-veiga'],
  ['Daniel Leitão', 'Siemens Healthineers', 'daniel-leitao'],
];

const moderatorsWithoutBiography = [
  ['Vitor Silva', 'ULS São João', 'vitor-silva'],
  ['Ana Isabel Machado', 'ULS Coimbra', 'ana-isabel-machado'],
  ['Raquel Reis', 'ULS Santo António', 'raquel-reis'],
];

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
  for (const [name, institution] of moderatorsWithoutBiography) {
    const card = within(moderators).getByRole('heading', { name }).closest('article');
    expect(within(card).getByText(institution)).toBeVisible();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  }
});

test('keeps speaker directory cards without linking to unavailable biographies', () => {
  renderDirectory();
  for (const [name, institution] of speakersWithoutBiography) {
    const card = screen.getByRole('heading', { name }).closest('article');
    expect(within(card).getByText(institution)).toBeVisible();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  }
});

test.each([...speakersWithoutBiography, ...moderatorsWithoutBiography])('handles a direct biography URL for %s', (name, institution, slug) => {
  renderDirectory(`/oradores/${slug}`);
  expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
});

test('only links homepage speaker names when the biography exists', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><InvitedSpeakers /></MemoryRouter>);
  for (const [name] of speakersWithoutBiography) {
    expect(screen.getByText(name, { exact: true })).toBeVisible();
    expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
  }
  expect(screen.getByRole('link', { name: 'Filipa Oliveira' })).toHaveAttribute('href', '/oradores/filipa-oliveira');
});

test.each(['Joana Santos', 'Samuel Oliveira'])('opens the biography of %s and links back to the moderators', name => {
  renderDirectory('/oradores#moderadores');
  const moderators = within(screen.getByRole('region', { name: 'Moderadores' }));
  fireEvent.click(moderators.getByRole('link', { name: `${name} — biografia` }));
  expect(screen.getByRole('heading', { name, level: 1 })).toBeVisible();
  expect(screen.getByRole('link', { name: /Todos os moderadores/ })).toHaveAttribute('href', '/oradores#moderadores');
});
