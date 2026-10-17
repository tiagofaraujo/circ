import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import './SandboxCheckoutPage.css';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{12}$/i;
const methodLabel = {
  multibanco: 'Multibanco',
  mbway: 'MB WAY',
  bank_transfer: 'Transferência bancária',
  stripe: 'Cartão',
};
const blockerText = {
  'document-series-required': 'Confirmar e configurar a série de documentos no TOConline.',
  'receipt-series-required': 'Confirmar a série de recibos que será utilizada.',
  'services-must-exist': 'Criar/confirmar no TOConline os serviços usados nas linhas do CIRC.',
  'vat-or-exemption-configuration-required': 'Confirmar com a contabilidade o IVA aplicável ou o motivo de isenção.',
  'production-customer-data-required': 'Na integração real serão usados os dados de faturação do participante, não os dados fictícios deste ensaio.',
  'mbway-payment-mechanism-required': 'Definir com a contabilidade qual o código TOConline a usar para MB WAY.',
  'payment-mechanism-required': 'Definir o meio de pagamento TOConline para este método.',
};
const warningText = {
  'bank-account-mapping-may-be-required': 'Pode ser necessário mapear a conta bancária no TOConline para este meio de recebimento.',
  'fr-auto-creates-associated-receipt': 'Na API v1, uma Fatura-recibo finalizada cria automaticamente o recibo associado.',
};
const errors = {
  'paid-test-required': 'É necessário selecionar um pedido de teste já confirmado.',
  'source-mismatch': 'Os valores guardados no pedido deixaram de ser consistentes. Não foi preparado qualquer documento.',
  'already-issued': 'Este pedido já tem uma emissão simulada. Reponha o ensaio antes de alterar o modo.',
  'stale-source': 'O pedido de origem mudou depois da preparação. Prepare novamente o ensaio.',
  'not-prepared': 'Prepare primeiro o documento antes de simular a emissão.',
  conflict: 'O registo foi alterado por outra operação. Atualize e tente novamente.',
};

