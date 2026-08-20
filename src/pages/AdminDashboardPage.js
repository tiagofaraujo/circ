import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  paymentStatuses,
  registrationStatuses,
  subscribeToRegistrations,
  updatePaymentStatus,
  updateRegistrationStatus,
} from '../auth/adminStore';
import '../admin.css';

const paymentLabels = {
  pending: 'Pendente',
  awaiting_confirmation: 'A confirmar',
  paid: 'Pago',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
};

const registrationLabels = {
  draft: 'Rascunho',
  submitted: 'Submetida',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

function formatMoney(amountCents, currency = 'EUR') {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(Number(amountCents || 0) / 100);
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRegistrations(registrations) {
  const header = ['ID', 'Nome', 'Email', 'Tipo', 'Estado da inscrição', 'Estado do pagamento', 'Valor', 'Moeda', 'Referência'];
  const rows = registrations.map((item) => [
    item.id,
    item.participantName,
    item.participantEmail,
    item.registrationType,
    registrationLabels[item.status] || item.status,
    paymentLabels[item.payment?.status] || item.payment?.status,
    Number(item.payment?.amountCents || 0) / 100,
    item.payment?.currency || 'EUR',
    item.payment?.reference || '',
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `circ-2027-inscricoes-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState([]);
  const [query, setQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');

  useEffect(() => subscribeToRegistrations(
    (items) => {
      setRegistrations(items);
      setLoading(false);
      setError('');
    },
    (subscriptionError) => {
      setLoading(false);
      setError(subscriptionError?.code === 'failed-precondition'
        ? 'O índice Firestore das inscrições ainda não foi publicado.'
        : 'Não foi possível carregar as inscrições. Confirme a configuração e as regras do Firebase.');
    }
  ), []);

  const visibleRegistrations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return registrations.filter((item) => {
      const matchesPayment = paymentFilter === 'all' || (item.payment?.status || 'pending') === paymentFilter;
      const haystack = `${item.id} ${item.participantName || ''} ${item.participantEmail || ''} ${item.registrationType || ''}`.toLowerCase();
      return matchesPayment && (!needle || haystack.includes(needle));
    });
  }, [paymentFilter, query, registrations]);

  const counts = useMemo(() => ({
    total: registrations.length,
    paid: registrations.filter((item) => item.payment?.status === 'paid').length,
    pending: registrations.filter((item) => !item.payment?.status || ['pending', 'awaiting_confirmation'].includes(item.payment.status)).length,
    confirmed: registrations.filter((item) => item.status === 'confirmed').length,
  }), [registrations]);

  const changePayment = async (registration, status) => {
    setSavingId(`${registration.id}:payment`);
    setError('');
    try {
      await updatePaymentStatus(user, registration, status);
    } catch (updateError) {
      setError('Não foi possível atualizar o pagamento. A alteração não foi guardada.');
    } finally {
      setSavingId('');
    }
  };

  const changeRegistration = async (registration, status) => {
    setSavingId(`${registration.id}:registration`);
    setError('');
    try {
      await updateRegistrationStatus(user, registration, status);
    } catch (updateError) {
      setError('Não foi possível atualizar a inscrição. A alteração não foi guardada.');
    } finally {
      setSavingId('');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CIRC 2027 · Administração</p>
          <h1>Inscrições e pagamentos</h1>
          <p>Área reservada para acompanhamento operacional do congresso.</p>
        </div>
        <div className="admin-session">
          <span>Administrador verificado</span>
          <strong>{user?.email}</strong>
          <button type="button" onClick={handleSignOut}>Terminar sessão</button>
        </div>
      </header>

      <section className="admin-metrics" aria-label="Resumo">
        <article><span>Total</span><strong>{counts.total}</strong><small>inscrições</small></article>
        <article><span>Pagas</span><strong>{counts.paid}</strong><small>confirmadas financeiramente</small></article>
        <article><span>Pendentes</span><strong>{counts.pending}</strong><small>a aguardar validação</small></article>
        <article><span>Confirmadas</span><strong>{counts.confirmed}</strong><small>participação confirmada</small></article>
      </section>

      <section className="admin-workspace">
        <div className="admin-toolbar">
          <label>
            <span>Pesquisar</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email ou ID" />
          </label>
          <label>
            <span>Pagamento</span>
            <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
              <option value="all">Todos</option>
              {paymentStatuses.map((status) => <option key={status} value={status}>{paymentLabels[status]}</option>)}
            </select>
          </label>
          <button type="button" className="admin-export" onClick={() => exportRegistrations(visibleRegistrations)} disabled={!visibleRegistrations.length}>Exportar CSV</button>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {loading && <div className="admin-empty">A carregar inscrições…</div>}
        {!loading && !error && !visibleRegistrations.length && (
          <div className="admin-empty">
            <strong>Ainda não existem inscrições para apresentar.</strong>
            <p>A área fica pronta para receber os registos do CIRC 2027 quando o formulário de inscrição for ativado.</p>
          </div>
        )}

        {!loading && visibleRegistrations.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Participante</th><th>Inscrição</th><th>Pagamento</th><th>Valor</th><th>Atualização</th></tr></thead>
              <tbody>
                {visibleRegistrations.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.participantName || 'Sem nome'}</strong><span>{item.participantEmail || '—'}</span><small>{item.id}</small></td>
                    <td>
                      <span>{item.registrationType || 'CIRC 2027'}</span>
                      <select value={item.status || 'draft'} onChange={(event) => changeRegistration(item, event.target.value)} disabled={savingId === `${item.id}:registration`} aria-label={`Estado da inscrição de ${item.participantName || item.participantEmail}`}>
                        {registrationStatuses.map((status) => <option key={status} value={status}>{registrationLabels[status]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={`admin-status admin-status--${item.payment?.status || 'pending'}`} value={item.payment?.status || 'pending'} onChange={(event) => changePayment(item, event.target.value)} disabled={savingId === `${item.id}:payment`} aria-label={`Estado do pagamento de ${item.participantName || item.participantEmail}`}>
                        {paymentStatuses.map((status) => <option key={status} value={status}>{paymentLabels[status]}</option>)}
                      </select>
                      <small>{item.payment?.method || 'Método não indicado'}</small>
                    </td>
                    <td><strong>{formatMoney(item.payment?.amountCents, item.payment?.currency)}</strong><small>{item.payment?.reference || 'Sem referência'}</small></td>
                    <td><span>{formatDate(item.updatedAt || item.createdAt)}</span><small>{Number(item.documentCount || 0)} documento(s)</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="admin-footer">
        <p>Pagamentos: guardar apenas estado, montante, método e referência do prestador. Nunca guardar dados de cartão.</p>
        <Link to="/conta">← Voltar ao My CIRC</Link>
      </footer>
    </main>
  );
}
