import React, { useState } from 'react';
import { CopyTransferField } from '../components/BankTransferDetails';

export const stripeMessages = {
  'stripe/authentication': ['A Stripe recusou a chave. Verifique o segredo de teste na Cloudflare.', 'Stripe rejected the key. Check the test secret in Cloudflare.'],
  'stripe/permissions': ['A Stripe recusou as permissões. Verifique Checkout Sessions → Escrever; não atribua acesso total.', 'Stripe denied access. Check Checkout Sessions → Write; do not grant full access.'],
  'stripe/request-rejected': ['A Stripe rejeitou a criação. Consulte os registos da API na sandbox para identificar o parâmetro recusado, sem partilhar chaves.', 'Stripe rejected creation. Check the sandbox API logs for the rejected parameter without sharing keys.'],
  'stripe/test-key-required': ['Só é aceite uma chave rk_test_ ou sk_test_. Não use chaves de produção.', 'Only rk_test_ or sk_test_ keys are accepted. Do not use live keys.'],
  'stripe/mismatch': ['A sessão Stripe não corresponde a este pedido. Nenhum pagamento foi confirmado.', 'The Stripe session does not match this request. No payment was confirmed.'],
  'stripe/session-not-found': ['Sessão não encontrada nesta sandbox Stripe. Verifique a conta e o identificador.', 'Session not found in this Stripe sandbox. Check the account and identifier.'],
};
export function StripeSandboxSetup({ config, busy, refresh, en }) {
  if (!config) return null;
  const t = (pt, english) => en ? english : pt;
  const state = yes => yes ? t('Presente', 'Present') : t('Em falta', 'Missing');
  return <details className="sandbox-checkout__panel" open={!config.ready}>
    <summary><strong>{t('Stripe — configuração dos cartões de teste', 'Stripe — test card configuration')}</strong></summary>
    <p>{t('Estes indicadores confirmam a configuração local, não a validade da chave na Stripe nem a entrega do webhook.', 'These indicators check local configuration, not Stripe key validity or webhook delivery.')}</p>
    <dl><dt>STRIPE_SANDBOX_SECRET_KEY</dt><dd>{state(config.apiKeyPresent)}{config.apiKeyPresent && !config.testKeyValid && t(' — formato de teste inválido', ' — invalid test key format')}</dd>
      <dt>STRIPE_SANDBOX_WEBHOOK_SECRET</dt><dd>{state(config.webhookKeyPresent)}</dd>
      <dt>{t('Gravação no servidor', 'Server storage identity')}</dt><dd>{state(config.serviceAccountPresent)}</dd></dl>
    <CopyTransferField label={t('URL do webhook Stripe de teste', 'Stripe test webhook URL')}
      value="https://circ-coimbra.org/api/payments/stripe/sandbox/notifications" en={en} />
    <p>{t('Na mesma sandbox Stripe, configure eventos da sua conta: checkout.session.completed e checkout.session.expired, em formato snapshot. Guarde o segredo whsec_ na Cloudflare como STRIPE_SANDBOX_WEBHOOK_SECRET. Não partilhe chaves no chat.', 'In the same Stripe sandbox, configure events from your account: checkout.session.completed and checkout.session.expired, in snapshot format. Save the whsec_ secret in Cloudflare as STRIPE_SANDBOX_WEBHOOK_SECRET. Do not share keys in chat.')}</p>
    <button type="button" className="secondary" disabled={busy} onClick={refresh}>{t('Atualizar configuração Stripe', 'Refresh Stripe configuration')}</button>
  </details>;
}
function checkoutLink(stripe) {
  if (!/^cs_test_[A-Za-z0-9]{8,240}$/.test(stripe?.id || '')) return null;
  try {
    const u = new URL(stripe.url);
    return u.origin === 'https://checkout.stripe.com' && !u.username && !u.password
      && [`/c/pay/${stripe.id}`, `/pay/${stripe.id}`].includes(u.pathname) ? stripe.url : null;
  } catch { return null; }
}
export default function SandboxStripePayment({ order, sessionId, en, api, run, busy, onUpdate }) {
  const [reference, setReference] = useState('');
  const t = (pt, english) => en ? english : pt;
  const date = value => value ? new Date(value).toLocaleString(en ? 'en-GB' : 'pt-PT') : '—';
  const url = order.status === 'pending' && order.stripe?.status === 'open' ? checkoutLink(order.stripe) : null;
  const path = `sessions/${sessionId}/orders/${order.id}`;
  return <section aria-label={t('Cartão Stripe de teste', 'Stripe test card')}>
    <p><strong>{t('Use apenas cartões fictícios da Stripe. Não introduza um cartão pessoal.', 'Use Stripe test cards only. Do not enter a personal card.')}</strong></p>
    <dl><dt>{t('Sessão Stripe', 'Stripe session')}</dt><dd>{order.reference || t('Criação por confirmar', 'Creation unconfirmed')}</dd>
      <dt>{t('Identificador do pedido', 'Order identifier')}</dt><dd>{order.identifier}</dd>
      {order.creationDiagnostic && <><dt>{t('Diagnóstico', 'Diagnostic')}</dt><dd>{order.creationDiagnostic}</dd></>}
      {order.stripe && <><dt>{t('Estado Stripe', 'Stripe state')}</dt><dd>{order.stripe.status} · {order.stripe.paymentStatus}</dd></>}
      {order.notification?.verifiedAt && <><dt>{t('Notificação validada', 'Validated notification')}</dt><dd>{date(order.notification.verifiedAt)}</dd><dt>{t('Pagamento Stripe', 'Stripe payment')}</dt><dd>{order.notification.transactionId}</dd></>}
    </dl>
    {!order.notification?.verifiedAt && <p>{t('Voltar do Checkout ou consultar o estado não confirma a inscrição. A confirmação depende da notificação validada pelo servidor.', 'Returning from Checkout or inspecting status does not confirm registration. Confirmation requires a server-validated notification.')}</p>}
    {url && <p><a href={url} className="my-circ-button" referrerPolicy="no-referrer">{t('Pagar na Stripe — teste', 'Pay with Stripe — test')}</a></p>}
    {order.reference && <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => onUpdate((await api(`${path}/inspect`, {})).session))}>{t('Consultar estado na Stripe', 'Inspect Stripe status')}</button>}
    {!order.reference && ['creating', 'creation_unknown'].includes(order.status) && <form onSubmit={event => {
      event.preventDefault(); run(async () => onUpdate((await api(`${path}/recover`, { reference })).session));
    }}><p>{t('Não crie outro pagamento. Procure a sessão pelo identificador nos registos Stripe e recupere o ID cs_test_ correspondente.', 'Do not create another payment. Find the session by order identifier in Stripe and recover the matching cs_test_ ID.')}</p>
      <label>{t('ID da sessão Stripe a recuperar', 'Stripe session ID to recover')}<input value={reference} onChange={e => setReference(e.target.value)} pattern="cs_test_[A-Za-z0-9]{8,240}" maxLength="248" required /></label>
      <button type="submit" disabled={busy}>{t('Recuperar sessão sem criar outro pagamento', 'Recover session without another payment')}</button>
    </form>}
  </section>;
}
