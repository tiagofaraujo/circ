import React, { useEffect, useRef, useState } from 'react';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const STAMP = /^[a-f0-9]{64}$/;
const preWriteRejections = new Set(['quote-changed', 'billing-preview-changed', 'billing-customer-unconfirmed',
  'profile-incomplete', 'pilot-not-configured', 'pilot-confirmation-required', 'live-checkout-not-configured', 'registration-not-open', 'live-scope-not-enabled']);
const paymentStates = {
  pending: ['A aguardar pagamento', 'Awaiting payment'], creating: ['Criação em processamento — não repetir', 'Creation in progress — do not repeat'],
  creation_unknown: ['Resultado da criação por confirmar — não repetir', 'Creation outcome unknown — do not repeat'],
  creation_failed: ['Criação recusada — requer revisão', 'Creation rejected — review required'],
  paid: ['Pagamento confirmado', 'Payment confirmed'], review_required: ['Requer revisão manual', 'Manual review required'],
};
const fiscalStates = {
  pending: ['Pendente', 'Pending'], issued: ['Emitido', 'Issued'], pending_authorization: ['Autorização TOConline necessária', 'TOConline authorization required'],
  review_required: ['Requer revisão manual', 'Manual review required'], outcome_unknown: ['Resultado por confirmar — não repetir a emissão', 'Outcome unknown — do not repeat issuance'],
};

