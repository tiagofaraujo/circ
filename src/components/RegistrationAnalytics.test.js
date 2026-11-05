import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RegistrationAnalytics from './RegistrationAnalytics';

function registration(userId, profile, selection, extra = {}) {
  return { id: `circ-2027-${userId}`, eventId: 'circ-2027', userId, primaryRegistration: true,
    isTest: false, testMode: false, status: 'confirmed', payment: { status: 'paid' },
    selection: { profile, ...selection }, entitlements: selection, ...extra };
}
const registrations = [
  registration('uls', 'uls', { congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2 }, { openSupplementaryOrderId: 'supplement' }),
  registration('external', 'external', { congressMode: 'virtual' }),
  registration('student', 'student', { congressMode: 'courses-only', afternoonCourse: true }),
  registration('pending', 'external', { congressMode: 'onsite', afternoonCourse: true, dinnerQuantity: 1 }, {
    status: 'submitted', entitlements: {}, payment: { status: 'pending', orderId: 'primary' },
  }),
];
const payments = [
  { id: 'primary', eventId: 'circ-2027', environment: 'production', registrationId: 'circ-2027-pending', userId: 'pending', kind: 'primary', status: 'pending' },
  { id: 'supplement', eventId: 'circ-2027', environment: 'production', registrationId: 'circ-2027-uls', userId: 'uls', kind: 'supplementary', status: 'pending', quote: { selection: { afternoonCourse: true, dinnerQuantity: 3 } } },
];

test('overview separates paid rights, pending orders, capacity and quantities without exposing participant data', () => {
  render(<RegistrationAnalytics registrations={registrations} payments={payments} />);
  const onsite = screen.getByRole('article', { name: 'Congresso presencial' });
  expect(within(onsite).getByText('399')).toBeInTheDocument();
  expect(within(onsite).getByText('400 vagas')).toBeInTheDocument();
  expect(within(onsite).getByText('Pagas e confirmadas')).toBeInTheDocument();
  const dinner = screen.getByRole('article', { name: 'Jantar do congresso' });
  expect(within(dinner).getByText('2')).toBeInTheDocument();
  expect(within(dinner).getByText('4')).toBeInTheDocument();
  expect(screen.getByText(/Inclui 1 pedido\(s\) complementar/)).toBeInTheDocument();
  expect(screen.getByText(/Os pedidos pendentes não reservam vagas/)).toBeInTheDocument();
  expect(screen.queryByText('circ-2027-uls')).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
});

test('profiles cross modalities and courses with a clear payment filter', () => {
  render(<RegistrationAnalytics registrations={registrations} payments={payments} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Perfis dos congressistas' }));
  expect(screen.getByRole('article', { name: 'Perfil Interno' })).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Perfil Externo' })).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Perfil Aluno' })).toBeInTheDocument();
  expect(screen.queryByRole('article', { name: 'Perfil Por identificar' })).not.toBeInTheDocument();
  const courseOnly = screen.getByRole('row', { name: /Só cursos pré-congresso/ });
  expect(within(courseOnly).getAllByRole('cell')).toHaveLength(3);
  const studentColumn = within(courseOnly).getAllByRole('cell')[2];
  expect(within(studentColumn).getByText('1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pendentes' }));
  const pendingExternal = screen.getByRole('article', { name: 'Perfil Externo' });
  expect(within(pendingExternal).getByText('100%')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pendentes' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('row', { name: /Jantar do congresso/ })).getAllByRole('cell')[0]).toHaveTextContent('3pendentes');
  expect(screen.getByText(/Os pendentes por opção incluem compras adicionais/)).toBeInTheDocument();
});

test('tabs support keyboard navigation and their panels are labelled', () => {
  render(<RegistrationAnalytics />);
  const overview = screen.getByRole('tab', { name: 'Visão geral' });
  fireEvent.keyDown(overview, { key: 'ArrowRight' });
  const profiles = screen.getByRole('tab', { name: 'Perfis dos congressistas' });
  expect(profiles).toHaveFocus();
  expect(profiles).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Perfis dos congressistas' })).toBeInTheDocument();
  fireEvent.keyDown(profiles, { key: 'Home' });
  expect(overview).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: 'Visão geral' })).toBeInTheDocument();
});

test('controlled view notifies the host and follows navigation changes', () => {
  const changeView = jest.fn();
  const { rerender } = render(<RegistrationAnalytics view="geral" onViewChange={changeView} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Perfis dos congressistas' }));
  expect(changeView).toHaveBeenCalledWith('perfis');
  expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
  rerender(<RegistrationAnalytics view="perfis" onViewChange={changeView} />);
  expect(screen.getByRole('tab', { name: 'Perfis dos congressistas' })).toHaveAttribute('aria-selected', 'true');
});

test.each([{ loading: true }, { paymentsLoading: true }])('waits for both source snapshots before showing complete totals: %j', state => {
  render(<RegistrationAnalytics registrations={registrations} {...state} />);
  expect(screen.getByRole('status')).toHaveTextContent('A carregar as estatísticas');
  expect(screen.queryByText('Inscrições ativas')).not.toBeInTheDocument();
  expect(screen.queryByRole('article', { name: 'Congresso presencial' })).not.toBeInTheDocument();
});

test.each([{ error: 'unavailable' }, { paymentsError: 'unavailable' }])('does not present incomplete data as zero when either source fails: %j', state => {
  render(<RegistrationAnalytics registrations={registrations} {...state} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as estatísticas');
  expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  expect(screen.queryByText('Inscrições ativas')).not.toBeInTheDocument();
});

test('empty state is explicit and unknown profiles do not get silently reclassified', () => {
  const { rerender } = render(<RegistrationAnalytics />);
  expect(screen.getByText(/Ainda não existem inscrições ativas/)).toBeInTheDocument();
  rerender(<RegistrationAnalytics registrations={[registration('unknown', undefined, { congressMode: 'virtual' })]} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Perfis dos congressistas' }));
  expect(screen.getByRole('article', { name: 'Perfil Por identificar' })).toHaveTextContent('1');
});

test('unpaid review notice makes no claim that money has been received', () => {
  render(<RegistrationAnalytics registrations={[registration('review', 'external', { congressMode: 'onsite' }, { status: 'submitted', payment: { status: 'pending', orderId: 'missing' } })]} />);
  expect(screen.getByText('1 inscrição(ões) em conferência.')).toBeInTheDocument();
  expect(screen.queryByText(/Os pagamentos recebidos estão registados/)).not.toBeInTheDocument();
});

test('historical registrations outside the canonical production ledger are disclosed without occupying places', () => {
  render(<RegistrationAnalytics registrations={[{ id: 'historical', status: 'confirmed', payment: { status: 'paid' }, selection: { congressMode: 'onsite' } }]} />);
  expect(screen.getByText(/1 registo\(s\) histórico\(s\) ou incompleto\(s\) fora das estatísticas/)).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Congresso presencial' })).getByText('400')).toBeInTheDocument();
});
