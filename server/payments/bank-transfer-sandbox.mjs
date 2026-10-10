// Administrative rehearsal only: no bank API, IBAN, Eupago or production writes.
import { createHash } from 'node:crypto';
import { CHECKOUT_UUID } from './checkout-sandbox-store.mjs';
export const MAX_PROOF_BYTES = 500 * 1024;
export const BANK_TRANSFER_ERRORS = new Set(['transfer-invalid-proof', 'transfer-proof-too-large', 'transfer-proof-limit',
  'transfer-invalid-state', 'transfer-stale-review', 'transfer-proof-required', 'transfer-reason-required',
  'transfer-credit-required', 'transfer-amount-mismatch', 'transfer-credit-used', 'transfer-invalid-credit']);
const fail = code => { throw new Error(`checkout/${code}`); };
const digest = value => createHash('sha256').update(value).digest('hex');
const exact = (body, keys) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) fail('invalid-request');
};
export function prepareBankTransfer(order, sessionId, sequence) {
  return { ...order, identifier: `circ_transfer_${sessionId.replaceAll('-', '')}_${sequence}`, status: 'pending',
    bankTransfer: { simulated: true, status: 'awaiting_proof', memo: `CIRC-TESTE-${sessionId}-${sequence}`,
      proofs: [], decisions: [], createdAt: order.createdAt } };
}
export function validateTransferProof(body) {
  exact(body, ['id', 'expectedProofId', 'filename', 'mimeType', 'base64', 'sampleAcknowledged']);
  if (!CHECKOUT_UUID.test(body.id || '') || body.sampleAcknowledged !== true
    || (body.expectedProofId !== null && !CHECKOUT_UUID.test(body.expectedProofId || ''))) fail('transfer-invalid-proof');
  const filename = body.filename;
  if (typeof filename !== 'string' || filename.length > 120 || !/^[\p{L}\p{N} _().-]+\.(pdf|png|jpe?g)$/iu.test(filename)
    || /\.\.|[\u0000-\u001f\u007f]/.test(filename)) fail('transfer-invalid-proof');
  if (typeof body.base64 !== 'string') fail('transfer-invalid-proof');
  if (body.base64.length > Math.ceil(MAX_PROOF_BYTES / 3) * 4) fail('transfer-proof-too-large');
  const bytes = Buffer.from(body.base64, 'base64');
  if (!bytes.length || bytes.toString('base64') !== body.base64) fail('transfer-invalid-proof');
  if (bytes.length > MAX_PROOF_BYTES) fail('transfer-proof-too-large');
  const extension = filename.split('.').pop().toLowerCase();
  const valid = body.mimeType === 'application/pdf' && extension === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-'
      && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))
    || body.mimeType === 'image/png' && extension === 'png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    || body.mimeType === 'image/jpeg' && ['jpg', 'jpeg'].includes(extension) && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  // Magic/MIME checks are not malware scanning. Files are private attachments,
  // never rendered inline, parsed, OCRed or sent to an external scanner.
  if (!valid) fail('transfer-invalid-proof');
  return { id: body.id, filename, mimeType: body.mimeType, size: bytes.length, sha256: digest(bytes), base64: body.base64 };
}
function transferOrder(record, orderId, actor) {
  const order = record?.orders?.find(o => o.id === orderId);
  if (record?.kind !== 'checkout-test' || record.environment !== 'sandbox' || record.eventId !== 'circ-2027'
    || record.owner !== actor || order?.environment !== 'sandbox' || order.method !== 'bank_transfer'
    || order.bankTransfer?.simulated !== true) fail('transfer-invalid-state');
  return order;
}
const latest = order => order.bankTransfer.proofs.at(-1)?.id || null;
const updatedRecord = (record, order) => ({ ...record, orders: record.orders.map(o => o.id === order.id ? order : o) });
export async function actOnBankTransfer({ store, saved, orderId, action, body, actor, now, applyEntitlements }) {
  const r = saved.record, order = transferOrder(r, orderId, actor), transfer = order.bankTransfer;
  if (action === 'proof-download') {
    exact(body, ['proofId']);
    const meta = transfer.proofs.find(p => p.id === body.proofId);
    if (!meta) fail('not-found');
    const proof = await store.readBankProof(r.id, orderId, meta.id);
    if (!proof || proof.sha256 !== meta.sha256 || proof.mimeType !== meta.mimeType || proof.size !== meta.size
      || digest(Buffer.from(proof.base64, 'base64')) !== meta.sha256) fail('transfer-invalid-proof');
    const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[meta.mimeType];
    return new Response(Buffer.from(proof.base64, 'base64'), { headers: {
      'Content-Type': meta.mimeType, 'Content-Disposition': `attachment; filename="comprovativo-teste-${meta.id}.${ext}"`,
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
    } });
  }
  if (action === 'proof') {
    const proof = validateTransferProof(body);
    const previous = transfer.proofs.find(p => p.id === proof.id);
    if (previous) {
      if (previous.sha256 !== proof.sha256 || previous.filename !== proof.filename) fail('idempotency-conflict');
      return saved;
    }
    if (order.status !== 'pending' || !['awaiting_proof', 'under_review', 'rejected'].includes(transfer.status)) fail('transfer-invalid-state');
    if (body.expectedProofId !== latest(order)) fail('transfer-stale-review');
    if (transfer.proofs.length >= 5) fail('transfer-proof-limit');
    const { base64, ...meta } = proof;
    const next = { ...order, bankTransfer: { ...transfer, status: 'under_review',
      proofs: [...transfer.proofs, { ...meta, uploadedAt: now, uploadedBy: actor }], updatedAt: now } };
    // The proof and its metadata reference are committed atomically.
    return store.attachBankProof(r.id, updatedRecord(r, next), saved.version,
      { ...proof, orderId, sessionId: r.id, owner: actor, environment: 'sandbox', kind: 'bank-proof-test' });
  }
  if (action !== 'review') fail('invalid-request');
  exact(body, ['id', 'decision', 'proofId', 'reason', 'proofReviewed', 'creditConfirmed', 'amount', 'creditReference', 'bookingDate', 'sandboxAcknowledged']);
  if (!CHECKOUT_UUID.test(body.id || '') || !['approve', 'reject', 'cancel'].includes(body.decision)
    || body.sandboxAcknowledged !== true) fail('invalid-request');
  const requestHash = digest(JSON.stringify(body));
  const previous = transfer.decisions.find(d => d.id === body.id);
  if (previous) {
    if (previous.requestHash !== requestHash) fail('idempotency-conflict');
    return saved;
  }
  if (order.status !== 'pending' || transfer.decisions.length >= 20) fail('transfer-invalid-state');
  if (body.proofId !== latest(order)) fail('transfer-stale-review');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason)) fail('transfer-reason-required');
  if (body.decision !== 'approve' && reason.length < 5) fail('transfer-reason-required');
  if (body.decision !== 'cancel' && (transfer.status !== 'under_review' || !latest(order))) fail('transfer-proof-required');
  const decision = { id: body.id, action: body.decision, proofId: body.proofId, reason, actor, at: now, requestHash };
  if (body.decision !== 'approve') {
    const next = { ...order, status: body.decision === 'cancel' ? 'closed' : 'pending', bankTransfer: {
      ...transfer, status: body.decision === 'cancel' ? 'cancelled' : 'rejected',
      decisions: [...transfer.decisions, decision], updatedAt: now } };
    return store.replace(r.id, updatedRecord(r, next), saved.version);
  }
  if (body.proofReviewed !== true || body.creditConfirmed !== true) fail('transfer-credit-required');
  if (typeof body.amount !== 'string' || !/^\d{1,5}[.,]\d{2}$/.test(body.amount)) fail('transfer-amount-mismatch');
  const [whole, fraction] = body.amount.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction);
  if (cents !== order.amountCents || cents !== order.quote.amountCents || order.currency !== 'EUR') fail('transfer-amount-mismatch');
  const creditReference = typeof body.creditReference === 'string' ? body.creditReference.trim().toUpperCase() : '';
  const date = typeof body.bookingDate === 'string' ? body.bookingDate : '';
  if (!/^TESTE-[A-Z0-9-]{3,64}$/.test(creditReference) || !/^20\d{2}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    || date > now.slice(0, 10)) fail('transfer-invalid-credit');
  const creditKey = digest(creditReference);
  if (await store.bankCreditExists(creditKey)) fail('transfer-credit-used');
  const registration = applyEntitlements(r, order, now);
  if (!registration) fail('review-required');
  const next = { ...order, status: 'confirmed', bankTransfer: { ...transfer, status: 'confirmed',
    confirmation: { simulated: true, confirmedBy: actor, confirmedAt: now, amountCents: cents, currency: 'EUR', creditReference, bookingDate: date, proofId: body.proofId },
    decisions: [...transfer.decisions, decision], updatedAt: now } };
  // Unique simulated bank entry, confirmation and test entitlements: one commit.
  return store.confirmBankTransfer(r.id, { ...updatedRecord(r, next), registration }, saved.version,
    { key: creditKey, owner: actor, sessionId: r.id, orderId, environment: 'sandbox', kind: 'bank-credit-test', recordedAt: now });
}
