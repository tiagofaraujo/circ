import React, { useRef, useState } from 'react';
import { canRecordRegistrationRefund, lisbonToday, recordRegistrationRefund } from '../auth/refundStore';

export default function RegistrationRefund({ user, registration }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(lisbonToday);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);
  const eligible = canRecordRegistrationRefund(registration);
  if (registration.payment?.status === 'refunded') return <small>Reembolso registado{registration.isTest === false ? ' · Regularização fiscal por conferir' : ''}</small>;
  if (!eligible && !open) return null;

  async function submit(event) {
    event.preventDefault();
    if (!eligible || working.current || !completed || reason.trim().length < 5 || reference.trim().length < 3) return;
    if (!window.confirm(`Registar o reembolso total já efetuado de ${(registration.payment.amountCents / 100).toFixed(2)} € e cancelar esta inscrição? A regularização fiscal terá de ser conferida.`)) return;
    working.current = true; setBusy(true); setError('');
    try {
      await recordRegistrationRefund(user, registration, { reason, reference, date, completed });
      setOpen(false);
    } catch {
      setError('Não foi possível confirmar o registo do reembolso. Atualize a lista antes de repetir; o pagamento ou a inscrição podem ter mudado.');
    } finally { working.current = false; setBusy(false); }
  }
  return <div className="admin-refund">
    {!open ? <button type="button" className="admin-exception" onClick={() => setOpen(true)}>Registar reembolso efetuado</button> : <form onSubmit={submit} aria-label={`Reembolso de ${registration.participantName || registration.participantEmail}`}>
      <p><strong>Reembolso total já efetuado</strong></p>
      <p>O registo cancela esta inscrição. Não devolve dinheiro nem emite documentos fiscais.</p>
      <label>Motivo<textarea value={reason} maxLength={500} required minLength={5} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <label>Referência do reembolso<input value={reference} maxLength={100} required minLength={3} disabled={busy} onChange={e => setReference(e.target.value)} /></label>
      <label>Data do reembolso<input type="date" value={date} required max={lisbonToday()} disabled={busy} onChange={e => setDate(e.target.value)} /></label>
      <label className="admin-refund__ack"><input type="checkbox" checked={completed} disabled={busy} onChange={e => setCompleted(e.target.checked)} />Confirmo que o valor total já foi devolvido.</label>
      {error && <p role="alert">{error}</p>}
      {!eligible && <p>O estado da inscrição mudou. Atualize a lista para conferir o registo.</p>}
      <button type="submit" disabled={busy || !eligible || !completed || reason.trim().length < 5 || reference.trim().length < 3 || !date}>{busy ? 'A registar…' : 'Guardar registo do reembolso'}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>Fechar</button>
    </form>}
  </div>;
}
