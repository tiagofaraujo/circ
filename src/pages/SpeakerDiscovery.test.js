import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Speakers2027Page from './Speakers2027Page';

jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
const mount = () => render(<MemoryRouter initialEntries={['/oradores']}>
  <Routes><Route path="/oradores" element={<Speakers2027Page />} /><Route path="/oradores/:speakerId" element={<Speakers2027Page />} /></Routes>
</MemoryRouter>);

test('search, role filter and empty-state reset work together', () => {
  mount();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'marcia coimbra' } });
  expect(screen.getByRole('heading', { name: 'Márcia Amaral' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('1 pessoa encontrada');
  fireEvent.change(screen.getByLabelText('Participação'), { target: { value: 'moderators' } });
  expect(screen.getByRole('status')).toHaveTextContent('0 pessoas encontradas');
  expect(screen.getByText(/Sem resultados/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(screen.getByRole('heading', { name: 'Márcia Amaral' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Samuel Oliveira' })).toBeVisible();
});

test('alphabetical sorting and directory filters survive a biography round trip', () => {
  const { container } = mount();
  fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'name' } });
  const names = [...container.querySelectorAll('.guest-directory > .guest-grid h3')].map(el => el.textContent);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt')));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'andrea' } });
  fireEvent.click(screen.getByRole('link', { name: 'Andrea Rockall — biografia' }));
  fireEvent.error(screen.getByRole('img', { name: 'Andrea Rockall' }));
  expect(screen.queryByRole('img', { name: 'Andrea Rockall' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Andrea Rockall')).toHaveTextContent('AR');
  fireEvent.click(screen.getByRole('link', { name: /Todos os oradores/ }));
  expect(screen.getByRole('searchbox')).toHaveValue('andrea');
  expect(screen.getByLabelText('Ordenar por')).toHaveValue('name');
});
