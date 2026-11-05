import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { subscribeToRegistrations } from '../auth/adminStore';
import { admissionEntitlements, canAttendEventDay, canReceiveCredential } from '../auth/secretariatEligibility';
import {
  attendanceKey,
  updateCredentialDelivery,
  updateParticipantCheckIn,
} from '../auth/adminOperationsStore';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../adminOperations.css';

const eventDays = [
  { id: '2027-04-08', day: '08', month: 'ABR', label: 'Cursos Pré-Congresso' },
  { id: '2027-04-09', day: '09', month: 'ABR', label: 'Congresso · Dia 1' },
  { id: '2027-04-10', day: '10', month: 'ABR', label: 'Congresso · Dia 2' },
];

const paymentLabels = {
  pending: 'Pagamento pendente',
  awaiting_confirmation: 'Pagamento a confirmar',
  paid: 'Pago',
  refunded: 'Reembolsado',
  cancelled: 'Pagamento cancelado',
};

function participationLabel(registration, eventDay) {
  const entitlements = admissionEntitlements(registration);
  if (eventDay === '2027-04-08') {
    return [
      entitlements.morningCourse ? 'Curso manhã' : '',
      entitlements.afternoonCourse ? 'Curso tarde' : '',
    ].filter(Boolean).join(' · ') || 'Sem curso associado';
  }
  return 'Congresso presencial';
}

