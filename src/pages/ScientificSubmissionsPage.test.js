import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScientificSubmissionsPage from './ScientificSubmissionsPage';
import { useAuth } from '../auth/AuthContext';
import { saveSubmission, updateSubmissionDraft, subscribeToUserSubmissions } from '../auth/adminOperationsStore';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
let mockLanguage = 'pt';
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: mockLanguage }) }));
jest.mock('../auth/adminOperationsStore', () => ({ saveSubmission: jest.fn(), updateSubmissionDraft: jest.fn(), deleteSubmissionDraft: jest.fn(),
  subscribeToUserSubmissions: jest.fn(), submissionErrorMessage: () => 'Não foi possível guardar o trabalho.' }));
const user = { uid: 'author', emailVerified: true, displayName: 'Autora' };
const form = { type: 'oral', title: 'Trabalho científico', authors: 'Autora', affiliation: 'Instituição', abstractSections: {
  introduction: 'Contexto', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia',
} };
function show() { render(<MemoryRouter><ScientificSubmissionsPage /></MemoryRouter>); }
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-15T12:00:00Z'));
  jest.clearAllMocks(); mockLanguage = 'pt'; useAuth.mockReturnValue({ user, access: {} });
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

test('a failed draft save shows its error beside the composer and clears after editing', async () => {
  saveSubmission.mockRejectedValueOnce(new Error('network'));
  show(); fireEvent.click(screen.getByRole('button', { name: /Novo trabalho/ }));
  const title = screen.getByPlaceholderText('Introduza um título claro e objetivo');
  fireEvent.change(title, { target: { value: form.title } });
  fireEvent.change(screen.getByPlaceholderText('Um autor por linha, pela ordem de apresentação'), { target: { value: form.authors } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
  const composer = document.querySelector('.submissions-composer');
  expect(await within(composer).findByRole('alert')).toHaveTextContent('Não foi possível guardar o trabalho.');
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  fireEvent.change(title, { target: { value: form.title + ' revisto' } });
  expect(within(composer).queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));
  await waitFor(() => expect(saveSubmission).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/O rascunho foi guardado/)).toBeInTheDocument();
});


test('opening a new scientific submission focuses the editor heading', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /Novo trabalho/ }));
  expect(screen.getByRole('heading', { name: 'Construa o trabalho passo a passo.' })).toHaveFocus();
});

test('editing a saved draft focuses the editor heading', () => {
  subscribeToUserSubmissions.mockImplementation((_uid, next) => {
    next([{ id: 'existing-id', userId: user.uid, isTest: false, status: 'draft', ...form }]);
    return () => {};
  });
  show();
  fireEvent.click(screen.getByRole('button', { name: /Editar rascunho/ }));
  expect(screen.getByRole('heading', { name: 'Continue o trabalho e submeta quando estiver pronto.' })).toHaveFocus();
});

test('a failed submission subscription is not presented as an empty list and can be retried', () => {
  let offline = true;
  subscribeToUserSubmissions.mockImplementation((_uid, next, onError) => {
    if (offline) onError(new Error('unavailable'));
    else next([]);
    return () => {};
  });
  show();
  expect(screen.getByRole('status')).toHaveTextContent('Não foi possível carregar os seus trabalhos.');
  expect(screen.queryByText('Ainda não existem trabalhos')).not.toBeInTheDocument();
  offline = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(subscribeToUserSubmissions).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Ainda não existem trabalhos')).toBeInTheDocument();
});

test('a pending submission subscription is not presented as an empty list', () => {
  subscribeToUserSubmissions.mockImplementation(() => () => {});
  show();
  expect(screen.getByRole('status')).toHaveTextContent('A carregar os seus trabalhos…');
  expect(screen.queryByText('Ainda não existem trabalhos')).not.toBeInTheDocument();
});

test('closing a new submission restores focus to the New submission button', () => {
  show();
  const trigger = screen.getByRole('button', { name: /Novo trabalho/ });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole('heading', { name: 'Construa o trabalho passo a passo.' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /Fechar formulário/ }));
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('heading', { name: 'Construa o trabalho passo a passo.' })).not.toBeInTheDocument();
});

test('closing an existing draft restores focus to its Edit draft button', () => {
  subscribeToUserSubmissions.mockImplementation((_uid, next) => {
    next([{ id: 'existing-id', userId: user.uid, isTest: false, status: 'draft', ...form }]);
    return () => {};
  });
  show();
  const trigger = screen.getByRole('button', { name: /Editar rascunho/ });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole('heading', { name: 'Continue o trabalho e submeta quando estiver pronto.' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /Fechar formulário/ }));
  expect(trigger).toHaveFocus();
});

test.each([
  ['pt', '2026-12-01T13:30:00Z', '13:30', 'hora de Lisboa'],
  ['en', '2027-04-05T13:30:00Z', '14:30', 'Lisbon time'],
])('shows submitted work dates in Lisbon time, without changing the stored timestamp (%s)', (language, submittedAt, shownTime, zoneLabel) => {
  mockLanguage = language;
  subscribeToUserSubmissions.mockImplementation((_uid, next) => {
    next([{ id: 'submitted-id', userId: user.uid, isTest: false, status: 'submitted', submittedAt, ...form }]);
    return () => {};
  });
  show();
  const date = document.querySelector('.submissions-test-list__timestamp');
  expect(date).toHaveTextContent(shownTime);
  expect(date).toHaveTextContent(zoneLabel);
  expect(date).toHaveAttribute('dateTime', new Date(submittedAt).toISOString());
});

test('a pending draft save announces progress and prevents duplicate actions in PT', () => {
  saveSubmission.mockImplementation(() => new Promise(() => {}));
  show();
  fireEvent.click(screen.getByRole('button', { name: /Novo trabalho/ }));
  fireEvent.change(screen.getByPlaceholderText('Introduza um título claro e objetivo'), { target: { value: form.title } });
  fireEvent.change(screen.getByPlaceholderText('Um autor por linha, pela ordem de apresentação'), { target: { value: form.authors } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar rascunho' }));

  expect(screen.getByRole('status')).toHaveTextContent('A guardar o trabalho…');
  expect(screen.getByRole('button', { name: 'Guardar rascunho' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Submeter trabalho/ })).toBeDisabled();
  expect(saveSubmission).toHaveBeenCalledTimes(1);
});

test('a pending scientific submission announces its different operation in EN', () => {
  mockLanguage = 'en';
  subscribeToUserSubmissions.mockImplementation((_uid, next) => {
    next([{ id: 'existing-id', userId: user.uid, isTest: false, status: 'draft', ...form }]);
    return () => {};
  });
  updateSubmissionDraft.mockImplementation(() => new Promise(() => {}));
  show();
  fireEvent.click(screen.getByRole('button', { name: /Edit draft/ }));
  fireEvent.click(screen.getByRole('button', { name: /Submit work/ }));

  expect(screen.getByRole('status')).toHaveTextContent('Submitting your work…');
  expect(screen.getByRole('button', { name: 'Update draft' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Submit work/ })).toBeDisabled();
  expect(updateSubmissionDraft).toHaveBeenCalledTimes(1);
});
