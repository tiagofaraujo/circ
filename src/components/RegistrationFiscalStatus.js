import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const labels = { issued: 'Fatura-recibo emitida', pending: 'Faturação pendente', pending_authorization: 'Ligação TOConline necessária',
  issuing: 'Emissão em processamento — não repetir', outcome_unknown: 'Resultado fiscal por confirmar — não repetir', review_required: 'Faturação requer conferência' };

export default function RegistrationFiscalStatus({ registration }) {
  const { user, isAdmin } = useAuth();
  const pendingId = registration.fiscalPendingOrderId;
  const id = pendingId || registration.payment?.orderId;
  if (!isAdmin || registration.isTest === true || registration.testMode === true
    || (!pendingId && !['multibanco', 'bank_transfer'].includes(registration.payment?.method))) return null;
  if (!UUID.test(id || '')) return pendingId ? <small>Referência do pedido fiscal por conferir</small>
    : registration.documentCount > 0 ? <small>Documento fiscal emitido</small> : null;
  return <RegistrationFiscalOrder key={id} id={id} user={user} registration={registration}
    supplementary={Boolean(pendingId && pendingId !== registration.payment?.orderId)} />;
}

function RegistrationFiscalOrder({ id, user, registration, supplementary }) {
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const working = useRef(false);

  async function request(resume = false) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/checkout/live/orders/${id}${resume ? '/fiscal-resume' : ''}`, {
      method: resume ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(resume ? { 'Content-Type': 'application/json' } : {}) },
      ...(resume ? { body: JSON.stringify({ confirmation: 'RETOMAR FATURACAO AUTORIZADA' }) } : {}),
    });
    const data = await response.json();
    if (!response.ok || data.order?.id !== id || data.order.currency !== 'EUR' || !Number.isSafeInteger(data.order.amountCents) || data.order.amountCents <= 0) throw new Error('unavailable');
    return data.order;
  }
  async function refresh() {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { setOrder(await request()); setAttempted(false); setOpen(false); setConfirmed(false); }
    catch { setError('Não foi possível consultar a faturação. Atualize antes de qualquer nova ação.'); }
    finally { working.current = false; setBusy(false); }
  }
  const authorizationRequired = order?.fiscalStatus === 'pending_authorization';
  const resumable = order?.status === 'paid' && ['pending_authorization', 'pending'].includes(order.fiscalStatus) && order.canResumeFiscal === true;
  async function resume(event) {
    event.preventDefault();
    if (working.current || attempted || !resumable || !confirmed) return;
    working.current = true; setBusy(true); setAttempted(true); setError('');
    try { setOrder(await request(true)); setOpen(false); setConfirmed(false); }
    catch { setError('O resultado da retoma requer consulta. Use «Consultar faturação» antes de outra ação; uma emissão com resultado incerto não pode ser repetida.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <div className="admin-fiscal-status">
    <small>{supplementary ? 'Faturação da compra adicional' : 'Faturação da inscrição original'}</small>
    {!order && !supplementary && registration.documentCount > 0 && <small>Documento fiscal emitido</small>}
    {order && <small role="status">{labels[order.fiscalStatus] || 'Sem emissão fiscal confirmada'}{order.fiscalDocumentNo ? ` · ${order.fiscalDocumentNo}` : ''}</small>}
    <button type="button" onClick={refresh} disabled={busy}>Consultar faturação</button>
    {resumable && <>
      {authorizationRequired ? <p>Renove primeiro a ligação ao TOConline em <Link to="/admin/faturacao">Faturação</Link>.</p> : <p>Emissão ainda não iniciada; confirme para retomar.</p>}
      {!open ? <button type="button" disabled={busy || attempted} onClick={() => setOpen(true)}>Retomar faturação autorizada</button> : <form onSubmit={resume} aria-label="Confirmar retoma da faturação">
        <p>Emitir a fatura-recibo definitiva de <strong>{(order.amountCents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</strong> para este pagamento já confirmado.</p>
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || attempted} />{authorizationRequired ? 'Confirmei a renovação da ligação TOConline e pretendo retomar esta emissão.' : 'Conferi este pagamento confirmado e pretendo retomar a emissão da fatura-recibo.'}</label>
        <button type="submit" disabled={busy || attempted || !confirmed}>Confirmar retoma</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Fechar</button>
      </form>}
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
