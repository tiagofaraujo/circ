import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import CircFiscalRehearsalDiagnostics from '../components/CircFiscalRehearsalDiagnostics';
import LivePaymentSetupDiagnostics from '../components/LivePaymentSetupDiagnostics';
import { CIRC27_FISCAL_POLICY_VERSION, inspectCIRC27Rehearsal } from './circ2027FiscalDiagnostics';
import './SandboxCheckoutPage.css';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{12}$/i;
// Comunicação da série CIRC2027 à AT confirmada administrativamente em 23/10/2026.
// A leitura OAuth atual confirma a série, mas não expõe o código AT/ATCUD.
const CIRC2027_SERIES_AT_COMMUNICATION_CONFIRMED = true;
const methodLabel = {
  multibanco: 'Multibanco',
  mbway: 'MB WAY',
  bank_transfer: 'Transferência bancária',
  stripe: 'Cartão',
};
const blockerText = {
  'document-series-required': 'Confirmar e configurar a série de documentos no TOConline. A presença da série 244 na pré-visualização não comprova a comunicação à AT/ATCUD.',
  'receipt-series-required': 'Confirmar a série de recibos que será utilizada.',
  'services-must-exist': 'Confirmar na leitura atual do TOConline os serviços, IDs e enquadramentos usados nas linhas do CIRC.',
  'vat-or-exemption-configuration-required': 'Conferir as fichas na API: inscrições ISE/M07 (motivo ID 9); serviços tributados com o enquadramento respetivo. A indicação contabilística não altera automaticamente as fichas.',
  'production-customer-data-required': 'Na integração real serão usados os dados de faturação do participante, não os dados fictícios deste ensaio.',
  'mbway-payment-mechanism-required': 'Definir com a contabilidade qual o código TOConline a usar para MB WAY.',
  'payment-mechanism-required': 'Definir o meio de pagamento TOConline para este método.',
  'toconline-calculation-not-tested': 'A aceitação e os arredondamentos da API do TOConline ainda não foram validados. Este cálculo é apenas local.',
  'course-tax-clarification-pending': 'Cursos: referência de 23% segundo a indicação contabilística recebida; esclarecimento complementar pendente antes da emissão real.',
  'dinner-tax-treatment-required': 'Jantar autónomo e acompanhantes: tratamento fiscal por esclarecer. Não é assumida isenção nem taxa; o total de IVA deste pedido fica por apurar.',
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
  'stale-tax-policy': 'Este ensaio usa uma configuração fiscal anterior. Atualize a pré-visualização antes de simular a emissão.',
  'not-prepared': 'Prepare primeiro o documento antes de simular a emissão.',
  conflict: 'O registo foi alterado por outra operação. Atualize e tente novamente.',
  'confirmation-required': 'A confirmação explícita do teste da API é obrigatória.',
  'simulated-issue-required': 'Conclua primeiro a emissão simulada deste pedido.',
  'first-test-scope-only': 'Este primeiro teste real da API está limitado à inscrição presencial simples de 95 €.',
  'billing-customer-unconfirmed': 'Os dados de faturação do perfil estão incompletos ou inválidos.',
  'toconline-draft-api-unavailable': 'A API TOConline não respondeu ao teste do rascunho.',
  'toconline-draft-api-rejected': 'A API TOConline rejeitou a criação do rascunho. Nenhum documento foi finalizado.',
  'toconline-draft-api-invalid-response': 'A API TOConline devolveu uma resposta inesperada. Nenhum documento foi finalizado.',
  'toconline-draft-unexpectedly-finalized': 'A API devolveu inesperadamente um documento finalizado. O teste foi interrompido imediatamente.',
  'draft-cleanup-required': 'O rascunho foi criado, mas a limpeza automática não ficou confirmada. Não repita o teste; confirme o rascunho no TOConline.',
  'draft-test-failed': 'O teste real da API não foi concluído. Nenhum pedido de finalização foi efetuado.',
};

const tocMissingNames = {
  clientId: 'TOCONLINE_OAUTH_CLIENT_ID',
  clientSecret: 'TOCONLINE_OAUTH_CLIENT_SECRET',
  oauthUrl: 'TOCONLINE_OAUTH_URL',
  apiUrl: 'TOCONLINE_API_URL',
  sessionKey: 'TOCONLINE_SESSION_KEY',
  redirectUrl: 'TOCONLINE_REDIRECT_URL',
};

