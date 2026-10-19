import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScientificCommittee2027 from './ScientificCommittee2027';
import OrganizationPage2027 from '../pages/OrganizationPage2027';
import names from '../data/scientificCommittee2027.json';

let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
beforeEach(() => { mockLanguage = 'pt'; });

test('publishes exactly the 17 scientific committee display names in Portuguese alphabetical order', () => {
  expect(names).toHaveLength(17);
  expect(new Set(names).size).toBe(17);
  expect(names).toEqual([...names].sort(new Intl.Collator('pt-PT', { sensitivity: 'base' }).compare));
  expect(names.every(name => typeof name === 'string' && name === name.trim() && !/[@<>\r\n]/.test(name))).toBe(true);
  expect(names).toContain('Ana Machado');
  expect(names).toContain('Ana Isabel Machado');
  expect(names).toContain('Teresa Fátima Rodrigues');
  expect(names).toContain('Bruno Esteves');
  render(<ScientificCommittee2027 />);
  const section = screen.getByRole('region', { name: 'Comissão Científica' });
  const list = within(section).getByRole('list', { name: 'Comissão Científica CIRC 2027' });
  expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual(names);
});

test('the scientific section exposes names only, without contacts, portraits, roles or workbook download', () => {
  const { container } = render(<ScientificCommittee2027 />);
  expect(container.querySelectorAll('a, img, button, input, iframe, script')).toHaveLength(0);
  expect(container.textContent).not.toMatch(/@|mailto:|\.xlsx|Moderadores|Contacto/i);
  for (const item of screen.getAllByRole('listitem')) expect(item.childElementCount).toBe(0);
});

test('English heading and accessible label preserve all original Portuguese display names', () => {
  mockLanguage = 'en';
  render(<ScientificCommittee2027 />);
  expect(screen.getByRole('region', { name: 'Scientific Committee' })).toHaveAttribute('id', 'comissao-cientifica');
  expect(screen.getByRole('heading', { level: 2, name: 'Scientific Committee' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Scientific Committee CIRC 2027' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(names);
});

test('places the scientific section after the existing organising committee and adds direct navigation', () => {
  const { container } = render(<MemoryRouter><OrganizationPage2027 /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Comissões do CIRC 2027' });
  expect(within(nav).getByRole('link', { name: 'Comissão Científica' })).toHaveAttribute('href', '#comissao-cientifica');
  expect(within(nav).getByRole('link', { name: 'Comissão Organizadora' })).toHaveAttribute('href', '#comissao-organizadora');
  const organising = screen.getByRole('list', { name: 'Comissão Organizadora CIRC 2027' });
  expect(within(organising).getAllByRole('listitem')).toHaveLength(9);
  const scientific = screen.getByRole('region', { name: 'Comissão Científica' });
  expect(organising.compareDocumentPosition(scientific) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelectorAll('#comissao-cientifica')).toHaveLength(1);
});
