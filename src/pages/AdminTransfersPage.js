import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import './AdminTransfersPage.css';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const mayReview = order => ['pending', 'review_required'].includes(order.status)
  && ['awaiting_transfer', 'under_review', 'rejected'].includes(order.bankTransfer?.status);
const definitiveErrors = new Set(['invalid-request', 'bank-transfer-credit-required', 'bank-transfer-invalid-credit',
  'bank-transfer-stale-review', 'bank-transfer-state-conflict', 'bank-transfer-source-mismatch',
  'bank-transfer-tariff-mismatch', 'bank-transfer-credit-used']);
function cents(value) {
  const match = /^(0|[1-9]\d{0,6})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
function lisbonDay(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const lisbonToday = () => lisbonDay(new Date());
function validDate(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value) && value <= lisbonToday()
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
const validOrder = order => order && UUID.test(order.id || '') && order.method === 'bank_transfer'
  && order.currency === 'EUR' && Number.isSafeInteger(order.amountCents) && order.amountCents > 0
  && Number.isSafeInteger(order.bankTransfer?.revision) && order.bankTransfer.revision >= 0;
function mergeOrders(previous, incoming) {
  const merged = new Map(previous.map(order => [order.id, order]));
  for (const order of incoming) {
    const existing = merged.get(order.id);
    if (!existing || existing.bankTransfer.revision <= order.bankTransfer.revision) merged.set(order.id, order);
  }
  return [...merged.values()];
}

export default function AdminTransfersPage() {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  if (!user || !isAdmin) return <main className="admin-page"><p role="alert">{language === 'en' ? 'Bank transfer review requires the administrator account.' : 'A conferência de transferências requer a conta de administração.'}</p></main>;
  return <AdminTransfersQueue key={user.uid} user={user} language={language} />;
}

function AdminTransfersQueue({ user, language }) {
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const money = amount => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(amount / 100);
  const [orders, setOrders] = useState([]), [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('pending'), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [posting, setPosting] = useState(false), [readFailed, setReadFailed] = useState(false);
  const [truncated, setTruncated] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [amount, setAmount] = useState(''), [bookingDate, setDate] = useState(''), [creditReference, setReference] = useState(''), [reason, setReason] = useState('');
  const [creditConfirmed, setConfirmed] = useState(false), [, setAttemptRevision] = useState(0);
  const alive = useRef(false), activeRequest = useRef(null), working = useRef(false), attempts = useRef(new Map());
  const reading = useRef(false), seenCursors = useRef(new Set());
  const selected = orders.find(order => order.id === selectedId);
  const selectedKey = selected ? `${selected.id}:${selected.bankTransfer.revision}` : '';
  const attempt = attempts.current.get(selectedKey);

  async function api(path, body, signal) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/checkout/live${path}`, { method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store', signal, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('invalid-response'); }
    if (!response.ok) throw Object.assign(new Error('request-failed'), { code: data.error, data, status: response.status });
    return data;
  }

  function validatePage(result, { cursor = '', orderId = '' } = {}) {
    if (!Array.isArray(result.orders) || !result.orders.every(validOrder) || typeof result.truncated !== 'boolean'
      || (result.truncated ? !UUID.test(result.nextCursor || '') || result.nextCursor === cursor
        || (cursor && seenCursors.current.has(result.nextCursor)) : result.nextCursor !== null)
      || (orderId && (result.orders.length > 1 || result.orders.some(order => order.id !== orderId)
        || result.truncated || result.nextCursor !== null))) throw new Error('invalid-response');
    return result;
  }
  function releaseReadAttempts(returned) {
    const current = new Map(returned.map(order => [order.id, order]));
    for (const [key, previous] of attempts.current) {
      const order = current.get(key.split(':')[0]);
      if (!order || order.bankTransfer.revision < previous.payload.expectedRevision) continue;
      if (previous.state === 'definitive') attempts.current.delete(key);
      else if (previous.state === 'ambiguous') previous.mustRefresh = false;
    }
  }
  async function load(signal, { append = false, orderId = '' } = {}) {
    if (reading.current || working.current || (append && (!truncated || !UUID.test(nextCursor || '')))
      || (orderId && !UUID.test(orderId))) return;
    const cursor = append ? nextCursor : '';
    reading.current = true; setLoading(true); setError(''); setMessage('');
    try {
      const query = orderId ? `?orderId=${orderId}` : cursor ? `?after=${cursor}` : '';
      const result = validatePage(await api(`/bank-transfers${query}`, undefined, signal), { cursor, orderId });
      let returned = result.orders;
      // A refresh starts the paginated list again. Keep the selected order
      // visible by reading it separately when it is outside the first page.
      if (!append && !orderId && selectedId && !returned.some(order => order.id === selectedId)) {
        const selectedResult = validatePage(await api(`/bank-transfers?orderId=${selectedId}`, undefined, signal), { orderId:selectedId });
        returned = mergeOrders(returned, selectedResult.orders);
      }
      if (!alive.current || signal?.aborted) return;
      releaseReadAttempts(returned);
      if (append || orderId) setOrders(previous => mergeOrders(previous, returned));
      else setOrders(returned);
      if (!orderId) {
        if (!append) seenCursors.current.clear();
        if (result.nextCursor) seenCursors.current.add(result.nextCursor);
        setNextCursor(result.nextCursor); setTruncated(result.truncated);
        if (!append) setReadFailed(false);
      } else if (result.orders.length === 1) {
        setSelectedId(orderId); setFilter('all');
      } else {
        setMessage(t('Não foi encontrado um pedido de transferência com este identificador.', 'No bank transfer order was found with this identifier.'));
      }
      setConfirmed(false);
      setAttemptRevision(value => value + 1);
    } catch {
      if (alive.current && !signal?.aborted) {
        setReadFailed(true);
        setError(t('Não foi possível atualizar as transferências. A confirmação fica indisponível até concluir uma nova consulta.', 'Transfers could not be refreshed. Confirmation remains unavailable until a new read succeeds.'));
      }
    } finally { reading.current = false; if (alive.current && !signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController(); activeRequest.current = controller;
    setOrders([]); setSelectedId(''); attempts.current.clear(); seenCursors.current.clear();
    load(controller.signal);
    return () => { alive.current = false; controller.abort(); };
    // The authenticated account owns its queue and request ledger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  useEffect(() => {
    const saved = attempts.current.get(selectedKey)?.payload;
    setAmount(saved ? (saved.amountCents / 100).toFixed(2).replace('.', ',') : '');
    setDate(saved?.bookingDate || ''); setReference(saved?.creditReference || ''); setReason(saved?.reason || '');
    setConfirmed(false);
  }, [selectedKey]);

  const amountCents = cents(amount);
  const normalizedReference = creditReference.trim().replace(/\s+/g, ' ');
  const createdDay = selected?.createdAt && Number.isFinite(Date.parse(selected.createdAt)) ? lisbonDay(new Date(selected.createdAt)) : '';
  const today = lisbonToday();
  const dayLabel = day => new Intl.DateTimeFormat(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' }).format(new Date(`${day}T12:00:00Z`));
  const amountOkay = amountCents !== null && amountCents <= 9999900;
  const dateOkay = (() => { try { return validDate(bookingDate) && (!createdDay || bookingDate >= createdDay); } catch { return false; } })();
  const referenceOkay = /^[A-Z0-9][A-Z0-9 /._:-]{2,79}$/.test(normalizedReference.toUpperCase());
  const reasonOkay = reason.trim().length <= 500 && !/[\u0000-\u001f\u007f]/.test(reason.trim());
  const fieldErrors = {
    amount: !amountOkay && (amount.trim() || creditConfirmed)
      ? t('Indique um montante entre 0,01 € e 99 999,00 €, com até duas casas decimais.', 'Enter an amount between €0.01 and €99,999.00, with up to two decimal places.') : '',
    date: !dateOkay && (bookingDate || creditConfirmed)
      ? bookingDate > today
        ? t(`A data do crédito não pode ser posterior a ${dayLabel(today)} (hoje, hora de Lisboa).`, `The credit date cannot be later than ${dayLabel(today)} (today in Lisbon).`)
        : bookingDate && createdDay && bookingDate < createdDay
          ? t(`A data do crédito não pode ser anterior a ${dayLabel(createdDay)}, data do pedido.`, `The credit date cannot precede ${dayLabel(createdDay)}, the order date.`)
          : t('Indique uma data de crédito válida.', 'Enter a valid credit date.') : '',
    reference: !referenceOkay && (normalizedReference || creditConfirmed)
      ? t('A referência do movimento não tem um formato válido. Use letras sem acentos, números e os separadores indicados.', 'The statement entry reference has an invalid format. Use unaccented letters, numbers and the listed separators.') : '',
    reason: !reasonOkay ? t('A observação deve ter até 500 caracteres e ocupar uma única linha.', 'The note must contain up to 500 characters on a single line.') : '',
  };
  const complete = amountOkay && dateOkay && referenceOkay && reasonOkay;
  const blocked = loading || posting || readFailed || !selected || !mayReview(selected) || attempt?.mustRefresh || attempt?.state === 'success';

  async function approve(event) {
    event.preventDefault();
    if (working.current || blocked || !complete || !creditConfirmed) return;
    working.current = true; setPosting(true); setError(''); setMessage('');
    let current = attempts.current.get(selectedKey);
    let sent = false;
    try {
      if (!current) {
        const id = crypto.randomUUID();
        if (!UUID.test(id)) throw new Error('decision-unavailable');
        current = { state: 'ready', mustRefresh: false, payload: { id, expectedRevision: selected.bankTransfer.revision,
          creditConfirmed: true, amountCents, currency: 'EUR', creditReference: normalizedReference,
          bookingDate, reason: reason.trim() } };
        attempts.current.set(selectedKey, current);
      }
      sent = true;
      const result = await api(`/orders/${selected.id}/bank-transfer-review`, current.payload);
      if (!validOrder(result.order) || result.order.id !== selected.id || result.order.status !== 'paid') throw new Error('invalid-response');
      current.state = 'success'; current.mustRefresh = false;
      if (!alive.current) return;
      setOrders(previous => previous.map(order => order.id === result.order.id ? { ...order, ...result.order } : order));
      setMessage(t('Crédito validado e pagamento confirmado. A inscrição foi atualizada; a faturação segue o estado do pedido.', 'Bank credit validated and payment confirmed. Registration was updated; invoicing follows the order status.'));
    } catch (issue) {
      if (!alive.current) return;
      if (sent && current) {
        current.state = definitiveErrors.has(issue.code) ? 'definitive' : 'ambiguous';
        current.mustRefresh = true;
      }
      setConfirmed(false);
      const detail = issue.code === 'bank-transfer-credit-used'
        ? t('Este movimento bancário já está associado a outro pagamento.', 'This bank entry is already associated with another payment.')
        : issue.code === 'bank-transfer-tariff-mismatch'
          ? t('O montante creditado não corresponde à tarifa da data indicada. Confira o valor recebido e regularize a diferença antes da confirmação.', 'The credited amount does not match the tariff for that date. Check the actual amount received and resolve the difference before confirmation.')
          : t('A validação não foi concluída ou o resultado não é conhecido.', 'Validation did not complete or its result is unknown.');
      setError(`${detail} ${t('Atualize a lista antes de voltar a tentar. Não confirme novamente um pagamento que já apareça como pago.', 'Refresh the list before trying again. Do not reconfirm a payment already shown as paid.')}`);
    } finally {
      working.current = false;
      if (alive.current) { setPosting(false); setAttemptRevision(value => value + 1); }
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = orders.filter(order => (filter === 'all' || mayReview(order)) && (!needle
    || `${order.ownerName || ''} ${order.bankTransfer.paymentReference || ''} ${order.id}`.toLowerCase().includes(needle)));
  const bankLabel = state => ({ awaiting_transfer: t('A aguardar transferência', 'Awaiting transfer'), under_review: t('Por conferir', 'Awaiting review'),
    confirmed: t('Confirmada', 'Confirmed'), rejected: t('Necessita de nova conferência', 'Needs another review') }[state] || t('Em conferência', 'Under review'));

  return <main className="admin-page admin-transfers">
    <AdminModuleNav />
    <header className="admin-transfers__header"><p>My CIRC · {t('Administração', 'Administration')}</p><h1>{t('Transferências bancárias', 'Bank transfers')}</h1>
      <p>{t('Confirme o crédito efetivo na conta antes de validar o pagamento. A comunicação do participante, por si só, não confirma a receção do dinheiro.', 'Check the actual bank credit before validating payment. The participant report alone does not confirm receipt of the money.')}</p></header>
    <div className="admin-transfers__toolbar">
      <label>{t('Mostrar', 'Show')}<select value={filter} disabled={posting} onChange={event => setFilter(event.target.value)}><option value="pending">{t('Por conferir', 'Awaiting review')}</option><option value="all">{t('Todos os registos recebidos', 'All returned records')}</option></select></label>
      <label>{t('Pesquisar', 'Search')}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Nome ou referência', 'Name or reference')} /></label>
      <button type="button" disabled={loading || posting} onClick={() => load(activeRequest.current?.signal)}>{loading ? t('A atualizar…', 'Refreshing…') : t('Atualizar lista', 'Refresh list')}</button>
      <button type="button" disabled={loading || posting || !UUID.test(search.trim())} onClick={() => load(activeRequest.current?.signal, { orderId:search.trim().toLowerCase() })}>{t('Localizar pedido por identificador', 'Find order by identifier')}</button>
    </div>
    <p>{t('Pedidos carregados', 'Loaded orders')}: {orders.length}. {t('A pesquisa por nome filtra os pedidos carregados. Para localizar um pedido específico, introduza o identificador completo e use «Localizar pedido por identificador».', 'Name search filters loaded orders. To find a specific order, enter its full identifier and use “Find order by identifier”.')}</p>
    {truncated && <p role="status">{t('Ainda existem pedidos por carregar. Os filtros e a pesquisa por nome abrangem apenas os pedidos carregados.', 'More orders remain to be loaded. Filters and name search cover only loaded orders.')}</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!loading && !readFailed && visible.length === 0 && <p>{truncated ? t('Não existem transferências neste filtro entre os pedidos carregados.', 'No loaded transfers match this filter.') : t('Não existem transferências para este filtro.', 'No transfers match this filter.')}</p>}
    {visible.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('Participante', 'Participant')}</th><th>{t('Pedido', 'Order')}</th><th>{t('Montante', 'Amount')}</th><th>{t('Estado', 'Status')}</th><th>{t('Referência', 'Reference')}</th><th>{t('Conferência', 'Review')}</th></tr></thead>
      <tbody>{visible.map(order => <tr key={order.id}><td>{order.ownerName || t('Participante', 'Participant')}</td><td>{order.kind === 'supplementary' ? t('Complementos', 'Supplements') : t('Inscrição', 'Registration')}<br /><small>{order.id}</small></td><td>{money(order.amountCents)}</td><td>{order.status === 'paid' ? t('Pago', 'Paid') : bankLabel(order.bankTransfer.status)}</td><td>{order.bankTransfer.paymentReference}</td><td><button type="button" disabled={posting || loading || readFailed} onClick={() => { setSelectedId(order.id); setError(''); }}>{mayReview(order) ? t('Conferir', 'Review') : t('Consultar', 'View')}</button></td></tr>)}</tbody></table></div>}
    {truncated && <button type="button" disabled={loading || posting} onClick={() => load(activeRequest.current?.signal, { append:true })}>{t('Carregar mais pedidos', 'Load more orders')}</button>}

    {selected && <section className="admin-transfers__review" aria-labelledby="transfer-review-title">
      <h2 id="transfer-review-title">{t('Conferência do crédito bancário', 'Bank credit review')}</h2>
      <p><strong>{selected.ownerName || t('Participante', 'Participant')}</strong> · {selected.bankTransfer.paymentReference}</p>
      <dl><dt>{t('Valor do pedido', 'Order amount')}</dt><dd>{money(selected.amountCents)}</dd><dt>{t('Beneficiário', 'Payee')}</dt><dd>{selected.bankTransfer.payee}</dd><dt>IBAN</dt><dd>{selected.bankTransfer.iban}</dd></dl>
      {Array.isArray(selected.bankTransfer.reports) && selected.bankTransfer.reports.length > 0 && <div><h3>{t('Comunicações do participante', 'Participant reports')}</h3><ul>{selected.bankTransfer.reports.map((report, index) => <li key={index}>{report.at ? new Date(report.at).toLocaleString(en ? 'en-GB' : 'pt-PT', { timeZone:'Europe/Lisbon' }) : ''}{report.note ? ` · ${report.note}` : ` · ${t('Transferência comunicada', 'Transfer reported')}`}</li>)}</ul></div>}
      {selected.bankTransfer.confirmation && <p>{t('Movimento confirmado', 'Confirmed bank entry')}: {selected.bankTransfer.confirmation.creditReference} · {selected.bankTransfer.confirmation.bookingDate}</p>}
      {!mayReview(selected) ? <p>{selected.status === 'paid' ? t('Pagamento confirmado. Este pedido não permite uma nova validação.', 'Payment confirmed. This order cannot be validated again.') : t('Este pedido não está disponível para validação.', 'This order is not available for validation.')}</p> : <form onSubmit={approve}>
        {attempt?.state === 'ambiguous' && <p>{t('Os dados da tentativa anterior foram conservados. Após atualizar a lista, só será repetida essa mesma decisão.', 'The previous attempt details were retained. After refreshing the list, only that same decision can be repeated.')}</p>}
        <fieldset disabled={blocked || Boolean(attempt)}><legend>{t('Dados do crédito efetivamente recebido', 'Actual bank credit details')}</legend>
          <div className="admin-transfers__field">
            <label htmlFor="transfer-credit-amount">{t('Montante creditado (€)', 'Credited amount (€)')}</label>
            <input id="transfer-credit-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="95,00" required aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? 'transfer-amount-error' : undefined} />
            {fieldErrors.amount && <small id="transfer-amount-error" className="admin-transfers__field-error">{fieldErrors.amount}</small>}
          </div>
          <div className="admin-transfers__field">
            <label htmlFor="transfer-credit-date">{t('Data do crédito bancário', 'Bank credit date')}</label>
            <input id="transfer-credit-date" type="date" min={createdDay || undefined} max={today} value={bookingDate} onChange={event => setDate(event.target.value)} required aria-invalid={Boolean(fieldErrors.date)} aria-describedby={`transfer-date-help${fieldErrors.date ? ' transfer-date-error' : ''}`} />
            <small id="transfer-date-help">{t('Data efetiva em que o valor entrou na conta.', 'The date the funds were actually credited to the account.')}</small>
            {fieldErrors.date && <small id="transfer-date-error" className="admin-transfers__field-error">{fieldErrors.date}</small>}
          </div>
          <div className="admin-transfers__field">
            <label htmlFor="transfer-credit-reference">{t('Referência do movimento no extrato', 'Statement entry reference')}</label>
            <input id="transfer-credit-reference" value={creditReference} minLength={3} maxLength={80} onChange={event => setReference(event.target.value)} required aria-invalid={Boolean(fieldErrors.reference)} aria-describedby={`transfer-reference-help${fieldErrors.reference ? ' transfer-reference-error' : ''}`} />
            <small id="transfer-reference-help">{t('Copie a referência real do extrato: 3 a 80 caracteres, começando por letra ou número. Aceita letras sem acentos, números, espaços e / . _ : -.', 'Copy the actual statement reference: 3–80 characters, starting with a letter or number. Unaccented letters, numbers, spaces and / . _ : - are accepted.')}</small>
            {fieldErrors.reference && <small id="transfer-reference-error" className="admin-transfers__field-error">{fieldErrors.reference}</small>}
          </div>
          <div className="admin-transfers__field">
            <label htmlFor="transfer-credit-note">{t('Observação interna (opcional)', 'Internal note (optional)')}</label>
            <textarea id="transfer-credit-note" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} aria-invalid={Boolean(fieldErrors.reason)} aria-describedby={fieldErrors.reason ? 'transfer-note-error' : undefined} />
            {fieldErrors.reason && <small id="transfer-note-error" className="admin-transfers__field-error">{fieldErrors.reason}</small>}
          </div>
        </fieldset>
        {complete && <p>{t('Crédito a validar', 'Credit to validate')}: <strong>{money(amountCents)}</strong> · {bookingDate} · {normalizedReference}</p>}
        <label className="admin-transfers__confirmation"><input type="checkbox" checked={creditConfirmed} disabled={blocked} onChange={event => setConfirmed(event.target.checked)} />{t('Conferi o crédito efetivo na conta e a correspondência do montante, data e movimento com este pedido.', 'I checked the actual bank credit and matched its amount, date and statement entry to this order.')}</label>
        <p>{t('A validação confirma o pagamento, atualiza a inscrição e inicia a faturação correspondente.', 'Validation confirms payment, updates registration and starts the corresponding invoicing.')}</p>
        {(!complete || !creditConfirmed) && <p id="transfer-validation-hint" aria-live="polite">{!complete
          ? t('Preencha os dados do crédito e corrija os campos assinalados para poder validar.', 'Complete the credit details and correct the marked fields to enable validation.')
          : t('Assinale a confirmação do crédito efetivo para poder validar.', 'Confirm that the funds were actually credited to enable validation.')}</p>}
        <button type="submit" disabled={blocked || !complete || !creditConfirmed} aria-describedby={!complete || !creditConfirmed ? 'transfer-validation-hint' : undefined}>{posting ? t('A validar…', 'Validating…') : t('Validar crédito e confirmar pagamento', 'Validate credit and confirm payment')}</button>
      </form>}
    </section>}
  </main>;
}
