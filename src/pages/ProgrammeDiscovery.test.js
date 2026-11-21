import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProvisionalProgramme from './ProvisionalProgramme';
import Speakers2027Page from './Speakers2027Page';
import { downloadCalendar } from '../utils/programmeCalendar';

jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../utils/programmeCalendar', () => ({ downloadCalendar: jest.fn() }));
const mount = (path = '/programa#dia-09') => render(<MemoryRouter initialEntries={[path]}>
  <Routes><Route path="/programa" element={<ProvisionalProgramme />} /><Route path="/oradores/:speakerId" element={<Speakers2027Page />} /></Routes>
</MemoryRouter>);
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('finds a nested speaker without accents and exports only the matching panel', () => {
  const { container } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Recolher painéis' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'marcia amaral' } });
  expect(screen.getByRole('status')).toHaveTextContent('1 sessões encontradas');
  expect(screen.getByRole('heading', { name: /Imagem 3D em trauma/ })).toBeVisible();
  expect(container.querySelector('#dia-09 details')).toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: /Exportar sessões/ }));
  expect(downloadCalendar).toHaveBeenCalledWith('09', [expect.arrayContaining(['Painel de Radiologia'])], false);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'semcorrespondencia' } });
  expect(screen.getByRole('button', { name: /Exportar sessões/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(container.querySelectorAll('#dia-09 > .schedule-list > li')).toHaveLength(15);
});

test('favourites persist after remount and can be removed from a filtered agenda', () => {
  let view = mount('/programa#dia-10');
  fireEvent.click(screen.getByRole('button', { name: /Adicionar aos favoritos: Moldando/ }));
  view.unmount(); view = mount('/programa#dia-10');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Os meus favoritos' }));
  expect(view.container.querySelectorAll('#dia-10 > .schedule-list > li')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Remover dos favoritos: Moldando/ }));
  expect(screen.getByText(/Nenhuma sessão corresponde/)).toBeVisible();
});

test('unavailable persistence keeps favourites usable and tells the participant', () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  mount('/programa#dia-10');
  fireEvent.click(screen.getByRole('button', { name: /Adicionar aos favoritos: Moldando/ }));
  expect(screen.getByRole('button', { name: /Remover dos favoritos: Moldando/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(/apenas enquanto esta página/);
  storage.mockRestore();
});

test('keyboard changes the programme day, and biography returns to that day', () => {
  mount();
  const day = screen.getByRole('button', { name: /09 ABR/ });
  fireEvent.keyDown(day, { key: 'End' });
  expect(screen.getByRole('button', { name: /10 ABR/ })).toHaveFocus();
  fireEvent.click(screen.getByRole('link', { name: 'Andrea Rockall — ver biografia' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Andrea Rockall');
  fireEvent.click(screen.getByRole('link', { name: /Voltar ao dia/ }));
  expect(screen.getByRole('button', { name: /10 ABR/ })).toHaveAttribute('aria-pressed', 'true');
});

test('print includes every day and expanded panel despite active filters, then restores screen filters', () => {
  const { container } = mount();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'marcia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recolher painéis' }));
  act(() => window.dispatchEvent(new Event('beforeprint')));
  expect(container.querySelectorAll('.schedule-day[hidden]')).toHaveLength(0);
  expect(container.querySelectorAll('#dia-09 > .schedule-list > li')).toHaveLength(15);
  expect([...container.querySelectorAll('details')].every(panel => panel.open)).toBe(true);
  act(() => window.dispatchEvent(new Event('afterprint')));
  expect(container.querySelectorAll('#dia-09 > .schedule-list > li')).toHaveLength(1);
  expect(within(container.querySelector('#dia-09')).getByText('Márcia Amaral')).toBeInTheDocument();
});
