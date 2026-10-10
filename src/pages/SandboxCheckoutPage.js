import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import './SandboxCheckoutPage.css';
import SandboxBankTransfer, { transferMessages, transferLabels } from './SandboxBankTransfer';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const emptySelection = () => ({ profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
const messages = {
  ...transferMessages,
  'invalid-session': ['A sessão expirou. Volte a iniciar sessão.', 'Your session expired. Sign in again.'],
  'admin-required': ['Este ensaio está reservado à conta administradora da organização.', 'This test is restricted to the organiser administrator account.'],
  'sandbox-not-configured': ['Falta configuração da sandbox no servidor. Não foi criado um pagamento.', 'Server sandbox configuration is missing. No payment was created.'],
  'student-not-approved': ['O comprovativo de estudante desta conta não está aprovado para 2026/2027.', 'This account has no approved student proof for 2026/2027.'],
  'uls-not-verified': ['Esta conta não tem uma associação MEC–nome ULS válida e ativa.', 'This account does not have a valid active ULS staff match.'],
  'course-required': ['Selecione pelo menos um curso para a modalidade só cursos.', 'Select at least one course for courses-only attendance.'],
  'course-already-owned': ['Esse curso já está incluído nesta inscrição de teste.', 'That course is already included in this test registration.'],
  'pending-order': ['Há um pedido por concluir. Atualize-o ou consulte a referência antes de iniciar outro.', 'A payment request is unresolved. Refresh it or inspect its reference before starting another.'],
  'quote-changed': ['A seleção, os preços ou a inscrição mudaram. Prepare um novo resumo antes de pagar.', 'Selection, prices or registration changed. Request a new summary before paying.'],
  'paid-registration-required': ['Esta conta não tem uma inscrição real confirmada e paga para copiar. Use Nova inscrição de teste.', 'This account has no confirmed paid registration to copy. Use New test registration.'],
  'idempotency-conflict': ['Este pedido já existe com dados diferentes. Atualize o registo; não repita a criação.', 'This request already exists with different data. Refresh it; do not repeat creation.'],
  'creation-unknown': ['A criação ficou por confirmar. Não gere outro pedido. Procure o identificador na sandbox e recupere a referência, se existir.', 'Creation is uncertain. Do not create another request. Look up its identifier in the sandbox and recover its reference if present.'],
  'reference-mismatch': ['A referência não corresponde a este pedido. Nenhum pagamento foi confirmado.', 'The reference does not match this request. No payment was confirmed.'],
  'recovery-not-allowed': ['Não é possível executar esta ação neste estado. Atualize o teste.', 'This action is unavailable in the current state. Refresh the test.'],
  'review-required': ['Um pagamento tardio precisa de reconciliação. Não foram duplicados os direitos de teste.', 'A late payment needs reconciliation. Test entitlements were not duplicated.'],
  conflict: ['O teste foi atualizado noutra operação. Atualize o registo antes de repetir.', 'Another operation updated the test. Refresh it before retrying.'],
  'not-found': ['O teste não foi encontrado nesta conta. Selecione-o no histórico.', 'The test was not found in this account. Select it from history.'],
  'invalid-quantity': ['A quantidade de jantares deve ser inteira e não ultrapassar o limite de teste.', 'Dinner quantity must be an integer within the test limit.'],
  'order-limit': ['Este teste atingiu o limite de pedidos. O histórico é conservado.', 'This test reached its order limit. Its history is retained.'],
  storage_forbidden: ['O Firebase recusou o acesso. Nenhuma confirmação foi forçada.', 'Firebase denied access. No confirmation was forced.'],
  storage_session_expired: ['A sessão foi recusada. Volte a iniciar sessão.', 'Your session was rejected. Sign in again.'],
};
const lineNames = {
  'congress-onsite': ['Congresso presencial', 'Onsite congress'], 'congress-virtual': ['Congresso online', 'Online congress'],
  'course-morning': ['Curso da manhã', 'Morning course'], 'course-afternoon': ['Curso da tarde', 'Afternoon course'], dinner: ['Jantar', 'Dinner'],
};
const statusNames = {
  creating: ['Criação em curso ou por confirmar', 'Creating or awaiting confirmation'],
  creation_unknown: ['Resultado da criação por confirmar', 'Creation outcome uncertain'],
  pending: ['Pedido criado — aguarda pagamento/notificação', 'Request created — awaiting payment/notification'],
  confirmed: ['Pagamento validado — inscrição de teste atualizada', 'Payment validated — test registration updated'],
  closed: ['Pedido encerrado pela informação da Eupago', 'Request closed according to Eupago'],
  review_required: ['Pagamento validado — requer reconciliação', 'Payment validated — reconciliation required'],
};
const storageGet = key => { try { return window.localStorage.getItem(key) || ''; } catch { return ''; } };
const storageSet = (key, value) => { try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* URL and in-memory state remain usable. */ } };

export default function SandboxCheckoutPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [params, setParams] = useSearchParams();
  const storageKey = `circ-checkout-sandbox-${user.uid}`;
  const initial = params.get('teste') || storageGet(storageKey);
  const [id, setId] = useState(UUID.test(initial) ? initial : '');
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [config, setConfig] = useState(null);
  const [selection, setSelection] = useState(emptySelection);
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState('mbway');
  const [phone, setPhone] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState(false);
  const [recoveries, setRecoveries] = useState({});
  const alive = useRef(true);
  const running = useRef(false);
  const creatingSession = useRef(null);
  const orderKey = `${storageKey}-${id}-order`;
  const money = cents => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const date = value => value ? new Date(value).toLocaleString(en ? 'en-GB' : 'pt-PT') : '—';
  const supplementary = session?.registration?.status === 'confirmed';
  const waiting = session?.orders.some(o => ['creating', 'creation_unknown', 'pending'].includes(o.status));
  const reviewRequired = session?.orders.some(o => o.status === 'review_required');

  async function api(path, body, signal, download = false) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/checkout/sandbox/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (download && response.ok) return response.blob();
    const data = await response.json();
    if (!response.ok) { const issue = new Error(data.error || 'service-unavailable'); issue.session = data.session; throw issue; }
    return data;
  }
  function updateSession(record) {
    if (!alive.current) return;
    setSession(record); setId(record.id); storageSet(storageKey, record.id); setParams({ teste: record.id }, { replace: true });
    setHistory(items => [{ id: record.id, createdAt: record.createdAt, confirmed: record.registration?.status === 'confirmed',
      latestStatus: record.orders.at(-1)?.status || 'draft', orderCount: record.orders.length }, ...items.filter(item => item.id !== record.id)]);
    if (record.orders.some(order => order.id === storageGet(`${storageKey}-${record.id}-order`))) storageSet(`${storageKey}-${record.id}-order`, '');
  }
  function displayError(issue) {
    if (!alive.current) return;
    if (issue.session) updateSession(issue.session);
    setError(messages[issue.message]?.[en ? 1 : 0] || t('Não foi possível concluir. Atualize o registo antes de repetir qualquer criação.', 'Could not complete the operation. Refresh before repeating any creation.'));
  }
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController(); let active = true;
    setBusy(true);
    (async () => {
      try {
        const settings = await api('config', undefined, controller.signal);
        if (!active) return; setConfig(settings);
        if (settings.eupagoConfigured === false) setMethod('bank_transfer');
        if (settings.configured) {
          const list = await api('sessions', undefined, controller.signal);
          if (!active) return; setHistory(list.sessions); setTruncated(list.truncated);
          if (id) { const result = await api(`sessions/${id}`, undefined, controller.signal); if (active) updateSession(result.session); }
        }
      } catch (issue) { if (active && issue.name !== 'AbortError') displayError(issue); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; alive.current = false; controller.abort(); };
    // Account changes remount the My CIRC frame. Initial URL is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  useEffect(() => {
    if (!id || !waiting || busy || pollError) return undefined;
    const controller = new AbortController(); let active = true; let timer;
    const poll = async () => {
      try {
        const data = await api(`sessions/${id}`, undefined, controller.signal);
        if (active) { updateSession(data.session); timer = setTimeout(poll, 5000); }
      } catch (issue) { if (active && issue.name !== 'AbortError') setPollError(true); }
    };
    timer = setTimeout(poll, 5000);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
    // Polling only reads our saved record; it never creates or simulates payments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, waiting, busy, pollError, user]);

  async function run(work) {
    if (busy || running.current) return; running.current = true; setBusy(true); setError('');
    try { await work(); } catch (issue) { displayError(issue); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function resetForm() { setSelection(emptySelection()); setQuote(null); setPhone(''); setAcknowledged(false); setPollError(false); }
  function newSession(source) {
    run(async () => {
      // Retrying an uncertain session creation reuses its ID, not a new session.
      if (!creatingSession.current || creatingSession.current.source !== source) creatingSession.current = { id: crypto.randomUUID(), source };
      const data = await api('sessions', creatingSession.current);
      updateSession(data.session); creatingSession.current = null; resetForm();
    });
  }
  function load(idToLoad) { run(async () => { updateSession((await api(`sessions/${idToLoad}`)).session); resetForm(); }); }
  function change(key, value) { setSelection(s => ({ ...s, [key]: value })); setQuote(null); setAcknowledged(false); }
  const selectedItems = () => supplementary ? { morningCourse: selection.morningCourse, afternoonCourse: selection.afternoonCourse, dinnerQuantity: selection.dinnerQuantity } : { ...selection };
  function prepare(event) {
    event.preventDefault(); run(async () => { const chosen = selectedItems(); const data = await api(`sessions/${id}/quote`, { selection: chosen }); setQuote({ ...data, chosen }); setAcknowledged(false); });
  }
  function createPayment(event) {
    event.preventDefault(); if (!quote || !acknowledged) return;
    run(async () => {
      const attemptId = storageGet(orderKey) || crypto.randomUUID(); storageSet(orderKey, attemptId);
      try {
        const data = await api(`sessions/${id}/orders`, { id: attemptId, selection: quote.chosen, stamp: quote.stamp, method,
          ...(method === 'mbway' ? { phone } : {}), sandboxAcknowledged: true });
        updateSession(data.session); resetForm();
      } finally { setPhone(''); }
    });
  }
  const confirmed = session?.registration;
  return <main className="sandbox-checkout admin-page">
    <AdminModuleNav />
    <header className="sandbox-checkout__header"><div><p className="sandbox-checkout__eyebrow">My CIRC · SANDBOX</p><h1>{t('Inscrição e pagamento de teste', 'Test registration and payment')}</h1></div><Link to="/admin/pagamentos-teste">{t('Teste técnico de 1 €', 'EUR 1 connection test')} ↗</Link></header>
    <section className="sandbox-checkout__notice" aria-label={t('Ambiente de testes', 'Test environment')}>
      <strong>{t('Só para testes — sem cobranças reais', 'Testing only — no real charges')}</strong>
      <p>{t('Este percurso usa a sandbox da Eupago ou transferências bancárias simuladas. Não efetue pagamentos no banco nem na aplicação MB WAY real. Não ocupa vagas reais, não resgata vouchers e não emite faturas ou certificados.', 'This flow uses Eupago sandbox or simulated bank transfers. Do not pay through your bank or the real MB WAY app. It does not use real places, redeem vouchers or issue invoices or certificates.')}</p>
    </section>
    {config && !config.configured && <p role="alert">{messages['sandbox-not-configured'][en ? 1 : 0]}</p>}
    {error && <p className="sandbox-checkout__error" role="alert">{error}</p>}
    {pollError && <p role="alert">{t('A atualização automática parou. Use Atualizar inscrição de teste; não crie outro pagamento.', 'Automatic refresh stopped. Use Refresh test registration; do not create another payment.')}</p>}
    {busy && <p role="status">{t('A processar…', 'Processing…')}</p>}
    <div className="sandbox-checkout__actions">
      <button type="button" disabled={busy || !config?.configured || waiting} onClick={() => newSession('new')}>{t('Nova inscrição de teste', 'New test registration')}</button>
      <button type="button" className="secondary" disabled={busy || !config?.configured || waiting} onClick={() => newSession('registration-copy')}>{t('Copiar inscrição confirmada para testar complementos', 'Copy confirmed registration to test add-ons')}</button>
      {id && <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => { updateSession((await api(`sessions/${id}`)).session); setPollError(false); })}>{t('Atualizar inscrição de teste', 'Refresh test registration')}</button>}
    </div>
    <p className="sandbox-checkout__muted">{t('A cópia de uma inscrição existente é apenas de leitura e também permite testar complementos de titulares de voucher. Nunca altera a inscrição original.', 'An existing registration is copied read-only; this also supports add-on tests for voucher holders. The original registration is never changed.')}</p>
    {session && <>
      <p className="sandbox-checkout__identifier">{t('Identificador da inscrição de teste', 'Test registration ID')}: <code>{session.id}</code></p>
      <ol className="sandbox-checkout__steps" aria-label={t('Progresso do teste', 'Test progress')}>
        <li className={quote || session.orders.length ? 'done' : ''}>1 · {t('Seleção e preço no servidor', 'Selection and server pricing')}</li>
        <li className={session.orders.some(o => o.reference || o.bankTransfer) ? 'done' : ''}>2 · {t('Pedido de teste registado', 'Test request recorded')}</li>
        <li className={session.orders.some(o => o.notification?.verifiedAt || o.bankTransfer?.confirmation) ? 'done' : ''}>3 · {t('Pagamento de teste validado', 'Test payment validated')}</li>
        <li className={supplementary ? 'done' : ''}>4 · {t('Inscrição de teste confirmada', 'Test registration confirmed')}</li>
      </ol>
      {confirmed && <section className="sandbox-checkout__confirmed" role="status"><h2>{t('Inscrição de teste confirmada', 'Test registration confirmed')}</h2>
        {confirmed.source === 'read_only_snapshot' && <p>{t('Base copiada de uma inscrição real confirmada. Os pagamentos seguintes pertencem apenas a este teste.', 'Baseline copied from a confirmed real registration. Subsequent payments belong only to this test.')}</p>}
        <p><strong>{t('Modalidade', 'Attendance')}:</strong> {confirmed.entitlements.congressMode === 'onsite' ? t('Presencial', 'Onsite') : confirmed.entitlements.congressMode === 'virtual' ? t('Online', 'Online') : t('Só cursos', 'Courses only')}</p>
        <p><strong>{t('Cursos confirmados no teste', 'Courses confirmed in this test')}:</strong> {[confirmed.entitlements.morningCourse && t('Manhã', 'Morning'), confirmed.entitlements.afternoonCourse && t('Tarde', 'Afternoon')].filter(Boolean).join(' · ') || t('Nenhum', 'None')}</p>
        <p><strong>{t('Jantares no teste', 'Dinners in this test')}:</strong> {confirmed.entitlements.dinnerQuantity}</p>
        <p>{t('Sem validade para entrada no evento. Faturação TOConline desligada neste ensaio.', 'Not valid for event admission. TOConline invoicing is disabled for this test.')}</p>
      </section>}
      {!waiting && !reviewRequired && <section className="sandbox-checkout__panel"><h2>{supplementary ? t('Adicionar cursos ou jantar ao teste', 'Add courses or dinner to this test') : t('Selecionar participação', 'Select participation')}</h2>
        <form onSubmit={prepare}>
          <fieldset disabled={busy}><div className="sandbox-checkout__grid">
            {!supplementary && <><label>{t('Categoria', 'Category')}<select value={selection.profile} onChange={e => change('profile', e.target.value)}>
              <option value="external">{t('Congressista externo', 'External attendee')}</option><option value="uls">ULS Coimbra</option><option value="student">{t('Estudante', 'Student')}</option></select></label>
              <label>{t('Participação', 'Attendance')}<select value={selection.congressMode} onChange={e => change('congressMode', e.target.value)}><option value="onsite">{t('Congresso presencial', 'Onsite congress')}</option><option value="virtual">{t('Congresso online', 'Online congress')}</option><option value="courses-only">{t('Só cursos', 'Courses only')}</option></select></label></>}
            <label className="check"><input type="checkbox" checked={selection.morningCourse} disabled={confirmed?.entitlements.morningCourse} onChange={e => change('morningCourse', e.target.checked)} />{t('Curso da manhã', 'Morning course')}{confirmed?.entitlements.morningCourse && t(' — já incluído', ' — already included')}</label>
            <label className="check"><input type="checkbox" checked={selection.afternoonCourse} disabled={confirmed?.entitlements.afternoonCourse} onChange={e => change('afternoonCourse', e.target.checked)} />{t('Curso da tarde', 'Afternoon course')}{confirmed?.entitlements.afternoonCourse && t(' — já incluído', ' — already included')}</label>
            <label>{t('Quantidade de jantares a adicionar', 'Dinner quantity to add')}<input type="number" min="0" max={config?.maxDinners || 20} step="1" value={selection.dinnerQuantity} onChange={e => change('dinnerQuantity', Number(e.target.value))} /></label>
          </div><p className="sandbox-checkout__muted">{t('As tarifas ULS e estudante exigem validação real desta conta no servidor, também neste ensaio. Não são aprovadas por selecionar a categoria.', 'ULS and student rates require this account’s real server-side eligibility, also in this test. Selecting a category does not approve it.')}</p><button type="submit">{t('Preparar resumo de teste', 'Prepare test summary')}</button></fieldset>
        </form>
        {quote && <form className="sandbox-checkout__quote" onSubmit={createPayment}><h3>{t('Resumo calculado pelo servidor', 'Server-calculated summary')}</h3>
          <dl>{quote.quote.lines.map(line => <React.Fragment key={line.code}><dt>{line.quantity} × {lineNames[line.code]?.[en ? 1 : 0] || line.code}</dt><dd>{money(line.amountCents)}</dd></React.Fragment>)}<dt><strong>{t('Total do pedido de teste', 'Test request total')}</strong></dt><dd><strong>{money(quote.quote.amountCents)}</strong></dd></dl>
          <p>{t('O valor usa o catálogo do CIRC, não o teste técnico fixo de 1 €. Continua a ser um pagamento simulado.', 'The amount uses the CIRC catalogue, not the fixed EUR 1 connection test. It is still a simulated payment.')}</p>
          <fieldset disabled={busy}><label>{t('Meio de pagamento', 'Payment method')}<select value={method} onChange={e => setMethod(e.target.value)}><option value="mbway" disabled={config?.eupagoConfigured === false}>MB WAY</option><option value="multibanco" disabled={config?.eupagoConfigured === false}>Multibanco</option><option value="bank_transfer">{t('Transferência bancária — teste', 'Bank transfer — test')}</option></select></label>
            {method === 'bank_transfer' && <p>{t('Pedido interno, sem dinheiro real. Comunique a transferência simulada; o comprovativo é opcional e a organização confirma após conferência.', 'Internal request without real money. Report the simulated transfer; proof is optional and the organiser confirms it after review.')}</p>}
            {method === 'mbway' && <label>{t('Número MB WAY para a sandbox', 'MB WAY number for sandbox')}<input type="tel" inputMode="numeric" autoComplete="off" pattern="9[0-9]{8}" maxLength="9" required value={phone} onChange={e => setPhone(e.target.value)} /><small>{t('Nove algarismos, sem +351. Use o número que já funcionou na sandbox. 987654321 é um cenário de erro, não de sucesso. O número não fica guardado no teste.', 'Nine digits, without +351. Use the number that already worked in sandbox. 987654321 is an error scenario, not a success scenario. The number is not stored in the test.')}</small></label>}
            <label className="check"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required />{t('Confirmo que este pedido é exclusivamente de teste e não vou pagá-lo no banco ou na aplicação MB WAY real.', 'I confirm this is a test-only request and will not pay it through my bank or the real MB WAY app.')}</label>
            <button type="submit" disabled={!acknowledged}>{method === 'bank_transfer' ? t('Criar pedido de transferência de teste', 'Create test transfer request') : t('Criar pedido na sandbox', 'Create sandbox request')} · {money(quote.quote.amountCents)}</button>
          </fieldset>
        </form>}
      </section>}
      {waiting && session.orders.some(o => o.method !== 'bank_transfer' && ['pending', 'creating', 'creation_unknown'].includes(o.status)) && <p className="sandbox-checkout__notice">{t('Localize na sandbox a referência e o identificador abaixo e simule aí o pagamento. Esta página lê automaticamente o resultado guardado pelo webhook a cada 5 segundos. Não é necessário consultar manualmente a Eupago para confirmar.', 'Find the reference and identifier below in sandbox and simulate payment there. This page reads the saved webhook result automatically every 5 seconds. A manual Eupago query is not required to confirm it.')}</p>}
      {session.orders.length > 0 && <section className="sandbox-checkout__panel"><h2>{t('Pedidos e notificações deste teste', 'Requests and notifications for this test')}</h2>
        {[...session.orders].reverse().map(order => <article key={order.id} className={`sandbox-checkout__order is-${order.status}`}>
          <h3>{order.method === 'bank_transfer' ? t('Transferência bancária — teste', 'Bank transfer — test') : order.method === 'mbway' ? 'MB WAY' : 'Multibanco'} · {money(order.amountCents)}</h3><p><strong>{order.bankTransfer ? transferLabels[order.bankTransfer.status]?.[en ? 1 : 0] : statusNames[order.status]?.[en ? 1 : 0] || order.status}</strong></p>
          {order.method !== 'bank_transfer' && <><dl><dt>{t('Referência', 'Reference')}</dt><dd>{order.reference || t('Ainda não confirmada', 'Not yet confirmed')}</dd>{order.entity && <><dt>{t('Entidade', 'Entity')}</dt><dd>{order.entity}</dd></>}<dt>{t('Identificador na Eupago', 'Eupago identifier')}</dt><dd><code>{order.identifier}</code></dd>
            <dt>{t('Criado em', 'Created at')}</dt><dd>{date(order.createdAt)}</dd>
            {order.providerState && <><dt>{t('Informação da consulta', 'Query information')}</dt><dd>{order.providerState}{!order.notification?.verifiedAt && t(' — não substitui a notificação validada', ' — does not replace a validated notification')}</dd></>}
            {order.creationDiagnostic && <><dt>{t('Diagnóstico da criação', 'Creation diagnostic')}</dt><dd>{order.creationDiagnostic}</dd></>}
            {order.notification && <><dt>{t('Notificação recebida', 'Notification received')}</dt><dd>{date(order.notification.receivedAt)}</dd><dt>{t('Validação', 'Validation')}</dt><dd>{order.notification.verifiedAt ? date(order.notification.verifiedAt) : t('Aguarda reconciliação', 'Awaiting reconciliation')}</dd><dt>{t('Transação', 'Transaction')}</dt><dd>{order.notification.transactionId}</dd></>}
          </dl>
          {order.reference && <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => updateSession((await api(`sessions/${id}/orders/${order.id}/inspect`, {})).session))}>{t('Consultar estado na Eupago', 'Inspect Eupago status')}</button>}
          {!order.reference && ['creating', 'creation_unknown'].includes(order.status) && <form onSubmit={event => { event.preventDefault(); run(async () => updateSession((await api(`sessions/${id}/orders/${order.id}/recover`, { reference: recoveries[order.id] || '' })).session)); }}>
            <label>{t('Referência encontrada na sandbox para este identificador', 'Reference found in sandbox for this identifier')}<input type="text" inputMode="numeric" pattern="[0-9]{1,30}" maxLength="30" required value={recoveries[order.id] || ''} onChange={e => setRecoveries(r => ({ ...r, [order.id]: e.target.value }))} /></label><button type="submit" disabled={busy}>{t('Recuperar referência sem criar outro pedido', 'Recover reference without another request')}</button>
          </form>}</>}
          {order.method === 'bank_transfer' && <SandboxBankTransfer key={`${id}-${order.id}`} sessionId={id} order={order} en={en} api={api} run={run} busy={busy} onUpdate={updateSession} account={config?.bankTransferAccount} />}
        </article>)}
      </section>}
    </>}
    <section className="sandbox-checkout__panel"><h2>{t('Histórico de inscrições de teste', 'Test registration history')}</h2>
      {history.length ? <ul className="sandbox-checkout__history">{history.map(item => <li key={item.id}><button type="button" className="secondary" disabled={busy} onClick={() => load(item.id)}><strong>{item.confirmed ? t('Confirmada', 'Confirmed') : t('Por concluir', 'Unfinished')}</strong> · {date(item.createdAt)}<small>{item.id}</small></button></li>)}</ul> : <p>{t('Ainda não há inscrições deste ensaio guardadas nesta conta.', 'No registrations from this test flow are saved in this account yet.')}</p>}
      {truncated && <p>{t('São apresentados até 100 testes. Os restantes não foram apagados; continuam acessíveis pelo respetivo endereço.', 'Up to 100 tests are shown. Others are not deleted and remain accessible at their own address.')}</p>}
    </section>
  </main>;
}