const connectionFailures = {
  state: ['A confirmação de segurança da autorização expirou ou não corresponde a este navegador. Inicie novamente a autorização neste separador.', 'The authorization security check expired or does not match this browser. Start authorization again in this tab.'],
  code: ['O TOConline não devolveu o código de autorização. Tente autorizar novamente a ligação.', 'TOConline did not return an authorization code. Try authorizing the connection again.'],
  credentials: ['O TOConline recusou as credenciais da integração. É necessário verificar a configuração OAuth no servidor.', 'TOConline rejected the integration credentials. The server OAuth configuration needs to be checked.'],
  provider: ['O TOConline recusou a troca do código de autorização. É necessário verificar a configuração OAuth e o endereço de retorno.', 'TOConline rejected the authorization code exchange. Check the OAuth configuration and callback address.'],
  network: ['Não foi possível contactar o serviço de autorização do TOConline. Tente novamente.', 'The TOConline authorization service could not be reached. Try again.'],
  'provider-response': ['O TOConline devolveu uma resposta de autorização incompleta ou inválida. A ligação não foi concluída.', 'TOConline returned an incomplete or invalid authorization response. The connection was not completed.'],
  'firebase-identity': ['Não foi possível autenticar a conta de serviço Google Cloud. É necessário verificar o segredo FIREBASE_PAYMENTS_SERVICE_ACCOUNT no Cloudflare.', 'The Google Cloud service account could not be authenticated. Check the FIREBASE_PAYMENTS_SERVICE_ACCOUNT secret in Cloudflare.'],
  'firebase-json': ['O valor guardado em FIREBASE_PAYMENTS_SERVICE_ACCOUNT não é um JSON válido. É necessário colar o conteúdo completo do ficheiro no segredo Cloudflare.', 'The FIREBASE_PAYMENTS_SERVICE_ACCOUNT value is not valid JSON. Paste the complete file contents into the Cloudflare secret.'],
  'firebase-account': ['O JSON guardado no Cloudflare não corresponde a uma conta de serviço do projeto Firebase configurado no servidor.', 'The JSON stored in Cloudflare does not match a service account for the server Firebase project.'],
  'firebase-key': ['Não foi possível ler a chave privada do JSON guardado no Cloudflare. Verifique se o ficheiro foi copiado integralmente, sem alterar a formatação.', 'The private key in the JSON stored in Cloudflare could not be read. Check that the complete file was copied without changing its formatting.'],
  'firebase-signing': ['O servidor não conseguiu assinar o pedido de autenticação Google Cloud. É necessário verificar a compatibilidade da chave com o servidor.', 'The server could not sign the Google Cloud authentication request. Key compatibility with the server needs to be checked.'],
  'firebase-network': ['O servidor não conseguiu contactar o serviço de autenticação Google. Tente atualizar a página.', 'The server could not reach the Google authentication service. Try refreshing the page.'],
  'firebase-signature': ['O Google recusou a assinatura da chave. É necessário verificar se a chave pertence à conta de serviço indicada e continua ativa.', 'Google rejected the key signature. Check that the key belongs to the specified service account and is still active.'],
  'firebase-clock': ['O Google recusou a validade temporal do pedido de autenticação. É necessário verificar a hora e a duração do pedido no servidor.', 'Google rejected the authentication request time validity. Check the server clock and request lifetime.'],
  'firebase-token': ['O Google recusou o pedido de autenticação da conta de serviço. É necessário verificar o estado da conta e da chave no Google Cloud.', 'Google rejected the service account authentication request. Check the account and key status in Google Cloud.'],
  'firebase-response': ['A resposta do serviço de autenticação Google não tinha o formato esperado. A ligação não foi concluída.', 'The Google authentication response did not have the expected format. The connection was not completed.'],
  'firebase-permissions': ['O Firestore recusou o acesso à sessão segura. É necessário verificar o papel atribuído à conta de serviço de pagamentos no Google Cloud.', 'Firestore refused access to the secure session. Check the role assigned to the payments service account in Google Cloud.'],
  'firebase-storage': ['Não foi possível aceder à sessão segura no Firestore. É necessário verificar a disponibilidade e a configuração do armazenamento.', 'The secure session could not be accessed in Firestore. Check storage availability and configuration.'],
  'server-session': ['Não foi possível guardar a sessão segura no servidor. A ligação não foi concluída.', 'The secure session could not be saved on the server. The connection was not completed.'],
  configuration: ['A configuração da ligação TOConline no servidor está incompleta ou inválida.', 'The server TOConline connection configuration is incomplete or invalid.'],
  authorization: ['Não foi possível concluir a autorização TOConline. Tente novamente para obter o diagnóstico atualizado.', 'TOConline authorization could not be completed. Try again to obtain an updated diagnosis.'],
};

