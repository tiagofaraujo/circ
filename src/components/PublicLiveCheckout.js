import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const stamp = value => /^[a-f0-9]{64}$/.test(value || '');
const knownMethods = ['multibanco', 'mbway', 'bank_transfer'];
const methodNames = { multibanco: ['Multibanco', 'Multibanco'], mbway: ['MB WAY', 'MB WAY'], bank_transfer: ['Transferência bancária', 'Bank transfer'] };
const normalizedPhone = value => String(value || '').replace(/[\s().-]/g, '').match(/^(?:(?:\+|00)?351)?(9\d{8})$/)?.[1] || '';
const canRetryOrder = order => order?.method === 'mbway' && ['expired', 'cancelled'].includes(order.status)
  && order.canRetry === true && !order.replacementOrderId && !order.paidAt && !order.fiscalDocumentId;
const retryConflicts = new Set(['registration-exists', 'replacement-required', 'idempotency-conflict', 'replacement-check-unavailable', 'replacement-not-closed']);
const rejectedBeforeCreation = new Set(['quote-changed', 'billing-preview-changed', 'billing-customer-unconfirmed', 'profile-incomplete',
  'sign-in-required', 'invalid-session', 'verified-email-required', 'registration-exists', 'registration-not-open', 'live-checkout-not-configured', 'live-scope-not-enabled', 'uls-not-verified', 'student-not-approved',
  'paid-registration-required', 'invalid-addition', 'course-already-owned', 'fiscal-pending', 'invalid-request', 'payment-method-unavailable']);
const states = { pending: ['A aguardar pagamento', 'Awaiting payment'], creating: ['Pedido em processamento', 'Order processing'],
  creation_unknown: ['Pedido por confirmar', 'Order needs checking'], creation_failed: ['Criação recusada — contacte a organização', 'Creation rejected — contact the organisers'],
  paid: ['Pagamento confirmado', 'Payment confirmed'], review_required: ['Pagamento em conferência pela organização', 'Payment under organiser review'],
  refunded: ['Reembolso registado', 'Refund recorded'], cancelled: ['Pedido cancelado', 'Order cancelled'], expired: ['Pedido MB WAY expirado', 'MB WAY request expired'] };
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
  'payment-method-unavailable': ['Este meio de pagamento não está disponível. Atualize a página para consultar as opções atuais.', 'This payment method is unavailable. Refresh the page to see the current options.'],
  'replacement-check-unavailable': ['Não foi criado um novo pagamento. Não foi possível confirmar o encerramento do pedido anterior. Consulte o estado deste pedido antes de tentar novamente.', 'No new payment was created. Closure of the previous request could not be confirmed. Check this order status before trying again.'],
  'replacement-not-closed': ['Não foi criado um novo pagamento. O pedido anterior está em conferência; aguarde a organização antes de efetuar outro pagamento.', 'No new payment was created. The previous request is under review; wait for the organisers before making another payment.'],
};