export default function LivePaymentPilotOrder({ user, preview, en = false }) {
  const storageKey = `circ-live-pilot-order:${user.uid}`;
  const [id, setId] = useState('');
  const [order, setOrder] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [approvedAccount, setApprovedAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsPreview, setNeedsPreview] = useState(false);
  const working = useRef(false);
  const active = useRef(true);
  const controller = useRef(null);
  const t = (pt, english) => en ? english : pt;
  const money = amount => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(amount / 100);
  const enabled = preview?.creationEnabled === true && STAMP.test(preview.stamp || '') && STAMP.test(preview.billingStamp || '');

  useEffect(() => {
    active.current = true;
    try {
      const saved = sessionStorage.getItem(storageKey);
      setId(saved ? UUID.test(saved) ? saved : 'invalid' : '');
    } catch { /* Creation will fail closed if the identifier cannot be saved. */ }
    return () => { active.current = false; controller.current?.abort(); };
  }, [storageKey]);
  useEffect(() => {
    setAcknowledged(false); setApprovedAccount(false); setNeedsPreview(false);
  }, [preview?.preparedAt, preview?.stamp, preview?.billingStamp]);

  async function request(path, body, token, signal) {
    const response = await fetch(`/api/checkout/live${path}`, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('request-failed'), { code: data.error });
    const expectedId = path === '/primary-order' ? null : body === undefined ? path.split('/').pop() : body.id;
    if (!data.order || !UUID.test(data.order.id || '') || (expectedId && data.order.id !== expectedId) || !Number.isSafeInteger(data.order.amountCents)
      || data.order.amountCents <= 0 || data.order.currency !== 'EUR') throw new Error('invalid-response');
    return data.order;
  }

  async function create() {
    if (working.current || !enabled || !acknowledged || !approvedAccount || id || needsPreview) return;
    if (!window.confirm(t(
      `Vai criar uma referência Multibanco real de ${money(preview.quote.amountCents)} para a Associação Hemisfério Disciplinado. A inscrição fica pendente e, quando o pagamento for confirmado, o servidor tentará emitir uma fatura-recibo definitiva no TOConline. Confirma a criação?`,
      `Create a real Multibanco reference for ${money(preview.quote.amountCents)} payable to Associação Hemisfério Disciplinado? The registration will remain pending. On confirmed payment, the server will attempt to issue a final TOConline invoice-receipt.`
    ))) return;
    working.current = true; setBusy(true); setError('');
    const current = new AbortController(); controller.current = current;
    let orderId = '', sent = false;
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      orderId = crypto.randomUUID();
      if (!UUID.test(orderId)) throw new Error('identifier-unavailable');
      try {
        sessionStorage.setItem(storageKey, orderId);
        if (sessionStorage.getItem(storageKey) !== orderId) throw new Error('storage-unavailable');
      } catch { throw new Error('identifier-unavailable'); }
      setId(orderId);
      sent = true;
      const result = await request('/orders', { id: orderId,
        selection: { profile: preview.quote.selection.profile, congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
        stamp: preview.stamp, billingStamp: preview.billingStamp, method: 'multibanco',
        pilotAcknowledged: true, pilotConfirmation: 'CRIAR REFERENCIA REAL',
      }, token, current.signal);
      if (active.current) setOrder(result);
    } catch (issue) {
      if (!active.current) return;
      if (!sent || preWriteRejections.has(issue.code)) {
        if (orderId) { try { sessionStorage.removeItem(storageKey); } catch {} }
        setId('');
        setNeedsPreview(true);
        setError(issue.message === 'identifier-unavailable'
          ? t('Não foi possível guardar o identificador neste navegador. Nenhum pedido foi enviado. Verifique o armazenamento do navegador antes de continuar.', 'Could not save the identifier in this browser. No request was sent. Check browser storage before continuing.')
          : t('A criação foi bloqueada antes de gerar uma referência. Atualize a pré-visualização e confira novamente o valor e a faturação.', 'Creation was blocked before generating a reference. Refresh the preview and review the amount and billing details again.'));
      } else setError(t('O resultado da criação requer conferência. Não gere outro pedido. Use «Consultar este pedido»; a referência pode já existir.',
        'Creation needs to be checked. Do not generate another order. Use “Check this order”; a reference may already exist.'));
    } finally { working.current = false; if (active.current) setBusy(false); }
  }

  async function refresh() {
    if (working.current || !UUID.test(id)) return;
    working.current = true; setBusy(true); setError(''); setOrder(null);
    const current = new AbortController(); controller.current = current;
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      const result = await request(`/orders/${id}`, undefined, token, current.signal);
      if (active.current) setOrder(result);
    } catch {
      if (active.current) setError(t('Não foi possível consultar o pedido. Não crie outro: mantenha este identificador para conferência pela organização.',
        'Could not read the order. Do not create another: keep this identifier for the organizer to investigate.'));
    } finally { working.current = false; if (active.current) setBusy(false); }
  }

  async function recover() {
    if (working.current || id) return;
    working.current = true; setBusy(true); setError('');
    const current = new AbortController(); controller.current = current;
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      const result = await request('/primary-order', undefined, token, current.signal);
      if (!active.current) return;
      try { sessionStorage.setItem(storageKey, result.id); } catch { /* The visible ID remains available for manual recovery. */ }
      setId(result.id); setOrder(result);
    } catch {
      if (active.current) {
        setNeedsPreview(true);
        setError(t('Não foi possível recuperar um pedido de produção único desta inscrição. Nenhum pedido foi criado. A inscrição existente requer conferência pela organização.',
          'Could not recover one unique production order for this registration. No order was created. The existing registration needs organizer review.'));
      }
    } finally { working.current = false; if (active.current) setBusy(false); }
  }

  return <div className="sandbox-checkout__panel" aria-label={t('Referência do ensaio privado', 'Private pilot reference')} aria-busy={busy}>
    <h3>{t('Referência Multibanco — ensaio privado', 'Multibanco reference — private pilot')}</h3>
    {!id && <>
      <p>{t('Se já existe uma inscrição, pode consultar o pedido guardado no servidor, mesmo noutro navegador ou após o fecho do ensaio. Esta consulta não cria pagamentos nem emite documentos.',
        'If a registration already exists, check its server order, including from another browser or after the pilot closes. This check creates no payments or documents.')}</p>
      <button type="button" disabled={busy} onClick={recover}>{t('Consultar pedido existente', 'Check existing order')}</button>
    </>}
    {preview && !enabled && <p><strong>{t('Criação bloqueada: os pagamentos reais estão desativados ou a configuração está incompleta. Não altere a ativação sem autorização para o ensaio.',
      'Creation blocked: live payments are disabled or setup is incomplete. Do not enable payments without authorization for the pilot.')}</strong></p>}
    {!id && preview && <>
      <label className="check"><input type="checkbox" checked={approvedAccount} disabled={busy} onChange={event => setApprovedAccount(event.target.checked)} /> {t('Confirmo que a EuPago autorizou a conta a receber pagamentos.', 'I confirm that EuPago has approved this account to receive payments.')}</label>
      <label className="check"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /> {t(
        `Conferi o valor de ${money(preview.quote.amountCents)} e os dados acima. Pretendo uma inscrição real, com fatura-recibo definitiva após confirmação do pagamento.`,
        `I reviewed the ${money(preview.quote.amountCents)} amount and billing details above. I want a real registration, with a final invoice-receipt after payment confirmation.`)}</label>
      <button type="button" disabled={busy || !enabled || !acknowledged || !approvedAccount || needsPreview} onClick={create}>{t('Gerar referência Multibanco real', 'Generate real Multibanco reference')}</button>
    </>}
    {id && <>
      <p><strong>{t('Pedido guardado:', 'Saved order:')}</strong> <code>{id === 'invalid' ? t('identificador inválido — requer revisão', 'invalid identifier — review required') : id}</code></p>
      <p>{t('Este navegador conserva apenas o identificador para recuperar o pedido. Não volte a gerar uma referência se a resposta demorar ou falhar.', 'This browser keeps only the identifier to recover the order. Do not generate another reference if the response is slow or fails.')}</p>
      <button type="button" disabled={busy || !UUID.test(id)} onClick={refresh}>{t('Consultar este pedido', 'Check this order')}</button>
    </>}
    {error && <p className="sandbox-checkout__error" role="alert">{error}</p>}
    {order && <div className="sandbox-checkout__confirmed">
      <p><strong>{paymentStates[order.status]?.[en ? 1 : 0] || t('Estado por conferir', 'Status requires checking')}</strong></p>
      <p>{t('Valor do pedido:', 'Order amount:')} {money(order.amountCents)}</p>
      {/^\d{5}$/.test(order.entity || '') && /^\d{9}$/.test(order.reference || '') && <>
        <p>{t('Entidade:', 'Entity:')} <strong>{order.entity}</strong></p>
        <p>{t('Referência:', 'Reference:')} <strong>{order.reference}</strong></p>
      </>}
      <p>{t('Documento fiscal:', 'Fiscal document:')} {fiscalStates[order.fiscalStatus]?.[en ? 1 : 0] || t('Sem emissão confirmada', 'No confirmed issuance')}</p>
    </div>}
  </div>;
}
