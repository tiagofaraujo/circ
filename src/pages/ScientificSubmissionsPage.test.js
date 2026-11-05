import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScientificSubmissionsPage from './ScientificSubmissionsPage';
import { useAuth } from '../auth/AuthContext';
import { saveSubmission, updateSubmissionDraft, subscribeToUserSubmissions } from '../auth/adminOperationsStore';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../auth/adminOperationsStore', () => ({ saveSubmission: jest.fn(), updateSubmissionDraft: jest.fn(), deleteSubmissionDraft: jest.fn(),
  subscribeToUserSubmissions: jest.fn(), submissionErrorMessage: () => 'Não foi possível guardar o trabalho.' }));
const user = { uid: 'author', emailVerified: true, displayName: 'Autora' };
const form = { type: 'oral', title: 'Trabalho científico', authors: 'Autora', affiliation: 'Instituição', abstractSections: {
  introduction: 'Contexto', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia',
} };
function show() { render(<MemoryRouter><ScientificSubmissionsPage /></MemoryRouter>); }
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-15T12:00:00Z'));
  jest.clearAllMocks(); useAuth.mockReturnValue({ user, access: {} });
  subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([]); return () => {}; });
  saveSubmission.mockResolvedValue('new-id'); updateSubmissionDraft.mockResolvedValue('existing-id');
});
afterEach(() => jest.useRealTimers());
test('creation and editing stay closed before launch while existing work remains readable', () => {
  jest.setSystemTime(new Date('2026-11-14T23:59:59Z'));
  subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([{ id: 'existing-id', userId: user.uid, isTest: false, status: 'draft', ...form }]); return () => {}; });
  show();
  expect(screen.getByText('Submissões a partir de 15 de novembro')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Novo trabalho/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Editar rascunho/ })).not.toBeInTheDocument();
  expect(screen.getByText(form.title)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled();
  expect(saveSubmission).not.toHaveBeenCalled();
});
test('the composer opens automatically at midnight in Lisbon without reloading the page', () => {
  jest.setSystemTime(new Date('2026-11-14T23:59:59Z'));
  show(); expect(screen.getByRole('button', { name: /Novo trabalho/ })).toBeDisabled();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('button', { name: /Novo trabalho/ })).toBeEnabled();
  expect(screen.getByText('Submissões abertas')).toBeInTheDocument();
});
test('a normal participant sees an open production composer without administrative testing copy', () => {
  show(); expect(screen.getByText('Submissões abertas')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Novo trabalho/ }));
  expect(screen.getByRole('button', { name: /Submeter trabalho/ })).toBeInTheDocument();
  expect(screen.queryByText(/Modo de teste|Submeter teste|administrative test/i)).not.toBeInTheDocument();
});
test('saving a draft calls the real submission store for the signed-in owner', async () => {
  show(); fireEvent.click(screen.getByRole('button', { name: /Novo trabalho/ }));
  fireEvent.change(screen.getByPlaceholderText('Introduza um título claro e objetivo'), { target: { value: form.title } });
  fireEvent.change(screen.getByPlaceholderText('Um autor por linha, pela ordem de apresentação'), { target: { value: form.authors } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledWith(user, expect.objectContaining({ title: form.title, authors: form.authors }), 'draft'));
  expect(await screen.findByText(/O rascunho foi guardado/)).toBeInTheDocument();
});
test('an owned production draft can be reopened and submitted without creating another work', async () => {
  subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([{ id: 'existing-id', userId: user.uid, isTest: false, status: 'draft', ...form }]); return () => {}; });
  show(); fireEvent.click(screen.getByRole('button', { name: /Editar rascunho/ }));
  fireEvent.click(screen.getByRole('button', { name: /Submeter trabalho/ }));
  await waitFor(() => expect(updateSubmissionDraft).toHaveBeenCalledWith(user, expect.objectContaining({ id: 'existing-id' }), expect.objectContaining({ title: form.title }), 'submitted'));
  expect(await screen.findByText(/Trabalho submetido com sucesso/)).toBeInTheDocument();
  expect(saveSubmission).not.toHaveBeenCalled();
});
test('unverified participants receive a clear profile action instead of a save attempt', () => {
  useAuth.mockReturnValue({ user: { ...user, emailVerified: false }, access: {} }); show();
  expect(screen.getByRole('button', { name: /Novo trabalho/ })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Confirme o endereço de email');
});