export default function ToconlineReceiptTestPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const callbackError = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('toconline') !== 'error') return '';
    const reason = params.get('toconline_reason');
    const text = Object.prototype.hasOwnProperty.call(connectionFailures, reason)
      ? connectionFailures[reason] : connectionFailures.authorization;
    return text[en ? 1 : 0];
  }, [en]);
  const [config, setConfig] = useState(null);
  const [tocConfig, setTocConfig] = useState(null);
  const setupReason = tocConfig?.backgroundAutomation?.setupError;
  const setupError = setupReason
    ? (Object.prototype.hasOwnProperty.call(connectionFailures, setupReason)
      ? connectionFailures[setupReason] : connectionFailures['server-session'])[en ? 1 : 0]
    : '';
  const [tocResources, setTocResources] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState(null);
  const [dateByOrder, setDateByOrder] = useState({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draftApiTestByOrder, setDraftApiTestByOrder] = useState({});

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
      const date = dateByOrder[order.id] || order.rehearsal?.date || today;
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

  function runDraftApiTest(order) {
    const ok = window.confirm(t(
      'Este teste cria um rascunho real no TOConline, adiciona a linha de 95 € e elimina o rascunho sem o finalizar. Não será emitida Fatura-recibo fiscal. Pretende continuar?',
      'This test creates a real TOConline draft, adds the EUR 95 line, then deletes the draft without finalizing it. No fiscal invoice-receipt will be issued. Continue?'
    ));
    if (!ok) return;
    run(async () => {
      const data = await call(`/api/fiscal/toconline/draft-test/sessions/${session.id}/orders/${order.id}`, '', {
        confirmation: 'TESTAR API SEM FINALIZAR',
      });
      setDraftApiTestByOrder(current => ({ ...current, [order.id]: data.test }));
      setMessage(t(
        'Teste real da API concluído: cabeçalho e linha aceites em rascunho e rascunho eliminado. Nenhum documento foi finalizado.',
        'Real API test completed: draft header and line accepted, then draft deleted. No document was finalized.'
      ));
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
      <p>{t('Este ensaio prepara os dados para Fatura-recibo de pagamentos de teste confirmados. A preparação e a simulação não chamam o TOConline, não comunicam à AT e não enviam emails. A ligação OAuth, separada, permite apenas consultar a configuração. A aceitação do documento pela API real ainda não foi testada.', 'This rehearsal prepares invoice-receipt data for confirmed test payments. Preparation and simulation do not call TOConline, communicate with the tax authority or send emails. The separate OAuth connection only reads configuration. Acceptance by the real API remains untested.')}</p>
    </section>

    {config && <p className="sandbox-checkout__muted"><strong>TOConline:</strong> {config.liveWritesEnabled ? t('escritas ativas', 'writes enabled') : t('escritas reais bloqueadas neste módulo', 'real writes blocked in this module')} · OAuth scope futuro: <code>{config.scopeRequired}</code></p>}

    <LivePaymentSetupDiagnostics user={user} en={en} />

    <section className="sandbox-checkout__panel">
      <h2>{t('Ligação TOConline — apenas leitura', 'TOConline connection — read only')}</h2>
      {(setupError || (callbackError && !tocConfig?.connected)) && <p className="sandbox-checkout__error" role="alert">{setupError || callbackError}</p>}
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
        <p><strong>{t('Automação de faturação no servidor', 'Server billing automation')}:</strong> {
          tocConfig.backgroundAutomation?.serviceIdentityConfigured
            ? (tocConfig.backgroundAutomation?.sessionStored
              ? t('sessão segura disponível', 'secure session available')
              : t('identidade configurada, falta renovar a autorização TOConline para guardar a sessão', 'identity configured; re-authorize TOConline to store the session'))
            : t('falta a identidade Firebase de pagamentos', 'Firebase payments identity is not configured')
        }</p>
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
      const check = r ? inspectCIRC27Rehearsal(r, tocResources) : null;
      const servicesConfirmed = Boolean(check?.serviceChecks?.length) && check.serviceChecks.every(item => item.ok);
      const seriesConfirmed = Boolean(check?.seriesFound && check?.seriesInPayload && CIRC2027_SERIES_AT_COMMUNICATION_CONFIRMED);
      const billingBank = tocResources?.resources?.billingBankAccount;
      const bankConfirmed = order.method !== 'bank_transfer' || (billingBank?.source === 'company_bank_accounts'
        && billingBank?.ok === true && billingBank?.status === 'matched' && billingBank?.account?.id);
      const visibleBlockers = (r?.blockers || []).filter(item => {
        if (item === 'document-series-required') return !seriesConfirmed;
        if (item === 'services-must-exist' || item === 'vat-or-exemption-configuration-required') return !servicesConfirmed;
        return true;
      });
      const visibleWarnings = (r?.warnings || []).filter(item => item !== 'bank-account-mapping-may-be-required' || !bankConfirmed);
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
          {r?.status === 'prepared' && <button type="button" disabled={busy || r.fiscalPolicyVersion !== CIRC27_FISCAL_POLICY_VERSION} onClick={() => issue(order)}>{t('Simular emissão sem efeito fiscal', 'Simulate issue with no fiscal effect')}</button>}
          {r && <button type="button" className="secondary" disabled={busy} onClick={() => reset(order)}>{t('Repor este ensaio', 'Reset this rehearsal')}</button>}
          {r?.status === 'simulated-issued' && order.method === 'bank_transfer' && order.amountCents === 9500 && tocConfig?.connected && (
            <button type="button" disabled={busy} onClick={() => runDraftApiTest(order)}>
              {t('Testar API real sem finalizar', 'Test real API without finalizing')}
            </button>
          )}
        </div>

        {r && <>
          <h3>{t('Estado do ensaio', 'Rehearsal status')}</h3>
          <p><strong>{r.status === 'simulated-issued' ? t('Emissão simulada concluída', 'Simulated issue completed') : t('Preparado para simulação', 'Prepared for simulation')}</strong></p>
          <p>{t('Meio de pagamento TOConline identificado', 'Mapped TOConline payment method')}: <strong>{r.payment.code || t('por definir', 'not yet defined')}</strong> — {r.payment.label}</p>

          <CircFiscalRehearsalDiagnostics rehearsal={r} resources={tocResources} en={en} />
          {visibleBlockers.length > 0 && <details open><summary><strong>{t('Configuração que falta antes de ligar a API real', 'Configuration required before enabling the real API')}</strong></summary>
            <ul>{visibleBlockers.map(item => <li key={item}>{blockerText[item] || item}</li>)}</ul>
          </details>}
          {visibleWarnings.length > 0 && <details><summary>{t('Notas técnicas', 'Technical notes')}</summary><ul>{visibleWarnings.map(item => <li key={item}>{warningText[item] || item}</li>)}</ul></details>}

          <details><summary>{t('Pré-visualizar payload do documento de venda', 'Preview sales-document payload')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.salesDocument, null, 2)}</pre>
          </details>
          {r.receipt && <details><summary>{t('Pré-visualizar payload do recibo', 'Preview receipt payload')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.receipt, null, 2)}</pre>
          </details>}
          {draftApiTestByOrder[order.id] && <div className="sandbox-checkout__confirmed">
            <h3>{t('Teste real da API — rascunho eliminado', 'Real API test — draft deleted')}</h3>
            <p><strong>{t('Cabeçalho aceite', 'Header accepted')}:</strong> {draftApiTestByOrder[order.id].headerAccepted ? t('sim', 'yes') : t('não', 'no')}</p>
            <p><strong>{t('Linha aceite', 'Line accepted')}:</strong> {draftApiTestByOrder[order.id].lineAccepted ? t('sim', 'yes') : t('não', 'no')}</p>
            <p><strong>{t('Finalizado', 'Finalized')}:</strong> {draftApiTestByOrder[order.id].finalized ? t('sim', 'yes') : t('não', 'no')}</p>
            <p><strong>{t('Documento fiscal emitido', 'Fiscal document issued')}:</strong> {draftApiTestByOrder[order.id].fiscalDocumentIssued ? t('sim', 'yes') : t('não', 'no')}</p>
            <p><strong>{t('Limpeza', 'Cleanup')}:</strong> {draftApiTestByOrder[order.id].cleanup?.documentDeleted ? t('rascunho eliminado', 'draft deleted') : t('por confirmar', 'pending')}</p>
            <p><strong>{t('IVA devolvido pela linha', 'Tax returned for line')}:</strong> {draftApiTestByOrder[order.id].returnedTaxCode || '—'}{draftApiTestByOrder[order.id].returnedTaxPercentage != null ? ` · ${draftApiTestByOrder[order.id].returnedTaxPercentage}%` : ''}</p>
          </div>}

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
