import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminProductionCleanupPage from './AdminProductionCleanupPage';
import { prepareProductionCleanup, archiveProductionCleanup, restoreProductionCleanup } from '../auth/productionCleanupStore';
import { isRegistrationOpen } from '../data/registration2027';
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'admin', email: 'circ.chuc@gmail.com', emailVerified: true } }) }));
jest.mock('../components/AdminModuleNav', () => () => null);
jest.mock('../auth/productionCleanupStore', () => ({ prepareProductionCleanup: jest.fn(), archiveProductionCleanup: jest.fn(), restoreProductionCleanup: jest.fn() }));
jest.mock('../data/registration2027', () => ({ isRegistrationOpen: jest.fn() }));
const plan = { owner: 'admin', preparedAt: Date.now(), groups: [{ type: 'registration', id: 'test-old', sources: [{ path: 'registrations/test-old' }] }],
  totals: { registrations: 3, submissions: 2, sandbox: 6 }, eligible: { registrations: 2, submissions: 1, sandbox: 6, related: 0 },
  protectedItems: [{ reason: 'financial-record' }, { reason: 'review-linked' }], recent: [] };
beforeEach(() => { jest.clearAllMocks(); isRegistrationOpen.mockReturnValue(true); prepareProductionCleanup.mockResolvedValue(plan); });

test('before opening the archive is retained and restoration is visibly blocked', () => {
  isRegistrationOpen.mockReturnValue(false);
  render(<AdminProductionCleanupPage />);
  fireEvent.change(screen.getByLabelText('Referência do arquivo'), { target: { value: 'circ-production-archive-example' } });
  expect(screen.getByRole('button', { name: 'Repor os dados arquivados' })).toBeDisabled();
  expect(screen.getByText(/A reposição fica disponível a 15 de novembro/)).toBeInTheDocument();
  expect(restoreProductionCleanup).not.toHaveBeenCalled();
});

test('requires the reviewed inventory before enabling archive and reports financial/review protections', async () => {
  archiveProductionCleanup.mockResolvedValue({ archiveId: 'circ-production-archive-example', completed: 1, total: 1 });
  render(<AdminProductionCleanupPage />);
  expect(screen.queryByRole('button', { name: 'Arquivar os registos conferidos' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar inventário' }));
  const action = await screen.findByRole('button', { name: 'Arquivar os registos conferidos' });
  expect(prepareProductionCleanup).toHaveBeenCalledWith(expect.objectContaining({ uid: 'admin' }), { cutoff: expect.any(Number) });
  const cutoff = prepareProductionCleanup.mock.calls[0][1].cutoff;
  expect(Math.abs(Date.now() - cutoff)).toBeLessThan(10000);
  expect(action).toBeDisabled();
  expect(screen.getByText(/1 inscrição\(ões\) com informação financeira real/)).toBeInTheDocument();
  expect(screen.getByText('Consultar os 1 grupos a arquivar')).toBeInTheDocument();
  expect(screen.getByText('test-old')).toBeInTheDocument();
  expect(screen.getByText(/Apenas os registos identificados explicitamente como teste/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(action);
  await screen.findByText('Arquivo concluído. 1 grupo(s) retirado(s) dos ecrãs ativos.');
  expect(archiveProductionCleanup).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Referência do arquivo')).toHaveValue('circ-production-archive-example');
});

test('a partial failure keeps the archive reference available for recovery', async () => {
  archiveProductionCleanup.mockRejectedValue(Object.assign(new Error('cleanup/source-changed'), { archiveId: 'circ-production-archive-partial', completed: 1 }));
  restoreProductionCleanup.mockResolvedValue({ restored: 1 });
  render(<AdminProductionCleanupPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar inventário' }));
  await screen.findByRole('checkbox'); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar os registos conferidos' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Um registo foi alterado');
  expect(screen.getByLabelText('Referência do arquivo')).toHaveValue('circ-production-archive-partial');
  fireEvent.click(screen.getByRole('button', { name: 'Repor os dados arquivados' }));
  await screen.findByText('Dados repostos.');
  expect(restoreProductionCleanup).toHaveBeenCalledWith(expect.objectContaining({ uid: 'admin' }), 'circ-production-archive-partial');
});
