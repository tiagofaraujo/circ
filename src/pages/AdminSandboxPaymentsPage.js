import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../components/css/CompanyVouchers.css';

const errors = {
  sandbox_not_configured: 'A chave da sandbox ainda não está disponível neste servidor.',
  storage_session_expired: 'O Firebase recusou a sessão. Termine a sessão e volte a entrar com a conta administradora.',
  storage_forbidden: 'O Firebase recusou o registo do teste. Confirme as permissões da conta administradora.',
  storage_unavailable: 'Não foi possível consultar ou guardar o teste. Atualize o estado antes de voltar a tentar.',
  creation_unknown: 'A Eupago não confirmou o resultado. Consulte o backoffice da sandbox antes de iniciar outro teste.',
  storage_after_creation_failed: 'O pedido foi enviado, mas não foi possível guardar a resposta. Consulte o backoffice da sandbox.',
  creation_in_progress: 'O teste já está a ser criado. Atualize o estado dentro de alguns segundos.',
  provider_unavailable: 'Não foi possível consultar a Eupago. Tente atualizar o estado mais tarde.',
  not_found: 'Este teste não foi encontrado no servidor.',
  admin_required: 'Esta página requer a conta administradora do CIRC.',
  invalid_session: 'A sessão expirou. Volte a iniciar sessão.',
  sign_in_required: 'Inicie sessão com a conta administradora.',
};
const diagnosticMessage = (data) => {
  const message = errors[data.error] || 'Não foi possível concluir o pedido. Atualize o estado antes de repetir.';
  return typeof data.diagnostic === 'string' && (/^(read|create|update)\/(timeout|network|invalid-record|http-\d{3}\/[A-Z_]+)$/.test(data.diagnostic) || isProviderDiagnostic(data.diagnostic))
    ? `${message} Código de diagnóstico: ${data.diagnostic}` : message;
};
const isProviderDiagnostic = value => typeof value === 'string' && /^provider\/(?:unknown|timeout|network|invalid-json|invalid-response|invalid-reference|invalid-entity|rejected(?:\/code--?\d{1,4})?|http-[1-5]\d{2}(?:\/code--?\d{1,4})?)$/.test(value);
const providerLabels = { pendente: 'Pendente', pago: 'Pago (informação da Eupago)', paga: 'Pago (informação da Eupago)', expirado: 'Expirado', cancelado: 'Cancelado', transferida: 'Transferida (informação da Eupago)', erro: 'Erro', unknown: 'A resposta não contém um estado de pagamento reconhecido. Confirme no backoffice da sandbox.' };
const labels = { creating: 'Criação em curso ou por confirmar', pending: 'Referência criada — pagamento por verificar', creation_unknown: 'Resultado da criação por confirmar', sandbox_paid: 'Pagamento de teste validado por notificação e consulta à Eupago' };
function savedId(key) { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } }
function saveId(key, id) { try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* The current tab state still retains the ID. */ } }
export default function AdminSandboxPaymentsPage() {
  const { user } = useAuth();
  const storageKey = `circ-eupago-sandbox-${user.uid}`;
  const [id, setId] = useState(() => savedId(storageKey));
  const [method, setMethod] = useState('multibanco');
  const [phone, setPhone] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [webhook, setWebhook] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [checkedBackoffice, setCheckedBackoffice] = useState(false);
  const [checkoutSessions, setCheckoutSessions] = useState([]);
  const [checkoutTruncated, setCheckoutTruncated] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(true);
  const [checkoutError, setCheckoutError] = useState('');
  const [purgeText, setPurgeText] = useState('');
  async function checkoutApi(path, body) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/checkout/sandbox/${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'service-unavailable');
    return data;
  }
  async function refreshCheckoutSessions() {
    setCheckoutBusy(true); setCheckoutError('');
    try {
      const data = await checkoutApi('sessions');
      setCheckoutSessions(data.sessions || []); setCheckoutTruncated(Boolean(data.truncated));
    } catch {
      setCheckoutError('Não foi possível carregar as inscrições de teste.');
    } finally { setCheckoutBusy(false); }
  }
  async function api(path, body) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/payments/sandbox/${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { const issue = new Error(diagnosticMessage(data)); issue.safeMessage = true; issue.attempt = data.attempt; throw issue; }
    return data;
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const response = await fetch('/api/payments/sandbox/config', { headers, cache: 'no-store' });
        const config = await response.json(); if (!response.ok) throw new Error(config.error);
        if (!active) return; setConfigured(config.configured); setWebhook(config.webhook || null);
        if (!config.configured) setError(errors.sandbox_not_configured);
        const previous = savedId(storageKey);
        if (previous && config.configured) {
          const result = await fetch(`/api/payments/sandbox/attempts/${previous}`, { headers, cache: 'no-store' });
          const data = await result.json();
          if (!result.ok) { const issue = new Error(diagnosticMessage(data)); issue.safeMessage = true; throw issue; }
          if (active) setAttempt(data.attempt);
        }
        if (active) await refreshCheckoutSessions();
      } catch (e) { if (active) setError(e.safeMessage ? e.message : errors[e.message] || 'Não foi possível carregar o teste. Tente novamente.'); }
      finally { if (active) setBusy(false); }
    }
    load(); return () => { active = false; };
  }, [user, storageKey]);
  const webhookConfigured = Boolean(webhook?.signingKeyPresent && webhook?.channelPresent && webhook?.serviceAccountPresent);
  useEffect(() => {
    if (!webhookConfigured || !attempt?.reference || attempt.status === 'sandbox_paid' || busy) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/payments/sandbox/attempts/${id}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error();
        if (active) setAttempt(data.attempt);
      } catch { if (active) setError('A atualização automática parou. Use Atualizar registo do teste.'); }
    }, 10000);
    return () => { active = false; clearTimeout(timer); };
  }, [webhookConfigured, attempt, busy, id, user]);
  async function run(work) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); }
    catch (e) { if (e.attempt) setAttempt(e.attempt); setError(e.safeMessage ? e.message : errors[e.message] || 'Não foi possível concluir o pedido. Atualize o estado antes de repetir.'); }
    finally { setBusy(false); }
  }
  function create(event) {
    event.preventDefault();
    run(async () => {
      const next = id || crypto.randomUUID(); setId(next); saveId(storageKey, next);
      const data = await api('attempts', { id: next, method, ...(method === 'mbway' ? { phone } : {}) });
      setAttempt(data.attempt); setPhone('');
    });
  }
  const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100) : '—';
  const methodLabel = method => ({ mbway: 'MB WAY', multibanco: 'Multibanco', stripe_card: 'Stripe', bank_transfer: 'Transferência bancária' }[method] || '—');
  const statusLabel = status => ({ draft: 'Rascunho', creating: 'A criar', creation_unknown: 'Criação por confirmar', pending: 'Pendente',
    confirmed: 'Confirmado', review_required: 'Revisão necessária', closed: 'Encerrado' }[status] || status || '—');
  async function deleteCheckoutSession(sessionId) {
    if (!window.confirm('Apagar definitivamente esta inscrição de teste? Esta ação não afeta inscrições reais.')) return;
    setCheckoutBusy(true); setCheckoutError('');
    try {
      await checkoutApi(`sessions/${sessionId}/delete`, { confirmation: sessionId });
      try { if (localStorage.getItem(`circ-checkout-sandbox-${user.uid}`) === sessionId) localStorage.removeItem(`circ-checkout-sandbox-${user.uid}`); } catch {}
      await refreshCheckoutSessions();
    } catch { setCheckoutError('Não foi possível apagar esta inscrição de teste.'); setCheckoutBusy(false); }
  }
  async function purgeCheckoutSessions() {
    if (purgeText !== 'APAGAR TESTES') return;
    setCheckoutBusy(true); setCheckoutError('');
    try {
      const result = await checkoutApi('sessions/purge', { confirmation: purgeText });
      try { localStorage.removeItem(`circ-checkout-sandbox-${user.uid}`); } catch {}
      setPurgeText(''); await refreshCheckoutSessions();
      window.alert(`Limpeza concluída: ${result.deleted || 0} registos de sandbox eliminados.`);
    } catch { setCheckoutError('Não foi possível concluir a limpeza das inscrições de teste.'); setCheckoutBusy(false); }
  }
  return <main className="admin-page"><AdminModuleNav />
    <header><h1>Testes de pagamento</h1><p>Sandbox Eupago · acesso reservado à organização</p></header>
    <section className="company-voucher"><h2>Teste de ligação — 1,00 €</h2>
      <p>Este teste cria um pedido apenas no ambiente de demonstração. Não confirma inscrições, não reserva vagas e não emite faturas.</p>
      <p>Os dados apresentados destinam-se exclusivamente à sandbox. Não efetue pagamentos no banco ou na aplicação MB WAY real.</p>
      {!attempt && <form onSubmit={create}>
        <label>Meio de pagamento<select value={method} onChange={e => setMethod(e.target.value)} disabled={busy}><option value="multibanco">Multibanco</option><option value="mbway">MB WAY</option></select></label>
        {method === 'mbway' && <label>Número de teste MB WAY<input type="tel" inputMode="numeric" pattern="9[0-9]{8}" maxLength={9} required value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} /><small>Use um número indicado pela Eupago para os testes. O número 987654321 simula um erro.</small></label>}
        <button disabled={busy || !configured}>{busy ? 'A preparar…' : 'Criar pagamento de teste de 1,00 €'}</button>
      </form>}
      {id && <p>Identificador do teste: <code>{id}</code></p>}
      {attempt && <dl><dt>Estado</dt><dd>{attempt.status === 'pending' && ['pago', 'paga', 'transferida'].includes(attempt.providerState)
        ? 'Pago indicado pela Eupago — aguarda notificação validada' : labels[attempt.status] || 'Por verificar'}</dd>
        <dt>Meio de pagamento</dt><dd>{attempt.method === 'multibanco' ? 'Multibanco' : 'MB WAY'}</dd>
        {attempt.entity && <><dt>Entidade de teste</dt><dd>{attempt.entity}</dd></>}
        {attempt.reference && <><dt>Referência de teste</dt><dd>{attempt.reference}</dd></>}
        <dt>Valor de teste</dt><dd>1,00 €</dd><dt>Identificador na Eupago</dt><dd>{attempt.identifier}</dd>
        {attempt.inspectedAt && <><dt>Última consulta à Eupago</dt><dd>Consulta concluída em {new Date(attempt.inspectedAt).toLocaleString('pt-PT')}.</dd></>}
        {attempt.providerState && <><dt>Estado devolvido pela Eupago</dt><dd>{providerLabels[attempt.providerState] || providerLabels.unknown}</dd></>}
        {Number.isInteger(attempt.providerStateCode) && <><dt>Código devolvido pela API</dt><dd>{attempt.providerStateCode} — este código não confirma o pagamento.</dd></>}
        {isProviderDiagnostic(attempt.creationDiagnostic) && <><dt>Diagnóstico da criação</dt><dd>{attempt.creationDiagnostic}</dd></>}
        {attempt.notification && <><dt>Notificação automática</dt><dd>Recebida em {new Date(attempt.notification.receivedAt).toLocaleString('pt-PT')}{attempt.notification.verifiedAt ? ' — validada.' : ' — aguarda reconciliação com a Eupago.'}</dd>
          <dt>Transação de teste</dt><dd>{attempt.notification.transactionId}</dd></>}
      </dl>}
      {id && <button disabled={busy} onClick={() => run(async () => setAttempt((await api(`attempts/${id}`)).attempt))}>Atualizar registo do teste</button>}
      {attempt?.reference && <button disabled={busy} onClick={() => run(async () => setAttempt((await api(`attempts/${id}/inspect`, {})).attempt))}>Consultar estado na Eupago</button>}
      {attempt?.status === 'creation_unknown' && <label><input type="checkbox" checked={checkedBackoffice} onChange={e => setCheckedBackoffice(e.target.checked)} disabled={busy} /> Confirmei no backoffice da sandbox que este pedido não existe nem está pendente ou pago. O registo atual será conservado.</label>}
      {['pending', 'sandbox_paid', 'creation_unknown'].includes(attempt?.status) && <button disabled={busy || (attempt.status === 'creation_unknown' && !checkedBackoffice)} onClick={() => { saveId(storageKey, ''); setId(''); setAttempt(null); setError(''); setPhone(''); setCheckedBackoffice(false); }}>Preparar outro teste</button>}
      <p>A confirmação automática das inscrições ainda não está ativa. A consulta do estado serve apenas para verificar a ligação à Eupago.</p>
    </section>
    <section className="company-voucher">
      <h2>Gestão das inscrições de teste</h2>
      <p>Registos exclusivos da sandbox. Esta área não lista nem altera inscrições reais, vouchers, vagas ou faturação.</p>
      <div className="admin-actions">
        <button type="button" disabled={checkoutBusy} onClick={refreshCheckoutSessions}>Atualizar lista</button>
        <Link className="admin-button-link" to="/conta/inscricoes-teste">Nova inscrição de teste</Link>
      </div>
      {checkoutError && <p role="alert">{checkoutError}</p>}
      {checkoutBusy && <p role="status">A atualizar inscrições de teste…</p>}
      {!checkoutBusy && checkoutSessions.length === 0 && <p>Não existem inscrições de teste nesta conta.</p>}
      {!checkoutBusy && checkoutSessions.length > 0 && <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Data</th><th>ID</th><th>Método</th><th>Valor</th><th>Estado</th><th>Referência / transação</th><th>Ações</th></tr></thead>
          <tbody>{checkoutSessions.map(item => <tr key={item.id}>
            <td>{new Date(item.createdAt).toLocaleString('pt-PT')}</td>
            <td><code>{item.id}</code><br /><small>{item.orderCount} pedido(s)</small></td>
            <td>{methodLabel(item.latestMethod)}</td>
            <td>{money(item.totalAmountCents)}</td>
            <td>{statusLabel(item.latestStatus)}{item.confirmed ? <><br /><small>Inscrição confirmada</small></> : null}</td>
            <td>{item.latestEntity ? <>{item.latestEntity} · </> : null}{item.latestReference || item.latestTransactionId || '—'}{item.latestProviderState ? <><br /><small>{item.latestProviderState}</small></> : null}</td>
            <td><Link to={`/conta/inscricoes-teste?teste=${item.id}`}>Abrir</Link>{' · '}
              <button type="button" className="secondary" disabled={checkoutBusy} onClick={() => deleteCheckoutSession(item.id)}>Apagar</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {checkoutTruncated && <p><strong>Atenção:</strong> são mostradas apenas as 100 inscrições de teste mais recentes.</p>}
      <details style={{ marginTop: '1.5rem' }}>
        <summary><strong>Limpar todas as inscrições de teste</strong></summary>
        <p>Apaga apenas dados da sandbox associados a esta conta, incluindo inscrições de teste e anexos/validações simuladas de transferência. Não toca em inscrições reais.</p>
        <label>Para confirmar, escreva <code>APAGAR TESTES</code>
          <input value={purgeText} onChange={e => setPurgeText(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" disabled={checkoutBusy || purgeText !== 'APAGAR TESTES'} onClick={purgeCheckoutSessions}>Apagar todas as inscrições de teste</button>
      </details>
    </section>
    {webhook && <section className="company-voucher"><h2>Notificações automáticas — sandbox</h2>
      <p>{attempt?.notification?.verifiedAt ? 'Receção e validação da notificação comprovadas neste teste.' : webhookConfigured ? 'Configuração presente. Falta comprovar a receção de uma notificação real da sandbox.' : 'A receção automática aguarda a configuração do servidor e do canal da Eupago.'}</p>
      <ul><li>Chave de assinatura: {webhook.signingKeyPresent ? 'presente' : 'em falta'}</li>
        <li>Nome do canal: {webhook.channelPresent ? 'presente' : 'em falta'}</li>
        <li>Credencial de serviço Firebase: {webhook.serviceAccountPresent ? 'presente' : 'em falta'}</li></ul>
      <p>URL para o canal de testes:</p><code style={{ overflowWrap: 'anywhere' }}>{window.location.origin}{webhook.path}</code>
      <p>Webhook 2.0 · POST JSON · evento PAID · assinatura X-Signature · encrypt=false. A chave fica apenas no servidor.</p>
      <p>Após configurar e gerar um novo pagamento simulado, esta página atualiza o registo a cada 10 segundos enquanto aguarda a notificação. Fechar a página não impede a receção no servidor.</p>
    </section>}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">A processar…</p>}
  </main>;
}
