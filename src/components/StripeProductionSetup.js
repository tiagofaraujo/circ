import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const webhookPath = '/api/payments/stripe/live/notifications';
const apiVersion = '2026-09-30.endive';
const events = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];
const booleanFields = ['ready', 'apiKeyPresent', 'liveKeyValid', 'webhookKeyPresent', 'serviceAccountPresent'];

// Only the documented presence/format fields belong in this view. Never render
// arbitrary diagnostic properties, response bodies or credential values.
function readStripe(value) {
  if (!value || !booleanFields.every(key => typeof value[key] === 'boolean')
    || value.webhookPath !== webhookPath
    || typeof value.apiVersion !== 'string'
    || !/^20\d{2}-\d{2}-\d{2}\.[a-zA-Z0-9_-]{1,40}$/.test(value.apiVersion)) return null;
  return {
    ...Object.fromEntries(booleanFields.map(key => [key, value[key]])),
    apiVersion: value.apiVersion,
    liveEnabled: typeof value.liveEnabled === 'boolean' ? value.liveEnabled : undefined,
    validationOnly: typeof value.validationOnly === 'boolean' ? value.validationOnly : undefined,
  };
}

// An explicit diagnostics prop shares the billing page's authenticated read.
// Without it, this component performs its own read when mounted.
export default function StripeProductionSetup({ diagnostics }) {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const allowed = isAdmin === true && Boolean(user?.uid) && typeof user?.getIdToken === 'function';
  const session = useRef(null);
  const [stripe, setStripe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(active) {
    if (!allowed || !active || active.cancelled || active.busy) return;
    active.busy = true;
    setBusy(true); setStripe(null); setFailed(false);
    try {
      const token = await user.getIdToken();
      if (active.cancelled || session.current !== active) return;
      const response = await fetch('/api/checkout/live/diagnostics', {
        method: 'GET', cache: 'no-store', signal: active.controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('diagnostics-unavailable');
      const data = await response.json();
      const next = readStripe(data?.stripe);
      if (!next) throw new Error('invalid-diagnostics');
      if (!active.cancelled && session.current === active) setStripe(next);
    } catch (_) {
      if (!active.cancelled && session.current === active) setFailed(true);
    } finally {
      if (!active.cancelled && session.current === active) {
        active.busy = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    const active = { cancelled: false, busy: false, controller: new AbortController() };
    session.current = active;
    setStripe(allowed ? readStripe(diagnostics) : null);
    setFailed(allowed && diagnostics !== undefined && !readStripe(diagnostics));
    setBusy(false);
    if (allowed && diagnostics === undefined) load(active);
    return () => { active.cancelled = true; active.controller.abort(); };
    // A new account or parent read replaces and aborts the preceding read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, allowed, diagnostics]);

  if (!allowed) return null;

  const ready = stripe?.ready === true && stripe.apiKeyPresent && stripe.liveKeyValid
    && stripe.webhookKeyPresent && stripe.serviceAccountPresent && stripe.apiVersion === apiVersion;
  const checks = stripe && [
    ['STRIPE_LIVE_SECRET_KEY', stripe.apiKeyPresent],
    [t('Formato de chave de produção', 'Live key format'), stripe.liveKeyValid],
    ['STRIPE_LIVE_WEBHOOK_SECRET', stripe.webhookKeyPresent],
    [t('Conta de serviço de pagamentos', 'Payments service account'), stripe.serviceAccountPresent],
  ];

  return <section aria-labelledby="billing-stripe-title" className="admin-billing__panel">
    <h2 id="billing-stripe-title">{t('Stripe · cartões e carteiras digitais', 'Stripe · cards and digital wallets')}</h2>
    <p>{t('O Stripe Checkout permite pagar com Visa e Mastercard. Apple Pay e Google Pay são apresentados quando disponíveis para a conta, o navegador e o dispositivo do participante.', 'Stripe Checkout supports Visa and Mastercard. Apple Pay and Google Pay appear when available for the account and the participant’s browser and device.')}</p>
    <p>{t('Este diagnóstico verifica apenas a presença e o formato das configurações no servidor. Não valida a chave junto da Stripe, a aprovação da conta nem a entrega de notificações. Os valores dos segredos não são apresentados.', 'This diagnostic only checks server setting presence and format. It does not validate the key with Stripe, account approval or notification delivery. Secret values are never displayed.')}</p>
    {stripe && <>
      <p><strong>{ready ? t('Configuração técnica presente', 'Technical configuration present') : t('Configuração Stripe incompleta', 'Stripe configuration incomplete')}</strong></p>
      <dl className="admin-billing__resources">{checks.map(([label, present]) => <div key={label}><dt>{label}</dt><dd>{present ? t('Presente', 'Present') : t('Em falta ou formato inválido', 'Missing or invalid format')}</dd></div>)}</dl>
      <p>{t('Versão API indicada pelo servidor', 'API version reported by the server')}: <code>{stripe.apiVersion}</code>{stripe.apiVersion !== apiVersion && <> · {t('Configurar a versão esperada abaixo.', 'Configure the expected version below.')}</>}</p>
      <p>{stripe.liveEnabled === false ? t('Pagamentos Stripe desativados no servidor.', 'Stripe payments are disabled on the server.')
        : stripe.liveEnabled === true && stripe.validationOnly === true ? t('Pagamentos reais limitados a contas autorizadas para validação.', 'Real payments are limited to accounts authorized for validation.')
          : stripe.liveEnabled === true && stripe.validationOnly === false ? t('Permissão de pagamentos Stripe ativa no servidor.', 'Stripe payment permission is enabled on the server.')
            : t('Ativação dos pagamentos Stripe por confirmar.', 'Stripe payment activation is unconfirmed.')}</p>
    </>}
    {failed && <p role="alert">{t('Não foi possível obter o diagnóstico Stripe atual. Atualize a consulta.', 'The current Stripe diagnostic is unavailable. Refresh the query.')}</p>}
    <div className="admin-billing__actions"><button type="button" disabled={busy} onClick={() => load(session.current)}>{busy ? t('A consultar Stripe…', 'Loading Stripe…') : t('Atualizar diagnóstico Stripe', 'Refresh Stripe diagnostic')}</button></div>

    <details><summary>{t('Configurar Stripe em produção', 'Configure live Stripe')}</summary>
      <ol>
        <li>{t('No Dashboard Stripe, confirme o modo de produção e crie uma chave restrita. Permissões necessárias: Checkout Sessions — escrita; PaymentIntents — leitura; PaymentMethods — leitura. Mantenha os restantes recursos sem acesso. Confirme eventuais permissões em falta nos registos de pedidos da Stripe.', 'In the Stripe Dashboard, confirm live mode and create a restricted key. Required permissions: Checkout Sessions — write; PaymentIntents — read; PaymentMethods — read. Leave other resources without access. Confirm any missing permissions in Stripe request logs.')} <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer">{t('Chaves API Stripe', 'Stripe API keys')}</a>.</li>
        <li>{t('No Worker de produção da Cloudflare, adicione a chave diretamente em Secrets com o nome', 'In the production Cloudflare Worker, add the key directly in Secrets named')} <code>STRIPE_LIVE_SECRET_KEY</code>. {t('Mantenha os valores apenas na Stripe e nos Secrets da Cloudflare.', 'Keep values only in Stripe and Cloudflare Secrets.')}</li>
        <li>{t('Nos Webhooks do Workbench, crie um destino da sua conta (Your account), formato Snapshot e versão API', 'In Workbench Webhooks, create a destination for Your account, using Snapshot format and API version')} <code>{apiVersion}</code>. <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer">{t('Webhooks Stripe', 'Stripe webhooks')}</a>.
          <p>{t('URL do endpoint', 'Endpoint URL')}: <code>https://circ-coimbra.org{webhookPath}</code></p>
          <p>{t('Eventos a selecionar', 'Events to select')}:</p><ul>{events.map(event => <li key={event}><code>{event}</code></li>)}</ul>
        </li>
        <li>{t('Guarde o segredo de assinatura desse endpoint diretamente nos Secrets da Cloudflare com o nome', 'Store that endpoint’s signing secret directly in Cloudflare Secrets named')} <code>STRIPE_LIVE_WEBHOOK_SECRET</code>. {t('Depois atualize o diagnóstico. Esta consulta não altera a ativação dos pagamentos.', 'Then refresh the diagnostic. This query does not change payment activation.')}</li>
      </ol>
    </details>
  </section>;
}
