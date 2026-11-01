import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const stamp = value => /^[a-f0-9]{64}$/.test(value || '');
const rejectedBeforeCreation = new Set(['quote-changed', 'billing-preview-changed', 'billing-customer-unconfirmed', 'profile-incomplete',
  'sign-in-required', 'invalid-session', 'verified-email-required', 'registration-exists', 'registration-not-open', 'live-checkout-not-configured', 'live-scope-not-enabled', 'uls-not-verified', 'student-not-approved',
  'paid-registration-required', 'invalid-addition', 'course-already-owned', 'fiscal-pending']);
const states = { pending: ['A aguardar pagamento', 'Awaiting payment'], creating: ['Pedido em processamento', 'Order processing'],
  creation_unknown: ['Pedido por confirmar', 'Order needs checking'], creation_failed: ['Criação recusada — contacte a organização', 'Creation rejected — contact the organisers'],
  paid: ['Pagamento confirmado', 'Payment confirmed'], review_required: ['Pagamento em conferência pela organização', 'Payment under organiser review'],
  refunded: ['Reembolso registado', 'Refund recorded'], cancelled: ['Pedido cancelado', 'Order cancelled'] };
const messages = {
  'invalid-session': ['A sessão expirou. Volte a iniciar sessão antes de continuar.', 'Your session expired. Sign in again before continuing.'],
  'verified-email-required': ['Confirme primeiro o email da sua conta.', 'Verify your account email first.'],
  'billing-customer-unconfirmed': ['Complete no perfil os dados de faturação: nome, NIF português válido, morada, código postal, localidade e país Portugal.', 'Complete your billing profile: name, valid Portuguese tax number, address, postcode, city and Portugal as country.'],
  'profile-incomplete': ['Complete e guarde o seu nome no perfil.', 'Complete and save your name in your profile.'],
  'uls-not-verified': ['Valide primeiro a sua elegibilidade ULS Coimbra.', 'Verify ULS Coimbra eligibility first.'],
  'student-not-approved': ['Aguarde a aprovação da sua condição de estudante.', 'Wait for student eligibility approval.'],
  'registration-exists': ['Já existe uma inscrição nesta conta. Atualize a página para consultar o pagamento.', 'This account already has a registration. Refresh this page to view its payment.'],
  'live-checkout-not-configured': ['Os pagamentos estão temporariamente indisponíveis. Tente mais tarde ou contacte a organização.', 'Payments are temporarily unavailable. Try later or contact the organisers.'],
  'course-already-owned': ['Um dos cursos já está incluído na inscrição. Atualize a página antes de preparar outra compra.', 'One of these courses is already included in your registration. Refresh the page before preparing another purchase.'],
  'paid-registration-required': ['A compra de complementos exige uma inscrição confirmada e paga.', 'Supplement purchases require a confirmed, paid registration.'],
  'fiscal-pending': ['O documento da compra anterior ainda está em processamento. Consulte esse pedido antes de criar outro.', 'The previous purchase document is still being processed. Check that order before creating another one.'],
};

