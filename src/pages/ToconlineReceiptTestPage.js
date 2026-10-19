import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import { inspectCIRC27Rehearsal } from './circ2027FiscalDiagnostics';
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
  'toconline-not-connected': 'A ligação ao TOConline não está ativa. Faça primeiro a autorização OAuth.',
  'toconline-reauthorize-required': 'A sessão do TOConline expirou. Autorize novamente a ligação.',
  'toconline-not-configured': 'A ligação TOConline ainda não tem as credenciais de servidor necessárias.',
  'source-mismatch': 'Os valores guardados no pedido deixaram de ser consistentes. Não foi preparado qualquer documento.',
  'already-issued': 'Este pedido já tem uma emissão simulada. Reponha o ensaio antes de alterar o modo.',
  'stale-source': 'O pedido de origem mudou depois da preparação. Prepare novamente o ensaio.',
  'not-prepared': 'Prepare primeiro o documento antes de simular a emissão.',
  conflict: 'O registo foi alterado por outra operação. Atualize e tente novamente.',
};

const tocMissingNames = {
  clientId: 'TOCONLINE_OAUTH_CLIENT_ID',
  clientSecret: 'TOCONLINE_OAUTH_CLIENT_SECRET',
  oauthUrl: 'TOCONLINE_OAUTH_URL',
  apiUrl: 'TOCONLINE_API_URL',
  sessionKey: 'TOCONLINE_SESSION_KEY',
  redirectUrl: 'TOCONLINE_REDIRECT_URL',
};

