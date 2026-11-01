import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScientificSubmissionsPage from './ScientificSubmissionsPage';
import { useAuth } from '../auth/AuthContext';
import { loadSubmissionCorrection, saveSubmissionCorrection, resubmitSubmissionCorrection } from '../auth/submissionCorrections';
import { saveSubmission, updateSubmissionDraft, subscribeToUserSubmissions } from '../auth/adminOperationsStore';
jest.mock('../auth/submissionCorrections', () => ({ ...jest.requireActual('../auth/submissionCorrections'), loadSubmissionCorrection: jest.fn(), saveSubmissionCorrection: jest.fn(), resubmitSubmissionCorrection: jest.fn() }));
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
  jest.clearAllMocks(); useAuth.mockReturnValue({ user, access: {} });
  subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([]); return () => {}; });
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '11111111-1111-4111-8111-111111111111' } });
  loadSubmissionCorrection.mockResolvedValue(null); saveSubmissionCorrection.mockResolvedValue('2027-02-02T11:00:00Z'); resubmitSubmissionCorrection.mockResolvedValue({ id: 'correction', revisionVersion: 1 });
  saveSubmission.mockResolvedValue('new-id'); updateSubmissionDraft.mockResolvedValue('existing-id');
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

const correctionWork = { ...form, id: 'correction', userId: user.uid, eventId: 'circ-2027', type: 'oral', isTest: false, status: 'revisions', revisionVersion: 0,
  submittedAt: '2027-01-10T10:00:00Z', updatedAt: '2027-02-02T10:00:00Z',
  review: { note: 'Clarifique os métodos.', updatedAt: '2027-02-02T10:00:00Z', updatedBy: { uid: 'manager', email: 'manager@example.test' } } };
function withCorrection(work = correctionWork) { subscribeToUserSubmissions.mockImplementation((_uid, next) => { next([work]); return () => {}; }); }
test('requested corrections show the management note and keep author identity and type immutable', async () => {
  withCorrection(); show(); expect(screen.getByText('Clarifique os métodos.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Preparar correções' }));
  expect(await screen.findByRole('heading', { name: 'Corrigir o trabalho e reenviar para avaliação' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Comunicação livre/ })).toBeDisabled();
  expect(screen.getByPlaceholderText('Um autor por linha, pela ordem de apresentação')).toHaveAttribute('readonly');
  expect(screen.getByPlaceholderText('Ex.: ULS Coimbra')).toHaveAttribute('readonly');
});
test('the revised work is saved privately and resubmitted using one stable request identifier', async () => {
  withCorrection(); show(); fireEvent.click(screen.getByRole('button', { name: 'Preparar correções' }));
  fireEvent.click(await screen.findByRole('button', { name: /Reenviar trabalho corrigido/ }));
  expect(await screen.findByText(/Versão corrigida reenviada para avaliação/)).toBeInTheDocument();
  expect(saveSubmissionCorrection).toHaveBeenCalledWith(user, correctionWork, expect.objectContaining({ title: form.title }), null);
  expect(resubmitSubmissionCorrection).toHaveBeenCalledWith(user, correctionWork, expect.objectContaining({ title: form.title }), '11111111-1111-4111-8111-111111111111');
  expect(saveSubmission).not.toHaveBeenCalled(); expect(updateSubmissionDraft).not.toHaveBeenCalled();
});
test('a bare revisions status without a management request cannot expose the correction editor', () => {
  withCorrection({ ...correctionWork, review: null }); show();
  expect(screen.queryByRole('button', { name: 'Preparar correções' })).not.toBeInTheDocument();
});

test('an outdated private draft is replaced explicitly against its saved concurrency basis', async () => {
  const staleStamp = '2027-02-01T10:00:00Z';
  loadSubmissionCorrection.mockResolvedValue({ stale: true, draftUpdatedAt: staleStamp });
  withCorrection(); show(); fireEvent.click(screen.getByRole('button', { name: 'Preparar correções' }));
  expect(await screen.findByText(/O pedido da gestão foi atualizado/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Introduza um título claro e objetivo')).toHaveValue(form.title);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar correções' }));
  await waitFor(() => expect(saveSubmissionCorrection).toHaveBeenCalledWith(user, correctionWork, expect.objectContaining({ title: form.title }), staleStamp));
  expect(await screen.findByText(/As correções foram guardadas/)).toBeInTheDocument();
});