export default function PublicLiveCheckout({ user, selection, eligible, registration = null, kind = 'primary', en = false, onLock = () => {}, onNewPurchase = () => {} }) {
  const supplementary = kind === 'supplementary';
  const key = supplementary ? `circ-production-supplementary-order:${user.uid}` : `circ-production-order:${user.uid}`;
  const creationBlocked = !supplementary && Boolean(registration);
  const path = name => supplementary ? `/supplementary/${name}` : `/${name}`;
  const [id, setId] = useState('');
  const [order, setOrder] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const currentSelection = useRef('');
  const working = useRef(false);
  const active = useRef(true);
  const abort = useRef(null);
  const t = (pt, english) => en ? english : pt;
  const money = cents => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const selectionKey = JSON.stringify(selection);
  currentSelection.current = selectionKey;

  async function request(path, body, signal, existingToken) {
    const requestSignal = signal === null ? undefined : signal || abort.current?.signal;
    const token = existingToken || await user.getIdToken();
    const response = await fetch(`/api/checkout/live${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: requestSignal,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error('request-failed'), { code: result.error, status: response.status, order: result.order });
    return result;
  }
  function acceptOrder(value, expectedId = null) {
    if (!value || !UUID.test(value.id || '') || value.currency !== 'EUR' || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0
      || (expectedId && value.id !== expectedId) || (value.kind && value.kind !== kind)
      || (supplementary && value.kind !== 'supplementary')) throw new Error('invalid-order');
    setOrder(value); setId(value.id); onLock(true);
    try { localStorage.setItem(key, value.id); } catch { /* An existing server order remains recoverable. */ }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); abort.current = controller;
    async function recover() {
      setBusy(true); setError('');
      try {
        let saved = supplementary ? '' : registration?.payment?.orderId || '';
        try { saved = saved || localStorage.getItem(key) || ''; } catch {}
        if (saved && !UUID.test(saved)) throw new Error('invalid-order');
        if (saved || registration || supplementary) {
          const result = await request(saved ? `/orders/${saved}` : supplementary ? '/supplementary-order' : '/primary-order', undefined, controller.signal);
          if (active.current && !controller.signal.aborted) acceptOrder(result.order, saved || null);
        }
      } catch (issue) {
        if (supplementary && issue.status === 404 && issue.code === 'not-found') {
          // A browser may retain a completed slot after the server has released
          // it. Only a missing slot without a saved UUID permits a new review.
          let saved = '';
          try { saved = localStorage.getItem(key) || ''; } catch {}
          if (!saved) return;
        }
        if (active.current && !controller.signal.aborted) { setRecoveryBlocked(true); onLock(true); setError(t('Não foi possível recuperar o pedido existente. Não gere outro pagamento; contacte a organização.', 'The existing order could not be recovered. Do not generate another payment; contact the organisers.')); }
      } finally { if (active.current && !controller.signal.aborted) setBusy(false); }
    }
    recover();
    return () => { active.current = false; controller.abort(); };
    // Recovery runs once for the signed-in account and its registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registration?.id]);
  useEffect(() => { setPreview(null); setConfirmed(false); }, [selectionKey]);

  async function recoverSupplement(value) {
    setRecoveryBlocked(true); onLock(true); setPreview(null); setConfirmed(false);
    try {
      const existing = value || (await request('/supplementary-order')).order;
      if (active.current) { acceptOrder(existing); setRecoveryBlocked(false); }
    } catch {
      if (active.current) setError(t('Já existe um pedido de complementos. Atualize a página para o recuperar; não gere outro pagamento.', 'A supplement order already exists. Refresh this page to recover it; do not generate another payment.'));
    }
  }

  async function review() {
    if (working.current || busy || id || creationBlocked || recoveryBlocked || !eligible) return;
    working.current = true; setBusy(true); setError(''); setPreview(null); setConfirmed(false);
    try {
      const result = await request(path('quote'), { selection });
      if (!stamp(result.stamp) || !stamp(result.billingStamp) || !result.billing || !Number.isSafeInteger(result.quote?.amountCents)
        || result.quote.amountCents <= 0 || result.quote.currency !== 'EUR'
        || (supplementary && result.quote.kind !== 'supplementary')) throw new Error('invalid-preview');
      if (active.current && currentSelection.current === selectionKey) setPreview({ ...result, selectionKey });
    } catch (issue) {
      if (active.current && supplementary && issue.code === 'supplementary-order-exists') await recoverSupplement(issue.order);
      else if (active.current) setError(messages[issue.code]?.[en ? 1 : 0] || t('Não foi possível preparar o pagamento. Atualize a página ou contacte a organização.', 'Could not prepare payment. Refresh the page or contact the organisers.'));
    }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function create() {
    if (working.current || busy || id || creationBlocked || recoveryBlocked || !eligible || !confirmed || !preview || preview.selectionKey !== selectionKey) return;
    working.current = true; setBusy(true); setError(''); onLock(true);
    let orderId = '', sent = false;
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      orderId = crypto.randomUUID();
      localStorage.setItem(key, orderId);
      if (!UUID.test(orderId) || localStorage.getItem(key) !== orderId) throw new Error('storage-unavailable');
      setId(orderId); sent = true;
      // A newly saved registration can update the parent subscription while
      // this request is running. It must not abort the payment creation response.
      const result = await request(path('orders'), { id: orderId, selection, stamp: preview.stamp, billingStamp: preview.billingStamp, method: 'multibanco' }, null, token);
      if (active.current) acceptOrder(result.order, orderId);
    } catch (issue) {
      if (!active.current) return;
      if (supplementary && issue.code === 'supplementary-order-exists') {
        // The server refused creation before contacting the provider. Recover
        // its existing slot instead of displaying a second payable reference.
        if (orderId) try { localStorage.removeItem(key); } catch {}
        setId(''); await recoverSupplement(issue.order);
      } else if (!sent || rejectedBeforeCreation.has(issue.code)) {
        if (orderId) try { localStorage.removeItem(key); } catch {}
        setId(''); onLock(false); setPreview(null); setConfirmed(false);
        setError(messages[issue.code]?.[en ? 1 : 0] || t('O pagamento não foi criado. Reveja os dados antes de continuar.', 'Payment was not created. Review your details before continuing.'));
      } else setError(t('O pedido pode já existir. Consulte o estado abaixo e não gere outro pagamento.', 'The order may already exist. Check its status below and do not generate another payment.'));
    } finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function refresh(silent = false) {
    if (working.current || !UUID.test(id)) return;
    working.current = true; if (!silent) { setBusy(true); setError(''); }
    try { const result = await request(`/orders/${id}`); if (active.current) { acceptOrder(result.order, id); setError(''); } }
    catch { if (active.current) setError(t('Não foi possível atualizar o estado. Mantenha este pedido e contacte a organização.', 'Could not refresh status. Keep this order and contact the organisers.')); }
    finally { working.current = false; if (active.current && !silent) setBusy(false); }
  }
  useEffect(() => {
    if (!id || !order || ['cancelled', 'refunded', 'creation_failed'].includes(order.status)
      || (order.status === 'paid' && order.fiscalStatus === 'issued')) return undefined;
    const timer = setInterval(() => refresh(true), 5000);
    return () => clearInterval(timer);
    // Polling reads the existing order only; it never creates payments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order?.status, order?.fiscalStatus]);

  function newPurchase() {
    if (!supplementary || order?.status !== 'paid' || order.fiscalStatus !== 'issued' || working.current) return;
    try { localStorage.removeItem(key); } catch { setError(t('Não foi possível preparar outra compra neste navegador.', 'Could not prepare another purchase in this browser.')); return; }
    setId(''); setOrder(null); setPreview(null); setConfirmed(false); setRecoveryBlocked(false); setError('');
    onLock(false); onNewPurchase();
  }
  const customer = preview?.billing;
  return <section className="registration-checkout" aria-label={supplementary ? t('Pagamento do complemento', 'Supplement payment') : t('Pagamento da inscrição', 'Registration payment')} aria-busy={busy}>
    <h3>{t('Pagamento por Multibanco', 'Multibanco payment')}</h3>
    <p>{t('Beneficiário', 'Payee')}: Associação Hemisfério Disciplinado</p>
    {!id && !creationBlocked && <>
      <p>{supplementary ? t('Este complemento tem um pagamento e uma fatura-recibo próprios. A inscrição original mantém-se paga.', 'This supplement has its own payment and invoice-receipt. The original registration stays paid.') : t('A inscrição é confirmada automaticamente após o pagamento. A fatura-recibo ficará disponível no My CIRC após a emissão.', 'Registration is confirmed automatically after payment. The invoice-receipt will be available in My CIRC once issued.')}</p>
      <button type="button" className="button button--dark" disabled={busy || recoveryBlocked || !eligible} onClick={review}>{busy ? t('A consultar…', 'Loading…') : t('Rever valor e faturação', 'Review amount and billing')}</button>
      {customer && <div className="registration-invoice">
        <p><strong>{t('Valor a pagar:', 'Amount to pay:')} {money(preview.quote.amountCents)}</strong></p>
        <dl><dt>{t('Nome de faturação', 'Billing name')}</dt><dd>{customer.customer_business_name}</dd>
          <dt>NIF</dt><dd>{customer.customer_tax_registration_number}</dd><dt>{t('Morada', 'Address')}</dt><dd>{customer.customer_address_detail}</dd>
          <dt>{t('Código postal e localidade', 'Postcode and city')}</dt><dd>{customer.customer_postcode} · {customer.customer_city}</dd><dt>{t('País', 'Country')}</dt><dd>{customer.customer_country}</dd></dl>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /> {t('Conferi o valor e os dados de faturação e pretendo gerar a referência de pagamento.', 'I reviewed the amount and billing details and want to generate the payment reference.')}</label>
        <button type="button" className="button button--dark" onClick={create} disabled={busy || !confirmed || !eligible}>{t('Gerar referência Multibanco', 'Generate Multibanco reference')}</button>
      </div>}
    </>}
    {id && <>
      <p>{t('Pedido:', 'Order:')} <code>{id}</code></p>
      <button type="button" onClick={() => refresh()} disabled={busy}>{t('Atualizar estado do pagamento', 'Refresh payment status')}</button>
      <p>{t('Use este pedido até à sua conclusão. Uma resposta demorada não exige um novo pagamento.', 'Use this order until it is completed. A slow response does not require a new payment.')}</p>
    </>}
    {order && <div className="registration-invoice">
      <p role="status"><strong>{states[order.status]?.[en ? 1 : 0] || t('Estado em conferência', 'Status under review')}</strong></p>
      <p>{t('Valor:', 'Amount:')} {money(order.amountCents)}</p>
      {order.status === 'pending' && <dl><dt>{t('Entidade', 'Entity')}</dt><dd>{order.entity}</dd><dt>{t('Referência', 'Reference')}</dt><dd>{order.reference}</dd></dl>}
      {order.fiscalDocumentNo && <p>{t('Fatura-recibo:', 'Invoice-receipt:')} <strong>{order.fiscalDocumentNo}</strong></p>}
      {supplementary && order.status === 'paid' && order.fiscalStatus !== 'issued' && <p>{t('A faturação deste pedido ainda está em processamento. Aguarde a conclusão ou contacte a organização antes de preparar outro complemento.', 'This order invoice is still being processed. Wait for completion or contact the organisers before preparing another supplement.')}</p>}
      {supplementary && order.status === 'paid' && order.fiscalStatus === 'issued' && <button type="button" onClick={newPurchase} disabled={busy}>{t('Preparar nova compra', 'Prepare another purchase')}</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <Link to="/conta/perfil">{t('Rever dados de faturação no perfil', 'Review billing profile')}</Link>
  </section>;
}