export default function ToconlineReceiptTestPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [config, setConfig] = useState(null);
  const [tocConfig, setTocConfig] = useState(null);
  const [tocResources, setTocResources] = useState(null);
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
        const [cfg, toc, list] = await Promise.all([
          call('/api/fiscal/sandbox/config'),
          call('/api/fiscal/toconline/config'),
          call('/api/checkout/sandbox/sessions'),
        ]);
        if (!active) return;
        setConfig(cfg);
        setTocConfig(toc);
        const confirmed = (list.sessions || []).filter(item => item.confirmed);
        setSessions(confirmed);
        if (confirmed[0]?.id) {
          setSessionId(confirmed[0].id);
          const data = await call('/api/fiscal/sandbox/sessions/', confirmed[0].id);
          if (active) setSession(data.session);
        }
        if (toc.connected) {
          const live = await call('/api/fiscal/toconline/resources');
          if (active) setTocResources(live);
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

  function connectToconline() {
    run(async () => {
      const data = await call('/api/fiscal/toconline/authorize', '', {});
      if (!data.authorizationUrl) throw new Error('service-unavailable');
      window.location.assign(data.authorizationUrl);
    });
  }

  function loadToconlineResources() {
    run(async () => {
      const data = await call('/api/fiscal/toconline/resources');
      setTocResources(data);
      setMessage(t('Configuração lida do TOConline apenas por GET. Nenhum documento foi criado ou alterado.', 'TOConline configuration read using GET only. No document was created or changed.'));
    });
  }

  function disconnectToconline() {
    run(async () => {
      await call('/api/fiscal/toconline/disconnect', '', {});
      setTocResources(null);
      setTocConfig(current => ({ ...current, connected: false, accessExpiresAt: null, sessionExpiresAt: null }));
      setMessage(t('Ligação TOConline terminada neste navegador.', 'TOConline connection ended in this browser.'));
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

    <section className="sandbox-checkout__panel">
      <h2>{t('Ligação TOConline — apenas leitura', 'TOConline connection — read only')}</h2>
      <p>{t('O TOConline disponibiliza apenas o scope OAuth «commercial». Neste módulo o servidor CIRC restringe a utilização a uma lista fechada de pedidos GET: séries FR, serviços, taxas, motivos de isenção, contas bancárias, unidades e moeda. Não existe qualquer rota de escrita para o TOConline.', 'TOConline only provides the “commercial” OAuth scope. In this module the CIRC server restricts usage to a fixed list of GET requests: FR series, services, taxes, exemption reasons, bank accounts, units and currency. No TOConline write route is exposed.')}</p>
      {tocConfig && !tocConfig.configured && <>
        <p><strong>{t('Falta configurar as credenciais no Worker da Cloudflare.', 'Cloudflare Worker credentials still need to be configured.')}</strong></p>
        <p>{t('No TOConline: Empresa → Configurações → Dados API. O endereço de retorno a registar é:', 'In TOConline: Company → Settings → API Data. Register this callback URL:')}</p>
        <p><code>{tocConfig.redirectUrl}</code></p>
        <p>{t('Valores ainda em falta no servidor:', 'Server values still missing:')}</p>
        <ul>{tocConfig.missing.map(item => <li key={item}><code>{tocMissingNames[item] || item}</code>{item === 'sessionKey' && <> — {t('segredo aleatório próprio do CIRC, não fornecido pelo TOConline', 'CIRC-generated random secret, not supplied by TOConline')}</>}</li>)}</ul>
        <p className="sandbox-checkout__muted">{t('Não coloque Client Secret, tokens ou códigos de autorização neste chat, no GitHub ou em campos públicos do site.', 'Do not put the Client Secret, tokens or authorization codes in this chat, GitHub or public site fields.')}</p>
      </>}
      {tocConfig?.configured && !tocConfig.connected && <div className="sandbox-checkout__actions">
        <button type="button" disabled={busy} onClick={connectToconline}>{t('Autorizar TOConline em modo só de leitura', 'Authorize TOConline in read-only mode')}</button>
      </div>}
      {tocConfig?.configured && tocConfig.connected && <>
        <p><strong>{t('Ligação OAuth ativa neste navegador.', 'OAuth connection active in this browser.')}</strong></p>
        <div className="sandbox-checkout__actions">
          <button type="button" disabled={busy} onClick={loadToconlineResources}>{t('Atualizar dados de configuração', 'Refresh configuration data')}</button>
          <button type="button" className="secondary" disabled={busy} onClick={disconnectToconline}>{t('Desligar TOConline', 'Disconnect TOConline')}</button>
        </div>
      </>}
      {tocResources && <div>
        <h3>{t('Leitura atual do TOConline', 'Current TOConline read')}</h3>
        <p>{t('Obtida em', 'Fetched at')}: {new Date(tocResources.fetchedAt).toLocaleString(en ? 'en-GB' : 'pt-PT')}</p>
        <div className="sandbox-checkout__grid">
          {[
            ['series', 'Séries FR', 'FR series'],
            ['services', 'Serviços', 'Services'],
            ['taxes', 'Taxas PT', 'PT taxes'],
            ['exemptions', 'Motivos de isenção', 'Exemption reasons'],
            ['bankAccounts', 'Contas bancárias', 'Bank accounts'],
            ['units', 'Unidades', 'Units'],
            ['currencies', 'Moedas', 'Currencies'],
          ].map(([key, pt, english]) => {
            const resource = tocResources.resources?.[key];
            return <div key={key} className="sandbox-checkout__confirmed">
              <strong>{t(pt, english)}</strong>
              <p>{resource?.ok ? `${resource.count} ${t('registos', 'records')}` : t('Não foi possível ler este recurso', 'Could not read this resource')}</p>
              {!resource?.ok && <small>{resource?.error || '—'}{resource?.status ? ` · HTTP ${resource.status}` : ''}</small>}
            </div>;
          })}
        </div>
        {tocResources.resources?.series?.ok && <details><summary>{t('Séries de Fatura-recibo encontradas', 'Invoice-receipt series found')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(tocResources.resources.series.items, null, 2)}</pre></details>}
        {tocResources.resources?.services?.ok && <details><summary>{t('Serviços configurados', 'Configured services')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(tocResources.resources.services.items, null, 2)}</pre></details>}
        {tocResources.resources?.taxes?.ok && <details><summary>{t('Taxas de IVA PT', 'PT VAT rates')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(tocResources.resources.taxes.items, null, 2)}</pre></details>}
        {tocResources.resources?.exemptions?.ok && <details><summary>{t('Motivos de isenção', 'Exemption reasons')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(tocResources.resources.exemptions.items, null, 2)}</pre></details>}
        {tocResources.resources?.bankAccounts?.ok && <details><summary>{t('Contas bancárias', 'Bank accounts')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(tocResources.resources.bankAccounts.items, null, 2)}</pre></details>}
      </div>}
    </section>
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

          {(() => {
            const check = inspectCIRC27Rehearsal(r, tocResources);
            return <div className="sandbox-checkout__confirmed">
              <h3>{t('Diagnóstico fiscal CIRC2027 — só leitura', 'CIRC2027 fiscal diagnostics — read only')}</h3>
              <p>{t('Série FR 244 / CIRC2027', 'FR series 244 / CIRC2027')}: <strong>{check.seriesFound ? 'Confirmada na API' : 'Não confirmada nesta leitura'}</strong></p>
              <ul>{check.serviceChecks.map(item => <li key={item.code}>{item.code} (ID {item.id || '—'}): {item.ok ? 'Ativo · IVA incluído · NOR' : 'Por confirmar / divergente'}</li>)}</ul>
              <p>{t('Total das linhas', 'Line total')}: {(check.calculatedCents / 100).toFixed(2)} € · {t('Pagamento registado', 'Recorded payment')}: {(check.expectedCents / 100).toFixed(2)} € — <strong>{check.exactTotal ? 'Coincide' : 'DIVERGÊNCIA'}</strong></p>
              <p><strong>{t('Emissão fiscal real bloqueada', 'Real fiscal issuance blocked')}.</strong> {t('A existência da série não confirma comunicação à AT/ATCUD. A taxa, os adiantamentos e os dados do cliente aguardam validação.', 'Series presence does not confirm tax authority registration/ATCUD. Tax treatment, advances and customer details are pending validation.')}</p>
            </div>;
          })()}
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