export default function PublicLiveCheckout({ user, selection, eligible, registration = null, kind = 'primary', en = false, onLock = () => {}, onNewPurchase = () => {} }) {
  const supplementary = kind === 'supplementary';
  const key = supplementary ? `circ-production-supplementary-order:${user.uid}` : `circ-production-order:${user.uid}`;
  const path = name => supplementary ? `/supplementary/${name}` : `/${name}`;
  const [id, setId] = useState('');
  const [order, setOrder] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [retrySource, setRetrySource] = useState('');
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('multibanco');
  const [phone, setPhone] = useState('');
  const [configBusy, setConfigBusy] = useState(true);
  const [configFailed, setConfigFailed] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [bankNote, setBankNote] = useState('');
  const [bankDeclared, setBankDeclared] = useState(false);
  const [bankReportNeedsRefresh, setBankReportNeedsRefresh] = useState(false);
  const bankReport = useRef(null);
  const currentSelection = useRef('');
  const working = useRef(false);
  const active = useRef(true);
  const abort = useRef(null);
  const t = (pt, english) => en ? english : pt;
  const money = cents => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const selectionKey = JSON.stringify(selection);
  const phoneValue = normalizedPhone(phone);
  const paymentKey = `${selectionKey}:${method}:${method === 'mbway' ? phoneValue : ''}`;
  const paymentReady = methods.includes(method) && (method !== 'mbway' || Boolean(phoneValue));
  const creationBlocked = !supplementary && Boolean(registration) && !retrySource;
  currentSelection.current = paymentKey;

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
  function validateOrder(value, expectedId = null) {
    if (!value || !UUID.test(value.id || '') || value.currency !== 'EUR' || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0
      || (expectedId && value.id !== expectedId) || (value.kind && value.kind !== kind)
      || (supplementary && value.kind !== 'supplementary') || !knownMethods.includes(value.method)
      || (value.replacementOrderId && (!UUID.test(value.replacementOrderId) || value.replacementOrderId === value.id))) throw new Error('invalid-order');
  }
  function acceptOrder(value, expectedId = null) {
    validateOrder(value, expectedId);
    setOrder(value); setId(value.id); setRetrySource(''); onLock(true);
    try { localStorage.setItem(key, value.id); } catch { /* An existing server order remains recoverable. */ }
  }
  async function resolveExistingOrder(value, expectedId = null, signal) {
    const seen = new Set();
    for (let count = 0; count < 10; count += 1) {
      validateOrder(value, expectedId);
      if (!value.replacementOrderId) return value;
      if (seen.has(value.id)) throw new Error('invalid-order');
      seen.add(value.id); expectedId = value.replacementOrderId;
      value = (await request(`/orders/${expectedId}`, undefined, signal)).order;
    }
    throw new Error('order-history-needs-review');
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); abort.current = controller;
    async function configuration() {
      setConfigBusy(true); setConfigFailed(false);
      try {
        const result = await request('/config', undefined, controller.signal);
        if (typeof result.enabled !== 'boolean' || !Array.isArray(result.methods)
          || result.environment !== 'production') throw new Error('invalid-config');
        if (active.current && !controller.signal.aborted) {
          const available = result.enabled ? knownMethods.filter(value => result.methods.includes(value)) : [];
          setMethods(available); setMethod(current => available.includes(current) ? current : available[0] || '');
        }
      } catch {
        if (active.current && !controller.signal.aborted) { setMethods([]); setConfigFailed(true); }
      } finally { if (active.current && !controller.signal.aborted) setConfigBusy(false); }
    }
    async function recover() {
      setBusy(true); setError('');
      try {
        let saved = '';
        // A retained UUID may be a new attempt whose response was lost while
        // the registration subscription still contains its predecessor.
        try { saved = localStorage.getItem(key) || ''; } catch {}
        saved = saved || (supplementary ? '' : registration?.payment?.orderId || '');
        if (saved && !UUID.test(saved)) throw new Error('invalid-order');
        if (saved || registration || supplementary) {
          const result = await request(saved ? `/orders/${saved}` : supplementary ? '/supplementary-order' : '/primary-order', undefined, controller.signal);
          const recovered = await resolveExistingOrder(result.order, saved || null, controller.signal);
          if (active.current && !controller.signal.aborted) acceptOrder(recovered);
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
    configuration();
    return () => { active.current = false; controller.abort(); };
    // Recovery runs once for the signed-in account and its registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registration?.id]);
  useEffect(() => { setPreview(null); setConfirmed(false); }, [paymentKey]);

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
    if (working.current || busy || configBusy || id || creationBlocked || recoveryBlocked || !eligible || !paymentReady) return;
    working.current = true; setBusy(true); setError(''); setPreview(null); setConfirmed(false);
    try {
      const result = await request(path('quote'), { selection });
      if (!stamp(result.stamp) || !stamp(result.billingStamp) || !result.billing || !Number.isSafeInteger(result.quote?.amountCents)
        || result.quote.amountCents <= 0 || result.quote.currency !== 'EUR'
        || (supplementary && result.quote.kind !== 'supplementary')) throw new Error('invalid-preview');
      if (active.current && currentSelection.current === paymentKey) setPreview({ ...result, paymentKey });
    } catch (issue) {
      if (active.current && supplementary && issue.code === 'supplementary-order-exists') await recoverSupplement(issue.order);
      else if (active.current) setError(messages[issue.code]?.[en ? 1 : 0] || t('Não foi possível preparar o pagamento. Atualize a página ou contacte a organização.', 'Could not prepare payment. Refresh the page or contact the organisers.'));
    }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function create() {
    if (working.current || busy || configBusy || id || creationBlocked || recoveryBlocked || !eligible || !paymentReady || !confirmed || !preview || preview.paymentKey !== paymentKey) return;
    working.current = true; setBusy(true); setError(''); onLock(true);
    let orderId = '', sent = false;
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      orderId = crypto.randomUUID();
      if (!UUID.test(orderId) || orderId === retrySource) throw new Error('invalid-new-order');
      localStorage.setItem(key, orderId);
      if (!UUID.test(orderId) || localStorage.getItem(key) !== orderId) throw new Error('storage-unavailable');
      setId(orderId); sent = true;
      // A newly saved registration can update the parent subscription while
      // this request is running. It must not abort the payment creation response.
      const result = await request(path('orders'), { id: orderId, selection, stamp: preview.stamp, billingStamp: preview.billingStamp, method,
        ...(method === 'mbway' ? { phone: phoneValue } : {}), ...(retrySource ? { replacesOrderId:retrySource } : {}) }, null, token);
      if (result.order?.method !== method) throw new Error('invalid-order');
      if (active.current) { acceptOrder(result.order, orderId); setPhone(''); }
    } catch (issue) {
      if (!active.current) return;
      if (retrySource && retryConflicts.has(issue.code)) {
        // These server refusals occur before provider creation. Recover the
        // predecessor/current attempt without creating another payment.
        const source = retrySource;
        setRecoveryBlocked(true); setPreview(null); setConfirmed(false); setOrder(null); setId(source);
        try { localStorage.setItem(key, source); } catch {}
        try {
          let predecessor;
          try { validateOrder(issue.order, source); predecessor = issue.order; }
          catch { predecessor = (await request(`/orders/${source}`)).order; }
          const current = await resolveExistingOrder(predecessor, source);
          if (canRetryOrder(current)) throw new Error('retry-conflict-unresolved');
          if (active.current) { acceptOrder(current); setRecoveryBlocked(false); setError(messages[issue.code]?.[en ? 1 : 0] || ''); }
        } catch { if (active.current) setError(t('O pedido foi alterado entretanto. Consulte o estado deste pedido antes de criar outro pagamento.', 'The order has changed. Check this order status before creating another payment.')); }
      } else if (supplementary && issue.code === 'supplementary-order-exists') {
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
    try {
      const result = await request(`/orders/${id}`);
      const current = await resolveExistingOrder(result.order, id);
      if (active.current) { acceptOrder(current); setRecoveryBlocked(false); setError(''); setBankReportNeedsRefresh(false); bankReport.current = null; }
    }
    catch { if (active.current) setError(t('Não foi possível atualizar o estado. Mantenha este pedido e contacte a organização.', 'Could not refresh status. Keep this order and contact the organisers.')); }
    finally { working.current = false; if (active.current && !silent) setBusy(false); }
  }
  useEffect(() => {
    if (!id || !order || ['expired', 'cancelled', 'refunded', 'creation_failed'].includes(order.status)
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
    setPhone(''); setBankNote(''); setBankDeclared(false); setCopyMessage(''); setBankReportNeedsRefresh(false); bankReport.current = null;
    onLock(false); onNewPurchase();
  }
  async function reconcileMbway() {
    if (working.current || busy || order?.method !== 'mbway' || !['pending', 'creation_unknown'].includes(order.status) || !order.reference) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await request(`/orders/${order.id}/mbway-reconcile`, {});
      const current = await resolveExistingOrder(result.order, order.id);
      if (active.current) { acceptOrder(current); setRecoveryBlocked(false); }
    } catch { if (active.current) setError(t('Não foi possível confirmar o estado do pedido MB WAY. Mantenha este pedido e consulte novamente ou contacte a organização; não envie outro pagamento.', 'The MB WAY request status could not be confirmed. Keep this order and check again or contact the organisers; do not send another payment.')); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  function prepareRetry() {
    if (working.current || busy || !canRetryOrder(order)) return;
    const source = order.id;
    try { localStorage.removeItem(key); } catch { setError(t('Não foi possível preparar outra tentativa neste navegador.', 'Could not prepare another attempt in this browser.')); return; }
    setRetrySource(source); setId(''); setOrder(null); setPreview(null); setConfirmed(false); setRecoveryBlocked(false); setError(''); setPhone('');
    setMethod(methods.includes('mbway') ? 'mbway' : methods[0] || '');
    onLock(false);
  }
  const customer = preview?.billing;
  const currentMethod = order?.method || method;
  const methodLabel = methodNames[currentMethod]?.[en ? 1 : 0] || t('Pagamento', 'Payment');
  const bank = order?.method === 'bank_transfer' ? order.bankTransfer : null;
  const bankPending = bank && ['pending', 'review_required'].includes(order.status);
  const canReportBankTransfer = bankPending && ['awaiting_transfer', 'rejected'].includes(bank.status);

  async function copyPaymentText(value, name) {
    setCopyMessage('');
    try { await navigator.clipboard.writeText(value); if (active.current) setCopyMessage(name === 'iban' ? t('IBAN copiado.', 'IBAN copied.') : t('Referência copiada.', 'Reference copied.')); }
    catch { if (active.current) setCopyMessage(t('Não foi possível copiar automaticamente. Selecione e copie o texto apresentado.', 'Could not copy automatically. Select and copy the displayed text.')); }
  }
  async function reportBankTransfer(event) {
    event.preventDefault();
    if (working.current || busy || bankReportNeedsRefresh || !bankDeclared || !canReportBankTransfer
      || !Number.isSafeInteger(bank.revision) || bank.revision < 0 || bankNote.length > 500) return;
    working.current = true; setBusy(true); setError('');
    try {
      const slot = `${order.id}:${bank.revision}`;
      if (bankReport.current?.slot !== slot) bankReport.current = { slot, id: crypto.randomUUID() };
      const result = await request(`/orders/${order.id}/bank-transfer-report`, { id: bankReport.current.id, expectedRevision: bank.revision, note: bankNote.trim() });
      if (active.current) { acceptOrder(result.order, order.id); setBankDeclared(false); }
    } catch { if (active.current) { setBankReportNeedsRefresh(true); setError(t('Não foi possível confirmar a comunicação. Atualize o estado deste pedido antes de voltar a comunicar a transferência.', 'The transfer report could not be confirmed. Refresh this order before reporting the transfer again.')); } }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  return <section className="registration-checkout" aria-label={supplementary ? t('Pagamento do complemento', 'Supplement payment') : t('Pagamento da inscrição', 'Registration payment')} aria-busy={busy}>
    <h3>{id ? `${t('Pagamento', 'Payment')} · ${methodLabel}` : t('Pagamento', 'Payment')}</h3>
    <p>{t('Beneficiário', 'Payee')}: Associação Hemisfério Disciplinado</p>
    {!id && !creationBlocked && <>
      {retrySource && <p role="status">{t('Está a preparar uma nova tentativa para um pedido encerrado sem pagamento. Reveja o valor, os dados de faturação e o número MB WAY antes de confirmar.', 'You are preparing another attempt for an order closed without payment. Review the amount, billing details and MB WAY number before confirming.')}</p>}
      {methods.length > 0 && <fieldset disabled={busy || configBusy} className="registration-payment-methods"><legend>{t('Meio de pagamento', 'Payment method')}</legend>
        {methods.map(value => <label key={value}><input type="radio" name={`payment-method-${kind}`} value={value} checked={method === value} onChange={() => setMethod(value)} />{methodNames[value][en ? 1 : 0]}</label>)}
      </fieldset>}
      {method === 'mbway' && methods.includes('mbway') && <label className="registration-payment-phone">{t('Número MB WAY', 'MB WAY phone number')}
        <input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} maxLength="20" placeholder="+351 9XXXXXXXX" disabled={busy} onChange={event => setPhone(event.target.value)} />
        <small>{t('Número português com 9 algarismos. Pode incluir +351. Receberá o pedido na aplicação MB WAY.', 'A nine-digit Portuguese number, optionally with +351. The request will arrive in the MB WAY app.')}</small>
      </label>}
      {!configBusy && methods.length === 0 && <p role="alert">{configFailed ? t('Não foi possível consultar os meios de pagamento. Atualize a página antes de criar um pedido.', 'Payment methods could not be loaded. Refresh this page before creating an order.') : t('Os pagamentos estão temporariamente indisponíveis.', 'Payments are temporarily unavailable.')}</p>}
      <p>{supplementary ? t('Este complemento tem um pagamento e uma fatura-recibo próprios. A inscrição original mantém-se paga.', 'This supplement has its own payment and invoice-receipt. The original registration stays paid.')
        : method === 'bank_transfer'
          ? t('Após a organização conferir o crédito na conta, o pagamento e a inscrição são confirmados automaticamente. A fatura-recibo ficará disponível no My CIRC após a emissão.', 'Once the organisers verify the credited amount, payment and registration are confirmed automatically. The invoice-receipt will be available in My CIRC once issued.')
          : t('A inscrição é confirmada automaticamente após o pagamento. A fatura-recibo ficará disponível no My CIRC após a emissão.', 'Registration is confirmed automatically after payment. The invoice-receipt will be available in My CIRC once issued.')}</p>
      <button type="button" className="button button--dark" disabled={busy || configBusy || recoveryBlocked || !eligible || !paymentReady} onClick={review}>{busy || configBusy ? t('A consultar…', 'Loading…') : t('Rever valor e faturação', 'Review amount and billing')}</button>
      {customer && <div className="registration-invoice">
        <p><strong>{t('Valor a pagar:', 'Amount to pay:')} {money(preview.quote.amountCents)}</strong></p>
        <dl><dt>{t('Nome de faturação', 'Billing name')}</dt><dd>{customer.customer_business_name}</dd>
          <dt>NIF</dt><dd>{customer.customer_tax_registration_number}</dd><dt>{t('Morada', 'Address')}</dt><dd>{customer.customer_address_detail}</dd>
          <dt>{t('Código postal e localidade', 'Postcode and city')}</dt><dd>{customer.customer_postcode} · {customer.customer_city}</dd><dt>{t('País', 'Country')}</dt><dd>{customer.customer_country}</dd></dl>
        <p>{t('Meio de pagamento', 'Payment method')}: <strong>{methodLabel}</strong>{method === 'mbway' ? ` · +351 ${phoneValue}` : ''}</p>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /> {t('Conferi o valor, os dados de faturação e o meio de pagamento e pretendo criar este pedido.', 'I reviewed the amount, billing details and payment method and want to create this order.')}</label>
        <button type="button" className="button button--dark" onClick={create} disabled={busy || !confirmed || !eligible || !paymentReady}>{method === 'mbway' ? t('Enviar pedido MB WAY', 'Send MB WAY request') : method === 'bank_transfer' ? t('Preparar transferência bancária', 'Prepare bank transfer') : t('Gerar referência Multibanco', 'Generate Multibanco reference')}</button>
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
      {order.status === 'pending' && order.method === 'multibanco' && <dl><dt>{t('Entidade', 'Entity')}</dt><dd>{order.entity}</dd><dt>{t('Referência', 'Reference')}</dt><dd>{order.reference}</dd></dl>}
      {order.status === 'pending' && order.method === 'mbway' && <div>
        <p>{t('Confirme este pedido na aplicação MB WAY. A confirmação do pagamento será recebida automaticamente.', 'Confirm this request in the MB WAY app. Payment confirmation will be received automatically.')}</p>
        {order.expiresAt && Number.isFinite(Date.parse(order.expiresAt)) && <p>{t('Prazo indicado para aprovação', 'Approval deadline')}: {new Date(order.expiresAt).toLocaleString(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' })} ({t('hora de Lisboa', 'Lisbon time')})</p>}
        <p>{t('Se o prazo terminar, consulte este pedido na MB WAY antes de tentar outro pagamento. Esta consulta verifica o pedido existente e não envia um novo pedido de pagamento.', 'If the deadline passes, check this request with MB WAY before attempting another payment. This checks the existing request and does not send a new payment request.')}</p>
      </div>}
      {order.method === 'mbway' && ['pending', 'creation_unknown'].includes(order.status) && Boolean(order.reference) && <button type="button" disabled={busy} onClick={reconcileMbway}>{t('Consultar pedido na MB WAY', 'Check request with MB WAY')}</button>}
      {canRetryOrder(order) && <div><p>{t('O encerramento sem pagamento foi confirmado. Pode preparar outra tentativa e voltar a conferir os dados antes de enviar um novo pedido.', 'Closure without payment was confirmed. You can prepare another attempt and review the details before sending a new request.')}</p><button type="button" disabled={busy} onClick={prepareRetry}>{t('Preparar nova tentativa de pagamento', 'Prepare another payment attempt')}</button></div>}
      {bankPending && <section className="registration-bank-transfer" aria-label={t('Instruções de transferência bancária', 'Bank transfer instructions')}>
        {[bank.payee, bank.iban, bank.paymentReference].every(value => typeof value === 'string' && value.trim()) ? <>
          <dl><dt>{t('Titular', 'Account holder')}</dt><dd>{bank.payee}</dd><dt>IBAN</dt><dd><strong>{bank.iban}</strong></dd><dt>{t('Referência a indicar na transferência', 'Transfer reference')}</dt><dd>{bank.paymentReference}</dd></dl>
          <div className="registration-bank-transfer__copy"><button type="button" onClick={() => copyPaymentText(bank.iban, 'iban')}>{t('Copiar IBAN', 'Copy IBAN')}</button><button type="button" onClick={() => copyPaymentText(bank.paymentReference, 'reference')}>{t('Copiar referência', 'Copy reference')}</button></div>
          {copyMessage && <p role="status">{copyMessage}</p>}
          <p>{t('Indique a referência apresentada para identificar o seu pagamento. A inscrição será confirmada após a organização conferir a entrada do valor na conta.', 'Include the displayed reference to identify your payment. Registration will be confirmed after the organisers verify the amount credited to the account.')}</p>
          {bank.status === 'under_review' && <p role="status">{t('Transferência comunicada — aguarda conferência da organização.', 'Transfer reported — awaiting organiser review.')}</p>}
          {canReportBankTransfer && <form onSubmit={reportBankTransfer}>
            <label>{t('Observação para a organização (opcional)', 'Note for the organisers (optional)')}<textarea value={bankNote} maxLength="500" disabled={busy || bankReportNeedsRefresh} onChange={event => setBankNote(event.target.value)} /></label>
            <label><input type="checkbox" checked={bankDeclared} disabled={busy || bankReportNeedsRefresh} onChange={event => setBankDeclared(event.target.checked)} />{t('Já efetuei a transferência e pretendo comunicá-la à organização para conferência.', 'I have made the transfer and want to report it to the organisers for verification.')}</label>
            <button type="submit" disabled={busy || bankReportNeedsRefresh || !bankDeclared}>{t('Comunicar transferência efetuada', 'Report completed transfer')}</button>
          </form>}
        </> : <p role="alert">{t('Os dados bancários deste pedido não estão disponíveis. Atualize o estado antes de efetuar a transferência.', 'Bank details for this order are unavailable. Refresh its status before making the transfer.')}</p>}
      </section>}
      {order.fiscalDocumentNo && <p>{t('Fatura-recibo:', 'Invoice-receipt:')} <strong>{order.fiscalDocumentNo}</strong></p>}
      {order.status === 'paid' && order.fiscalStatus === 'review_required' && <p role="status">{t('O pagamento está confirmado. A fatura-recibo está pendente de conferência pela organização; não efetue outro pagamento.', 'Payment is confirmed. The invoice-receipt awaits organiser review; do not make another payment.')}</p>}
      {supplementary && order.status === 'paid' && order.fiscalStatus !== 'issued' && <p>{t('A faturação deste pedido ainda está em processamento. Aguarde a conclusão ou contacte a organização antes de preparar outro complemento.', 'This order invoice is still being processed. Wait for completion or contact the organisers before preparing another supplement.')}</p>}
      {supplementary && order.status === 'paid' && order.fiscalStatus === 'issued' && <button type="button" onClick={newPurchase} disabled={busy}>{t('Preparar nova compra', 'Prepare another purchase')}</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <Link to="/conta/perfil">{t('Rever dados de faturação no perfil', 'Review billing profile')}</Link>
  </section>;
}
