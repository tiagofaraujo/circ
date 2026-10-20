import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProvisionalProgramme from './ProvisionalProgramme';

let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
const mount = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProvisionalProgramme /></MemoryRouter>);
const rows = (container, day) => Array.from(container.querySelector(`#dia-${day} > .schedule-list`).children);
const summary = row => [row.querySelector('.schedule-time')?.textContent, row.querySelector('h3')?.textContent];
const additionsPT = [
  ['16:15–17:00', 'Comunicações'],
  ['17:00–17:45', 'Coffee break'],
  ['17:45–18:30', 'Comunicações'],
  ['18:30–19:00', 'Momento cultural e de animação'],
  ['20:00', 'Jantar de convívio'],
];

beforeEach(() => {
  mockLanguage = 'pt';
  window.history.replaceState({}, '', '/programa#dia-09');
});
afterEach(() => { window.history.replaceState({}, '', '/'); });

test('publishes the five organiser notes inline after the existing photon-counting CT panel', () => {
  const { container } = mount();
  const day = container.querySelector('#dia-09');
  expect(day).toBeVisible();
  expect(rows(container, '09')).toHaveLength(15);
  expect(summary(rows(container, '09')[9])).toEqual(['15:05–16:05', 'Painel Internacional de TC por Contagem de Fotões']);
  expect(rows(container, '09').slice(-5).map(summary)).toEqual(additionsPT);
  for (const row of rows(container, '09').slice(-5)) {
    expect(row).toBeVisible();
    expect(row.querySelector('details, a, iframe')).toBeNull();
    expect(row.querySelector('h3')).toBeVisible();
  }
  expect(within(day).getByText('15 sessões')).toBeInTheDocument();
});

test('retains the existing visual distinction for breaks and cultural or social activities', () => {
  const { container } = mount();
  const added = rows(container, '09').slice(-5);
  for (const index of [1, 3, 4]) expect(added[index]).toHaveClass('schedule-row--practical');
  for (const index of [0, 2]) expect(added[index]).not.toHaveClass('schedule-row--practical');
  expect(added[4].querySelector('.schedule-time')).toHaveTextContent(/^20:00$/);
  expect(added[4].querySelector('.schedule-content').textContent).toBe('Jantar de convívio');
});

test('includes the same five times in the English programme', () => {
  mockLanguage = 'en';
  const { container } = mount();
  expect(rows(container, '09').slice(-5).map(summary)).toEqual([
    ['16:15–17:00', 'Presentations'],
    ['17:00–17:45', 'Coffee break'],
    ['17:45–18:30', 'Presentations'],
    ['18:30–19:00', 'Cultural programme and entertainment'],
    ['20:00', 'Congress dinner'],
  ]);
});

test('preserves days 8 and 10, the provisional notice and day navigation without duplicating new entries', () => {
  const { container } = mount();
  fireEvent.click(container.querySelector('button[aria-controls="dia-08"]'));
  expect(container.querySelector('#dia-08')).toBeVisible();
  expect(rows(container, '08')).toHaveLength(2);
  expect(rows(container, '08').map(row => row.querySelector('.schedule-time').textContent)).toEqual(['09:00–13:00', '14:00–18:00']);
  fireEvent.click(container.querySelector('button[aria-controls="dia-10"]'));
  expect(container.querySelector('#dia-10')).toBeVisible();
  expect(rows(container, '10')).toHaveLength(9);
  expect(summary(rows(container, '10')[1])).toEqual(['10:00–12:00', 'Comunicações Livres']);
  expect(summary(rows(container, '10')[7])).toEqual(['17:00', 'Coffee break']);
  expect(summary(rows(container, '10')[8])).toEqual(['17:30–18:10', 'Quo Vadis Radiologia']);
  fireEvent.click(container.querySelector('button[aria-controls="dia-09"]'));
  expect(window.location.hash).toBe('#dia-09');
  expect(rows(container, '09').slice(-5).map(summary)).toEqual(additionsPT);
  expect(container.querySelector('.schedule-status')).toHaveTextContent('Provisório');
  expect(container.querySelector('.schedule-notice')).toHaveTextContent('Programa sujeito a alterações.');
});
