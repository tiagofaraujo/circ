import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InvitedSpeakers from '../components/InvitedSpeakers';
import Speakers2027Page from './Speakers2027Page';

jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));

const speakersWithoutBiography = [
  ['Rui Pedro Faria Pais', 'ULS Coimbra', 'rui-pedro-faria-pais'],
  ['Célia Antunes', 'ULS Coimbra', 'celia-antunes'],
  ['Ricardo Veiga', 'ULS Coimbra', 'ricardo-veiga'],
  ['Daniel Leitão', 'Siemens Healthineers', 'daniel-leitao'],
  ['Rita Santiago', 'Fundação Champalimaud', 'rita-santiago'],
  ['Graciano Paulo', 'ESTeSC', 'graciano-paulo'],
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
  expect(cards).toHaveLength(8);
  expect(cards.every(card => card.classList.contains('guest-card'))).toBe(true);
  expect(within(moderators).getByRole('img', { name: 'Samuel Oliveira' })).toBeInTheDocument();
  expect(within(moderators).queryByText('Vitor Silva')).not.toBeInTheDocument();
});

test('keeps speaker directory cards without linking to unavailable biographies', () => {
  renderDirectory();
  for (const [name, institution] of speakersWithoutBiography) {
    const card = screen.getByRole('heading', { name }).closest('article');
    expect(within(card).getByText(institution)).toBeVisible();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  }
});

test.each(speakersWithoutBiography)('handles a direct biography URL for %s', (name, institution, slug) => {
  renderDirectory(`/oradores/${slug}`);
  expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
});

test('opens Diana Santos’s preserved portrait and biography', () => {
  renderDirectory('/oradores/diana-santos');
  expect(screen.getByRole('heading', { name: 'Diana Santos', level: 1 })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Diana Santos' })).toHaveAttribute('src', '/speakers/diana-carvalho.jpg');
  expect(screen.getByText(/^Diana Santos é técnica de radiologia\./)).toBeVisible();
  expect(screen.queryByText(/Diana Carvalho/)).not.toBeInTheDocument();
});

test('opens Diana Carvalho’s own portrait and MRI biography without redirecting to Diana Santos', () => {
  renderDirectory('/oradores/diana-carvalho');
  expect(screen.getByRole('heading', { name: 'Diana Carvalho', level: 1 })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Diana Carvalho' })).toHaveAttribute('src', '/speakers/diana-carvalho-2027.jpg');
  expect(screen.getByText(/professora adjunta convidada na Escola Superior de Tecnologia da Saúde/)).toBeVisible();
  expect(screen.getByText(/ressonância magnética de adultos e pediátrica\.$/)).toBeVisible();
  expect(screen.queryByText(/Diana Santos/)).not.toBeInTheDocument();
});

test.each(['rita-baptista', 'rita-batista'])('opens Rita Baptista’s supplied portrait and biography from %s', slug => {
  renderDirectory(`/oradores/${slug}`);
  expect(screen.getByRole('heading', { name: 'Rita Baptista', level: 1 })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Rita Baptista' })).toHaveAttribute('src', '/speakers/rita-baptista.jpg');
  expect(screen.getByText(/^Rita Isabel Guerreiro Baptista é licenciada/)).toBeVisible();
  expect(screen.getByText(/Grupo de Trabalho da Imagiologia e Terapêutica Mamária da ATARP/)).toBeVisible();
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

test.each([
  ['Raquel Reis', 'raquel-reis', /Grupo de Trabalho de Radiologia Geral da ATARP/],
  ['Ana Isabel Machado', 'ana-isabel-machado', /Quality Criteria in Orthopantomography/],
])('opens the supplied portrait and biography of moderator %s', (name, slug, biography) => {
  renderDirectory('/oradores#moderadores');
  const moderators = within(screen.getByRole('region', { name: 'Moderadores' }));
  const link = moderators.getByRole('link', { name: `${name} — biografia` });
  expect(within(link).getByRole('img', { name })).toHaveAttribute('src', `/speakers/${slug}.jpg`);
  fireEvent.click(link);
  expect(screen.getByRole('heading', { name, level: 1 })).toBeVisible();
  expect(screen.getByText(biography)).toBeVisible();
  expect(screen.getByRole('link', { name: /Todos os moderadores/ })).toHaveAttribute('href', '/oradores#moderadores');
});