function formatTime(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AdminSecretariatPage() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [eventDay, setEventDay] = useState(eventDays[0].id);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [savingKey, setSavingKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => subscribeToRegistrations(
    (items) => {
      setRegistrations(items);
      setLoading(false);
      setError('');
    },
    () => {
      setLoading(false);
      setError('Não foi possível carregar os participantes. Confirme a ligação ao Firestore.');
    }
  ), []);

  const eligibleRegistrations = useMemo(() => registrations.filter((item) => canAttendEventDay(item, eventDay)), [eventDay, registrations]);

  const restrictedRegistrations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return registrations.filter(item => !canAttendEventDay(item, eventDay)
      && (item.capacityReviewOrderId || item.attendance?.[attendanceKey(eventDay)]?.checkedIn || item.credential?.delivered)
      && (!needle || `${item.id} ${item.participantName || ''} ${item.participantEmail || ''} ${item.registrationType || ''}`.toLowerCase().includes(needle)));
  }, [registrations, eventDay, query]);

  const visibleRegistrations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return eligibleRegistrations.filter((item) => {
      const checkedIn = Boolean(item.attendance?.[attendanceKey(eventDay)]?.checkedIn);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'checked_in' ? checkedIn : !checkedIn);
      const haystack = `${item.id} ${item.participantName || ''} ${item.participantEmail || ''} ${item.registrationType || ''}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [eligibleRegistrations, eventDay, query, statusFilter]);

  const stats = useMemo(() => {
    const dayKey = attendanceKey(eventDay);
    const checkedIn = eligibleRegistrations.filter((item) => item.attendance?.[dayKey]?.checkedIn).length;
    const credentials = eligibleRegistrations.filter((item) => item.credential?.delivered).length;
    return {
      eligible: eligibleRegistrations.length,
      checkedIn,
      pending: Math.max(0, eligibleRegistrations.length - checkedIn),
      credentials,
      percentage: eligibleRegistrations.length ? Math.round((checkedIn / eligibleRegistrations.length) * 100) : 0,
    };
  }, [eligibleRegistrations, eventDay]);

  const categoryStats = useMemo(() => {
    if (eventDay !== '2027-04-08') {
      const total = eligibleRegistrations.length;
      const checked = eligibleRegistrations.filter((item) => item.attendance?.[attendanceKey(eventDay)]?.checkedIn).length;
      return [{ label: 'Congresso presencial', total, checked }];
    }
    return [
      {
        label: 'Curso da manhã',
        total: eligibleRegistrations.filter((item) => admissionEntitlements(item).morningCourse).length,
        checked: eligibleRegistrations.filter((item) => admissionEntitlements(item).morningCourse && item.attendance?.[attendanceKey(eventDay)]?.checkedIn).length,
      },
      {
        label: 'Curso da tarde',
        total: eligibleRegistrations.filter((item) => admissionEntitlements(item).afternoonCourse).length,
        checked: eligibleRegistrations.filter((item) => admissionEntitlements(item).afternoonCourse && item.attendance?.[attendanceKey(eventDay)]?.checkedIn).length,
      },
    ];
  }, [eligibleRegistrations, eventDay]);

  const operatorStats = useMemo(() => {
    const counts = eligibleRegistrations.reduce((result, item) => {
      const record = item.attendance?.[attendanceKey(eventDay)];
      if (!record?.checkedIn) return result;
      const email = record.checkedInBy?.email || 'Operador não identificado';
      result[email] = (result[email] || 0) + 1;
      return result;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [eligibleRegistrations, eventDay]);

  const toggleCheckIn = async (registration) => {
    const checkedIn = !registration.attendance?.[attendanceKey(eventDay)]?.checkedIn;
    if (checkedIn && !canAttendEventDay(registration, eventDay)) return;
    setSavingKey(`${registration.id}:checkin`);
    setError('');
    try {
      await updateParticipantCheckIn(user, registration, eventDay, checkedIn);
    } catch (updateError) {
      setError('Não foi possível atualizar o check-in. Tente novamente.');
    } finally {
      setSavingKey('');
    }
  };

  const toggleCredential = async (registration) => {
    const delivered = !registration.credential?.delivered;
    if (delivered && !canReceiveCredential(registration)) return;
    setSavingKey(`${registration.id}:credential`);
    setError('');
    try {
      await updateCredentialDelivery(user, registration, delivered);
    } catch (updateError) {
      setError('Não foi possível atualizar a entrega da credencial.');
    } finally {
      setSavingKey('');
    }
  };

  const selectedDay = eventDays.find((item) => item.id === eventDay);

  return (
    <main className="admin-page admin-page--secretariat">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CIRC 2027 · Operação no local</p>
          <h1>Secretariado</h1>
          <p>Check-in rápido, entrega de credenciais e visão operacional em tempo real.</p>
        </div>
        <div className="admin-session admin-session--live">
          <span><i aria-hidden="true" /> Posto ativo</span>
          <strong>{user?.email}</strong>
          <small>{selectedDay?.label}</small>
        </div>
      </header>

      <AdminModuleNav />
      <p><Link to="/admin/estudantes">Validar comprovativos de estudantes →</Link></p>

      <section className="secretariat-days" aria-label="Selecionar dia do evento">
        {eventDays.map((item) => (
          <button type="button" key={item.id} className={eventDay === item.id ? 'is-active' : ''} onClick={() => setEventDay(item.id)}>
            <span><strong>{item.day}</strong><small>{item.month}</small></span>
            <span>{item.label}</span>
          </button>
        ))}
      </section>

      <section className="secretariat-dashboard" aria-label="Estatísticas de check-in">
        <article className="secretariat-progress-card">
          <div>
            <span>Presenças do dia</span>
            <strong>{stats.checkedIn}<small> / {stats.eligible}</small></strong>
            <p>{stats.pending} participante(s) por chegar</p>
          </div>
          <div className="secretariat-ring" style={{ '--checkin-progress': `${stats.percentage * 3.6}deg` }} role="img" aria-label={`${stats.percentage}% de check-ins concluídos`}>
            <span><strong>{stats.percentage}%</strong><small>check-in</small></span>
          </div>
        </article>

        <article className="secretariat-breakdown">
          <header><span>Distribuição</span><small>Check-ins por participação</small></header>
          <div>
            {categoryStats.map((category) => {
              const percentage = category.total ? Math.round((category.checked / category.total) * 100) : 0;
              return (
                <div key={category.label}>
                  <p><strong>{category.label}</strong><span>{category.checked} / {category.total}</span></p>
                  <div><span style={{ width: `${percentage}%` }} /></div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="secretariat-operators">
          <header><span>Secretariado</span><small>Check-ins por operador</small></header>
          {operatorStats.length ? (
            <ol>{operatorStats.slice(0, 4).map(([email, count]) => <li key={email}><span>{email}</span><strong>{count}</strong></li>)}</ol>
          ) : <p>Ainda sem atividade neste dia.</p>}
          <div><span>Credenciais entregues</span><strong>{stats.credentials}</strong></div>
        </article>
      </section>

      <section className="admin-workspace secretariat-workspace">
        <div className="admin-toolbar secretariat-toolbar">
          <label>
            <span>Procurar participante</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email ou ID da inscrição" autoComplete="off" />
          </label>
          <label>
            <span>Presença</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="pending">Por chegar</option>
              <option value="checked_in">Check-in concluído</option>
            </select>
          </label>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {!loading && restrictedRegistrations.length > 0 && <section className="admin-alert" aria-label="Inscrições que exigem conferência">
          <h2>Inscrições que exigem conferência</h2>
          {restrictedRegistrations.map(registration => <article key={registration.id} aria-label={registration.participantName || registration.id}>
            <p><strong>{registration.participantName || 'Participante sem nome'}</strong> · {registration.participantEmail || '—'} · {registration.id}</p>
            <p>{registration.capacityReviewOrderId ? 'Pagamento recebido, mas a vaga aguarda conferência pela organização. Não conceder novas entradas ou credenciais para os lugares pendentes.' : 'Esta inscrição não permite novas entradas neste dia. Os registos existentes podem ser anulados.'}</p>
            <Link to="/admin">Abrir gestão de inscrições</Link>
            {registration.attendance?.[attendanceKey(eventDay)]?.checkedIn && <button type="button" disabled={Boolean(savingKey)} onClick={() => toggleCheckIn(registration)}>Anular check-in de {registration.participantName || registration.id}</button>}
            {registration.credential?.delivered && <button type="button" disabled={Boolean(savingKey)} onClick={() => toggleCredential(registration)}>Anular entrega da credencial de {registration.participantName || registration.id}</button>}
          </article>)}
        </section>}
        {loading && <div className="admin-empty">A preparar o secretariado…</div>}
        {!loading && !error && !visibleRegistrations.length && (
          <div className="admin-empty">
            <strong>Não existem participantes neste resultado.</strong>
            <p>Confirme o dia selecionado ou altere os critérios de pesquisa.</p>
          </div>
        )}

        {!loading && visibleRegistrations.length > 0 && (
          <div className="secretariat-participant-list">
            <div className="secretariat-participant-list__head" aria-hidden="true">
              <span>Participante</span><span>Participação</span><span>Situação</span><span>Credencial</span><span>Presença</span>
            </div>
            {visibleRegistrations.map((registration) => {
              const attendance = registration.attendance?.[attendanceKey(eventDay)];
              const checkedIn = Boolean(attendance?.checkedIn);
              const credentialDelivered = Boolean(registration.credential?.delivered);
              const checkInSaving = savingKey === `${registration.id}:checkin`;
              const credentialSaving = savingKey === `${registration.id}:credential`;
              const paymentStatus = registration.payment?.status || 'pending';

              return (
                <article className={`secretariat-participant${checkedIn ? ' is-checked-in' : ''}`} key={registration.id}>
                  <div className="secretariat-participant__person">
                    {registration.isTest && <span className="admin-test-badge">TESTE</span>}
                    <strong>{registration.participantName || 'Participante sem nome'}</strong>
                    <span>{registration.participantEmail || '—'}</span>
                    <small>{registration.id}</small>
                  </div>
                  <div className="secretariat-participant__participation">
                    <span>{participationLabel(registration, eventDay)}</span>
                    <small>CIRC 2027</small>
                    {registration.capacityReviewOrderId && <small role="status">Vaga adicional em conferência. Apenas as participações já confirmadas permitem entrada.</small>}
                  </div>
                  <div className="secretariat-participant__payment">
                    <span className={`secretariat-badge secretariat-badge--${paymentStatus}`}>{paymentLabels[paymentStatus] || paymentStatus}</span>
                    <small>{registration.status === 'confirmed' ? 'Inscrição confirmada' : 'Inscrição por confirmar'}</small>
                  </div>
                  <button type="button" className={`secretariat-credential${credentialDelivered ? ' is-delivered' : ''}`} onClick={() => toggleCredential(registration)} disabled={credentialSaving || checkInSaving || (!credentialDelivered && !canReceiveCredential(registration))}>
                    <span>{credentialDelivered ? 'Entregue' : 'Por entregar'}</span>
                    <small>{credentialSaving ? 'A guardar…' : 'Credencial'}</small>
                  </button>
                  <button type="button" className={`secretariat-checkin${checkedIn ? ' is-complete' : ''}`} onClick={() => toggleCheckIn(registration)} disabled={checkInSaving || credentialSaving || (!checkedIn && !canAttendEventDay(registration, eventDay))}>
                    <span>{checkInSaving ? 'A guardar…' : checkedIn ? 'Check-in concluído' : 'Fazer check-in'}</span>
                    <small>{checkedIn ? `${formatTime(attendance.checkedInAt)} · ${attendance.checkedInBy?.email || ''}` : 'Registar presença'}</small>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="admin-footer">
        <p>Todos os check-ins e reversões ficam associados ao operador e ao dia do evento.</p>
        <Link to="/conta">← Voltar ao My CIRC</Link>
      </footer>
    </main>
  );
}
