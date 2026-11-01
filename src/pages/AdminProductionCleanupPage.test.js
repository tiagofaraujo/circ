import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminProductionCleanupPage from './AdminProductionCleanupPage';
import { prepareProductionCleanup, archiveProductionCleanup, restoreProductionCleanup } from '../auth/productionCleanupStore';
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'admin', email: 'circ.chuc@gmail.com', emailVerified: true } }) }));
jest.mock('../components/AdminModuleNav', () => () => null);
jest.mock('../auth/productionCleanupStore', () => ({ prepareProductionCleanup: jest.fn(), archiveProductionCleanup: jest.fn(), restoreProductionCleanup: jest.fn() }));
const plan = { owner: 'admin', preparedAt: Date.now(), groups: [{ id: 'old', sources: [] }],
  totals: { registrations: 3, submissions: 2, sandbox: 6 }, eligible: { registrations: 2, submissions: 1, sandbox: 6, related: 0 },
  protectedItems: [{ reason: 'financial-record' }, { reason: 'review-linked' }], recent: [] };
beforeEach(() => { jest.clearAllMocks(); prepareProductionCleanup.mockResolvedValue(plan); });

test('requires the reviewed inventory before enabling archive and reports financial/review protections', async () => {
  archiveProductionCleanup.mockResolvedValue({ archiveId: 'circ-production-archive-example', completed: 1, total: 1 });
  render(<AdminProductionCleanupPage />);
  expect(screen.queryByRole('button', { name: 'Arquivar os registos conferidos' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar inventário' }));
  const action = await screen.findByRole('button', { name: 'Arquivar os registos conferidos' });
  expect(prepareProductionCleanup).toHaveBeenCalledWith(expect.objectContaining({ uid: 'admin' }), { cutoff: Date.parse('2026-11-01T00:00:00Z') });
  expect(action).toBeDisabled();
  expect(screen.getByText(/1 inscrição\(ões\) com informação financeira real/)).toBeInTheDocument();
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
