import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  paymentStatuses,
  registrationStatuses,
  subscribeToRegistrationNotes,
  subscribeToRegistrations,
  updatePaymentStatus,
  updateRegistrationNote,
  updateRegistrationStatus,
} from '../auth/adminStore';
import { subscribeToUserStats } from '../auth/presenceStore';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../adminOperations.css';

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

function exportRegistrations(registrations, registrationNotes) {
  const header = ['ID', 'Nome', 'Email', 'Tipo', 'Estado da inscrição', 'Estado do pagamento', 'Valor principal', 'Moeda', 'Referência', 'Curso manhã', 'Curso tarde', 'Jantares totais', 'Pedidos complementares', 'Observações'];
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
    item.entitlements?.morningCourse ? 'Sim' : 'Não',
    item.entitlements?.afternoonCourse ? 'Sim' : 'Não',
    Number(item.entitlements?.dinnerQuantity || 0),
    Number(item.addOnOrderCount || 0),
    registrationNotes[item.id] || '',
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
  const [registrationNotes, setRegistrationNotes] = useState({});
  const [noteDrafts, setNoteDrafts] = useState({});
  const [userStats, setUserStats] = useState({ total: null, online: null });
  const [userStatsUnavailable, setUserStatsUnavailable] = useState(false);

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

  useEffect(() => subscribeToRegistrationNotes(
    setRegistrationNotes,
    () => setError('Não foi possível carregar as observações administrativas.')
  ), []);

  useEffect(() => subscribeToUserStats(
    (stats) => {
      setUserStats(stats);
      setUserStatsUnavailable(false);
    },
    () => setUserStatsUnavailable(true)
  ), []);

  const visibleRegistrations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return registrations.filter((item) => {
      const matchesPayment = paymentFilter === 'all' || (item.payment?.status || 'pending') === paymentFilter;
      const haystack = `${item.id} ${item.participantName || ''} ${item.participantEmail || ''} ${item.registrationType || ''} ${registrationNotes[item.id] || ''}`.toLowerCase();
      return matchesPayment && (!needle || haystack.includes(needle));
    });
  }, [paymentFilter, query, registrationNotes, registrations]);

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

  const changeNoteDraft = (registrationId, value) => {
    setNoteDrafts((current) => ({ ...current, [registrationId]: value }));
  };

  const saveRegistrationNote = async (registration) => {
    const previousNote = String(registrationNotes[registration.id] || '').trim();
    const nextNote = String(noteDrafts[registration.id] ?? previousNote).trim();
    if (nextNote === previousNote) return;

    setSavingId(`${registration.id}:note`);
    setError('');
    try {
      await updateRegistrationNote(user, registration, nextNote, previousNote);
      setRegistrationNotes((current) => ({ ...current, [registration.id]: nextNote }));
      setNoteDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[registration.id];
        return nextDrafts;
      });
    } catch (updateError) {
      setError('Não foi possível guardar a observação. Tente novamente.');
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
          <Link className="admin-test-link" to="/conta/inscricoes">Testar uma inscrição →</Link>
          <button type="button" onClick={handleSignOut}>Terminar sessão</button>
        </div>
      </header>

      <AdminModuleNav />

      <section className="admin-user-summary" aria-label="Utilização do My CIRC">
        <div className="admin-user-summary__intro">
          <span>My CIRC</span>
          <small>Utilização da área reservada</small>
        </div>
        <div className="admin-user-summary__stat admin-user-summary__stat--accounts">
          <span>Contas registadas</span>
          <strong>{userStatsUnavailable ? '—' : (userStats.total ?? '…')}</strong>
        </div>
        <div className="admin-user-summary__stat admin-user-summary__stat--online">
          <span><i aria-hidden="true" />Online agora</span>
          <strong>{userStatsUnavailable ? '—' : (userStats.online ?? '…')}</strong>
        </div>
        <small className="admin-user-summary__note">
          {userStatsUnavailable ? 'Atividade temporariamente indisponível' : 'Atividade nos últimos 2 minutos'}
        </small>
      </section>

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
          <button type="button" className="admin-export" onClick={() => exportRegistrations(visibleRegistrations, registrationNotes)} disabled={!visibleRegistrations.length}>Exportar CSV</button>
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
              <thead><tr><th>Participante</th><th>Inscrição</th><th>Pagamento</th><th>Valor</th><th>Atualização</th><th className="admin-notes-heading">Observações</th></tr></thead>
              <tbody>
                {visibleRegistrations.map((item) => {
                  const savedNote = registrationNotes[item.id] || '';
                  const noteValue = noteDrafts[item.id] ?? savedNote;
                  const noteChanged = noteValue.trim() !== savedNote.trim();
                  const noteSaving = savingId === `${item.id}:note`;

                  return (
                  <tr key={item.id}>
                    <td>
                      {item.isTest && <span className="admin-test-badge">TESTE</span>}
                      <strong>{item.participantName || 'Sem nome'}</strong>
                      <span>{item.participantEmail || '—'}</span>
                      <small>{item.id}</small>
                    </td>
                    <td>
                      <span>{item.registrationType || 'CIRC 2027'}</span>
                      {item.entitlements && (
                        <small className="admin-registration-entitlements">
                          {[
                            item.entitlements.morningCourse ? 'Curso manhã' : '',
                            item.entitlements.afternoonCourse ? 'Curso tarde' : '',
                            Number(item.entitlements.dinnerQuantity || 0) > 0 ? `${item.entitlements.dinnerQuantity} jantar(es)` : '',
                          ].filter(Boolean).join(' · ') || 'Sem complementos'}
                        </small>
                      )}
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
                    <td className="admin-notes-cell">
                      <label className="admin-note-field">
                        <span className="sr-only">Observações sobre {item.participantName || item.participantEmail}</span>
                        <textarea
                          value={noteValue}
                          onChange={(event) => changeNoteDraft(item.id, event.target.value)}
                          maxLength="500"
                          rows="3"
                          placeholder="Adicionar observação interna…"
                          disabled={noteSaving}
                        />
                      </label>
                      <div className="admin-note-actions">
                        <small>{noteValue.length}/500</small>
                        <button type="button" onClick={() => saveRegistrationNote(item)} disabled={!noteChanged || noteSaving}>
                          {noteSaving ? 'A guardar…' : noteChanged ? 'Guardar' : 'Guardado'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
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
