import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ScientificReviewerPage from './ScientificReviewerPage';
import { useAuth } from '../auth/AuthContext';
import { saveScientificEvaluation, subscribeAcceptedIdentity, subscribeReviewerWorks, useScientificReviewConfig } from '../auth/scientificReviewStore';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../auth/scientificReviewStore', () => ({ saveScientificEvaluation: jest.fn(), subscribeAcceptedIdentity: jest.fn(), subscribeReviewerWorks: jest.fn(), useScientificReviewConfig: jest.fn() }));
const user = { uid: 'reviewer', email: 'reviewer@example.test', emailVerified: true };
const works = [
  { id: 'one', submissionId: 'one', code: 'CIRC-01', title: 'Primeiro trabalho', status: 'under_review', abstract: 'Resumo científico', active: true, evaluation: null },
  { id: 'two', submissionId: 'two', code: 'CIRC-02', title: 'Segundo trabalho', status: 'under_review', abstract: 'Outro resumo', active: true, evaluation: null },
];
let receiveWorks, failWorks, receiveIdentity, stopIdentity;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user });
  useScientificReviewConfig.mockReturnValue({ loading: false, enabled: true });
  subscribeReviewerWorks.mockImplementation((_email, next, error) => { receiveWorks = next; failWorks = error; next(works); return () => {}; });
  stopIdentity = jest.fn();
  subscribeAcceptedIdentity.mockImplementation((_id, next) => { receiveIdentity = next; next({ authors: 'Autor privado' }); return stopIdentity; });
  saveScientificEvaluation.mockResolvedValue();
});
test('only assigned abstract and five criteria appear; zero saves with the reviewer comment', async () => {
  render(<ScientificReviewerPage />);
  fireEvent.click(screen.getByRole('button', { name: /CIRC-01/ }));
  expect(screen.getByText('Resumo científico')).toBeInTheDocument();
  expect(subscribeAcceptedIdentity).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Guardar avaliação' })).toBeDisabled();
  const inputs = screen.getAllByRole('spinbutton');
  expect(inputs).toHaveLength(5);
  [0, 7, 6, 7, 7].forEach((score, i) => fireEvent.change(inputs[i], { target: { value: String(score) } }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fundamentação da avaliação.' } });
  expect(screen.getByText('27,00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar avaliação' }));
  await screen.findByText('Avaliação guardada.');
  expect(saveScientificEvaluation).toHaveBeenCalledWith(user, works[0], { quality: '0', originality: '7', methodology: '6', clinicalRelevance: '7', impact: '7' }, 'Fundamentação da avaliação.');
});
test('acceptance loads author identity; revoked assignment clears it and ignores late callbacks', async () => {
  render(<ScientificReviewerPage />);
  fireEvent.click(screen.getByRole('button', { name: /CIRC-01/ }));
  act(() => receiveWorks([{ ...works[0], status: 'accepted' }]));
  await screen.findByText('Autor privado');
  expect(screen.getAllByRole('spinbutton')[0]).toBeDisabled();
  act(() => receiveWorks([]));
  expect(screen.queryByText('Autor privado')).not.toBeInTheDocument();
  expect(stopIdentity).toHaveBeenCalled();
  act(() => receiveIdentity({ authors: 'Resultado tardio' }));
  expect(screen.queryByText('Resultado tardio')).not.toBeInTheDocument();
});
test('unsaved edits survive a cancelled work change and subscription failure clears the view', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<ScientificReviewerPage />);
  fireEvent.click(screen.getByRole('button', { name: /CIRC-01/ }));
  fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: /CIRC-02/ }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Primeiro trabalho' })).toBeInTheDocument();
  expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(8);
  act(() => failWorks(new Error('permission-denied')));
  await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
  confirm.mockRestore();
});
test('the disabled module never subscribes to assignments', () => {
  useScientificReviewConfig.mockReturnValue({ loading: false, enabled: false });
  render(<ScientificReviewerPage />);
  expect(subscribeReviewerWorks).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Área de avaliação por ativar' })).toBeInTheDocument();
});