export default function ToconlineReceiptTestPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [config, setConfig] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState(null);
  const [dateByOrder, setDateByOrder] = useState({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function call(base, path = '', body) {
    const token = await user.getIdToken();
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'service-unavailable');
    return data;
  }

  async function refresh(target = sessionId) {
    if (!target || !UUID.test(target)) { setSession(null); return; }
    const data = await call('/api/fiscal/sandbox/sessions/', target);
    setSession(data.session);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    (async () => {
      try {
        const [cfg, list] = await Promise.all([
          call('/api/fiscal/sandbox/config'),
          call('/api/checkout/sandbox/sessions'),
        ]);
        if (!active) return;
        setConfig(cfg);
        const confirmed = (list.sessions || []).filter(item => item.confirmed);
        setSessions(confirmed);
        if (confirmed[0]?.id) {
          setSessionId(confirmed[0].id);
          const data = await call('/api/fiscal/sandbox/sessions/', confirmed[0].id);
          if (active) setSession(data.session);
        }
      } catch (issue) {
        if (active) setError(errors[issue.message] || t('Não foi possível carregar os ensaios de faturação.', 'Could not load billing rehearsals.'));
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  async function run(work) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (issue) {
      setError(errors[issue.message] || t('A operação não foi concluída. Nenhum documento fiscal real foi emitido.', 'The operation was not completed. No real fiscal document was issued.'));
    } finally { setBusy(false); }
  }

  function selectSession(value) {
    setSessionId(value); setSession(null); setError(''); setMessage('');
    run(() => refresh(value));
  }

  function prepare(order) {
    run(async () => {
      const mode = 'invoice_receipt';
      const date = dateByOrder[order.id] || today;
      const data = await call(`/api/fiscal/sandbox/sessions/${session.id}/orders/${order.id}/prepare`, '', {
        mode, date, sandboxAcknowledged: true,
      });
      setSession(current => ({ ...current, orders: current.orders.map(item => item.id === order.id ? { ...item, rehearsal: data.rehearsal } : item) }));
      setMessage(t('Pré-visualização TOConline preparada. Não foi efetuada qualquer chamada ao TOConline.', 'TOConline preview prepared. No TOConline call was made.'));
    });
  }

  function issue(order) {
    run(async () => {
      const data = await call(`/api/fiscal/sandbox/sessions/${session.id}/orders/${order.id}/issue`, '', {
        id: crypto.randomUUID(), sandboxAcknowledged: true,
      });
      setSession(current => ({ ...current, orders: current.orders.map(item => item.id === order.id ? { ...item, rehearsal: data.rehearsal } : item) }));
      setMessage(t('Emissão simulada concluída sem efeito fiscal e sem comunicação externa.', 'Simulated issue completed with no fiscal effect and no external communication.'));
    });
  }

  function reset(order) {
    run(async () => {
      await call(`/api/fiscal/sandbox/sessions/${session.id}/orders/${order.id}/reset`, '', { sandboxAcknowledged: true });
      setSession(current => ({ ...current, orders: current.orders.map(item => item.id === order.id ? { ...item, rehearsal: null } : item) }));
      setMessage(t('Ensaio reposto. A inscrição e o pagamento de teste não foram alterados.', 'Rehearsal reset. The test registration and payment were not changed.'));
    });
  }

  const money = cents => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

  return <main className="sandbox-checkout admin-page">
    <AdminModuleNav />
    <header className="sandbox-checkout__header"><div><p className="sandbox-checkout__eyebrow">My CIRC · TOCONLINE · REHEARSAL</p>
      <h1>{t('Recibos e faturação — teste', 'Receipts and invoicing — test')}</h1></div></header>

    <section className="sandbox-checkout__notice">
      <strong>{t('Simulação interna — não emite documentos fiscais', 'Internal simulation — no fiscal documents are issued')}</strong>
      <p>{t('Este ensaio prepara os dados que futuramente serão enviados ao TOConline usando Fatura-recibo como modelo padrão do CIRC para pagamentos já confirmados. Não usa credenciais TOConline, não faz POST para a API, não comunica à AT e não envia emails.', 'This rehearsal prepares the data that may later be sent to TOConline using Invoice-receipt as the CIRC default for already confirmed payments. It uses no TOConline credentials, sends no API POST, does not communicate with the tax authority and sends no emails.')}</p>
    </section>

    {config && <p className="sandbox-checkout__muted"><strong>TOConline:</strong> {config.liveWritesEnabled ? t('escritas ativas', 'writes enabled') : t('escritas reais bloqueadas neste módulo', 'real writes blocked in this module')} · OAuth scope futuro: <code>{config.scopeRequired}</code></p>}
    {busy && <p role="status">{t('A processar…', 'Processing…')}</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="sandbox-checkout__error" role="alert">{error}</p>}

    <section className="sandbox-checkout__panel">
      <h2>{t('1. Escolher um pagamento de teste confirmado', '1. Select a confirmed test payment')}</h2>
      {sessions.length ? <label>{t('Inscrição de teste', 'Test registration')}
        <select value={sessionId} disabled={busy} onChange={e => selectSession(e.target.value)}>
          {sessions.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString(en ? 'en-GB' : 'pt-PT')} · {item.id}</option>)}
        </select>
      </label> : <p>{t('Ainda não existe uma inscrição de teste confirmada. Conclua primeiro um pagamento na área «Inscrição — teste».', 'There is no confirmed test registration yet. Complete a payment in “Registration — test” first.')}</p>}
    </section>

    {session?.orders?.map(order => {
      const r = order.rehearsal;
      return <section className="sandbox-checkout__panel" key={order.id}>
        <h2>{methodLabel[order.method] || order.method} · {money(order.amountCents)}</h2>
        <p><strong>{t('Pedido', 'Order')}:</strong> <code>{order.id}</code></p>
        <p><strong>{t('Transação/referência do pagamento', 'Payment transaction/reference')}:</strong> {order.transaction || '—'}</p>

        <div className="sandbox-checkout__grid">
          <label>{t('Modelo do documento', 'Document model')}<input value={t('Fatura-recibo', 'Invoice-receipt')} readOnly /></label>
          <label>{t('Data do documento de teste', 'Test document date')}<input type="date" disabled={busy || r?.status === 'simulated-issued'}
            value={dateByOrder[order.id] || r?.date || today}
            onChange={e => setDateByOrder(value => ({ ...value, [order.id]: e.target.value }))} /></label>
        </div>

        <div className="sandbox-checkout__actions">
          <button type="button" disabled={busy || r?.status === 'simulated-issued'} onClick={() => prepare(order)}>{r ? t('Atualizar pré-visualização', 'Refresh preview') : t('Preparar pré-visualização TOConline', 'Prepare TOConline preview')}</button>
          {r?.status === 'prepared' && <button type="button" disabled={busy} onClick={() => issue(order)}>{t('Simular emissão sem efeito fiscal', 'Simulate issue with no fiscal effect')}</button>}
          {r && <button type="button" className="secondary" disabled={busy} onClick={() => reset(order)}>{t('Repor este ensaio', 'Reset this rehearsal')}</button>}
        </div>

        {r && <>
          <h3>{t('Estado do ensaio', 'Rehearsal status')}</h3>
          <p><strong>{r.status === 'simulated-issued' ? t('Emissão simulada concluída', 'Simulated issue completed') : t('Preparado para simulação', 'Prepared for simulation')}</strong></p>
          <p>{t('Meio de pagamento TOConline identificado', 'Mapped TOConline payment method')}: <strong>{r.payment.code || t('por definir', 'not yet defined')}</strong> — {r.payment.label}</p>

          {r.blockers?.length > 0 && <details open><summary><strong>{t('Configuração que falta antes de ligar a API real', 'Configuration required before enabling the real API')}</strong></summary>
            <ul>{r.blockers.map(item => <li key={item}>{blockerText[item] || item}</li>)}</ul>
          </details>}
          {r.warnings?.length > 0 && <details><summary>{t('Notas técnicas', 'Technical notes')}</summary><ul>{r.warnings.map(item => <li key={item}>{warningText[item] || item}</li>)}</ul></details>}

          <details><summary>{t('Pré-visualizar payload do documento de venda', 'Preview sales-document payload')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.salesDocument, null, 2)}</pre>
          </details>
          {r.receipt && <details><summary>{t('Pré-visualizar payload do recibo', 'Preview receipt payload')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.receipt, null, 2)}</pre>
          </details>}
          {r.simulated && <div className="sandbox-checkout__confirmed">
            <h3>{t('Documentos simulados', 'Simulated documents')}</h3>
            <p><strong>{r.simulated.salesDocumentNo}</strong> · ID {r.simulated.salesDocumentId}</p>
            <p><strong>{r.simulated.receiptNo}</strong> · ID {r.simulated.receiptId}</p>
            <p>{t('Efeito fiscal: nenhum. Chamada ao TOConline: não.', 'Fiscal effect: none. TOConline call: no.')}</p>
          </div>}
        </>}
      </section>;
    })}
  </main>;
}
