import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import StripeProductionSetup from '../components/StripeProductionSetup';
import '../admin.css';
import './AdminBillingPage.css';

const resources = [
  ['series', 'Séries de fatura-recibo', 'Invoice-receipt series'],
  ['services', 'Serviços', 'Services'], ['taxes', 'Taxas de IVA', 'VAT rates'],
  ['exemptions', 'Motivos de isenção', 'Exemption reasons'],
  ['bankAccounts', 'Contas bancárias', 'Bank accounts'],
  ['units', 'Unidades', 'Units'], ['currencies', 'Moedas', 'Currencies'],
];

export default function AdminBillingPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { search } = useLocation();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const controller = useRef(null);
  const [config, setConfig] = useState(null);
  const [payments, setPayments] = useState(null);
  const [currentRead, setCurrentRead] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function api(path, body, signal = controller.current?.signal) {
    const token = await user.getIdToken();
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
      signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'service-unavailable');
    return data;
  }

  function errorText(issue) {
    if (['toconline-not-connected', 'toconline-reauthorize-required', 'toconline-background-session-missing'].includes(issue?.message)) {
      return t('É necessário renovar a ligação TOConline.', 'The TOConline connection needs to be renewed.');
    }
    if (['admin-required', 'verified-email-required'].includes(issue?.message)) {
      return t('Esta consulta requer a conta de administração com email verificado.', 'This page requires a verified administrator account.');
    }
    return t('Não foi possível concluir a consulta. Atualize a configuração ou renove a ligação TOConline.', 'The request could not be completed. Refresh the settings or renew the TOConline connection.');
  }

  async function load(signal = controller.current?.signal) {
    const results = await Promise.allSettled([
      api('/api/fiscal/toconline/config', undefined, signal), api('/api/checkout/live/diagnostics', undefined, signal),
    ]);
    if (signal.aborted) return;
    const [toc, live] = results;
    setConfig(toc.status === 'fulfilled' ? toc.value : null);
    setPayments(live.status === 'fulfilled' ? live.value : null);
    if (toc.status === 'rejected' || live.status === 'rejected') setError(errorText(toc.reason || live.reason));
    if (toc.status === 'fulfilled' && toc.value.connected) {
      try {
        const read = await api('/api/fiscal/toconline/resources', undefined, signal);
        if (!signal.aborted) setCurrentRead(read);
      } catch (issue) { if (!signal.aborted) setError(errorText(issue)); }
    } else setCurrentRead(null);
  }

  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setConfig(null); setPayments(null); setCurrentRead(null); setError(''); setMessage(''); setBusy(true);
    load(active.signal).finally(() => { if (!active.signal.aborted) setBusy(false); });
    return () => active.abort();
    // Each authenticated session owns its requests, including effect replays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  async function run(operation) {
    if (busy) return;
    const signal = controller.current?.signal;
    setBusy(true); setError(''); setMessage('');
    try { await operation(); }
    catch (issue) { if (!signal.aborted) setError(errorText(issue)); }
    finally { if (!signal.aborted) setBusy(false); }
  }

  const callbackError = new URLSearchParams(search).get('toconline') === 'error';
  const paymentChecks = Object.entries(payments?.checks || {}).filter(([name]) => !name.startsWith('STRIPE_'));
  const missing = paymentChecks.filter(([, present]) => present !== true).map(([name]) => name);
  const paymentsReady = payments?.liveCheckoutEnabled === true && !payments.privatePilot
    && payments.channelMatchesExpected === true && paymentChecks.length > 0 && missing.length === 0;

  return <main className="admin-page admin-billing">
    <AdminModuleNav />
    <header className="admin-billing__header"><p>My CIRC · {t('Administração', 'Administration')}</p>
      <h1>{t('Faturação', 'Invoicing')}</h1>
      <p>{t('Ligação aos serviços de pagamento e faturação. As faturas-recibo emitidas ficam disponíveis na inscrição do participante.', 'Payment and invoicing service connections. Issued invoice-receipts are available in the participant registration.')}</p>
    </header>

    <section aria-labelledby="billing-payments-title" className="admin-billing__panel">
      <h2 id="billing-payments-title">{t('Pagamentos', 'Payments')}</h2>
      {payments && <>
        <p><strong>{paymentsReady ? t('Receção de pagamentos ativa', 'Payment collection enabled') : t('Checkout público indisponível', 'Public checkout unavailable')}</strong></p>
        <p>{t('Canal EuPago', 'EuPago channel')}: {payments.channelMatchesExpected ? 'CIRC 2027' : t('Configuração por confirmar', 'Configuration unconfirmed')}</p>
        {missing.length ? <><p>{t('Configurações em falta no servidor:', 'Missing server settings:')}</p><ul>{missing.map(name => <li key={name}><code>{name}</code></li>)}</ul></> : <p>{t('As configurações necessárias estão presentes no servidor.', 'The required server settings are present.')}</p>}
        <p>{t('Esta leitura verifica a configuração técnica. A presença das chaves não confirma a sua validade no prestador nem a entrega das notificações.', 'This read checks the technical configuration. The presence of keys does not verify their validity with the provider or notification delivery.')}</p>
      </>}
      <Link to="/admin">{t('Consultar inscrições e pagamentos', 'View registrations and payments')}</Link>
    </section>

    {payments && <StripeProductionSetup diagnostics={payments.stripe || null} />}

    <section aria-labelledby="billing-toconline-title" className="admin-billing__panel">
      <h2 id="billing-toconline-title">{t('Ligação TOConline', 'TOConline connection')}</h2>
      <p>{t('A consulta de configuração utiliza apenas leitura. Não cria nem altera documentos fiscais.', 'The configuration query is read-only. It does not create or change fiscal documents.')}</p>
      {callbackError && !config?.connected && <p role="alert">{t('A autorização TOConline não foi concluída. Tente renovar a ligação.', 'TOConline authorization did not complete. Try renewing the connection.')}</p>}
      {config && <>
        <p><strong>{config.connected ? t('Ligação ativa neste navegador', 'Connection active in this browser') : t('Ligação do navegador por autorizar', 'Browser connection requires authorization')}</strong></p>
        <p>{t('Faturação automática no servidor', 'Server billing automation')}: <strong>{config.backgroundAutomation?.sessionStored ? t('sessão segura disponível', 'secure session available') : t('autorização por concluir', 'authorization required')}</strong></p>
        {!config.configured && <p role="alert">{t('A configuração TOConline do servidor está incompleta.', 'The server TOConline configuration is incomplete.')}</p>}
        {config.configured && <div className="admin-billing__actions">
          <button type="button" disabled={busy} onClick={() => run(async () => {
            const data = await api('/api/fiscal/toconline/authorize', {});
            if (!data.authorizationUrl || !/^https:\/\//.test(data.authorizationUrl)) throw new Error('invalid-response');
            window.location.assign(data.authorizationUrl);
          })}>{config.connected ? t('Renovar autorização TOConline', 'Renew TOConline authorization') : t('Ligar TOConline', 'Connect TOConline')}</button>
          {config.connected && <button type="button" disabled={busy} onClick={() => run(async () => {
            await api('/api/fiscal/toconline/disconnect', {});
            setCurrentRead(null); setConfig(current => ({ ...current, connected: false }));
            setMessage(t('Ligação terminada neste navegador. A sessão de faturação do servidor mantém-se ativa.', 'Browser connection ended. The server billing session remains active.'));
          })}>{t('Terminar ligação neste navegador', 'Disconnect this browser')}</button>}
        </div>}
      </>}
      {currentRead && <>
        <p>{t('Última consulta', 'Last read')}: {new Date(currentRead.fetchedAt).toLocaleString(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' })}</p>
        <dl className="admin-billing__resources">{resources.map(([key, pt, english]) => <div key={key}><dt>{t(pt, english)}</dt><dd>{currentRead.resources?.[key]?.ok ? `${currentRead.resources[key].count} ${t('registos', 'records')}` : t('Consulta indisponível', 'Read unavailable')}</dd></div>)}</dl>
      </>}
    </section>

    <div className="admin-billing__actions"><button type="button" disabled={busy} onClick={() => run(load)}>{busy ? t('A consultar…', 'Loading…') : t('Atualizar configuração', 'Refresh settings')}</button></div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
