import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const TARGET_EMAIL = 'araujotiagofc@gmail.com';
const CONFIRMATION = 'LIBERTAR NOVA INSCRICAO';
const ID = /^circ-2027-[A-Za-z0-9_-]{1,128}$/;
const STAMP = /^[a-f0-9]{64}$/i;
const SUPPORT_CODE = /^release-(parse|identity|begin|lookup|inspect|prepare|commit)-(invalid|network|timeout|response|unexpected|http-(400|401|403|404|408|429|500|502|503|504))$/;
const email = value => String(value || '').trim().toLowerCase();
const statuses = {
  paid: 'Pago', pending: 'Pendente', awaiting_confirmation: 'A aguardar confirmação',
  refunded: 'Reembolso registado', cancelled: 'Cancelado', review_required: 'Em conferência',
  creating: 'Em processamento', creation_unknown: 'Criação por confirmar', creation_failed: 'Criação recusada',
};
const definitive = new Set(['invalid-request', 'confirmation-required', 'sign-in-required', 'invalid-session',
  'admin-required', 'invalid-origin', 'registration-not-found', 'registration-release-blocked', 'registration-changed']);
const errors = {
  'sign-in-required': 'Inicie sessão na conta de administração antes de continuar.',
  'invalid-session': 'A sessão expirou. Volte a entrar na conta de administração.',
  'admin-required': 'Esta ação está reservada à conta de administração.',
  'registration-not-found': 'Esta inscrição já não foi encontrada. Atualize a lista para conferir o estado da conta.',
  'registration-release-blocked': 'O estado desta inscrição não permite libertar uma nova inscrição. Confira os pagamentos e documentos antes de continuar.',
  'registration-changed': 'A inscrição mudou desde a conferência. Prepare uma nova conferência antes de continuar.',
};

const blockedReasons = new Map([
  ['registration-state', 'Os dados da inscrição ativa não são compatíveis com a libertação.'],
  ['profile-mismatch', 'O perfil associado à inscrição não corresponde à conta que pediu a libertação.'],
  ['open-payment', 'Ainda existe um pedido de pagamento em aberto. Confirme primeiro o seu estado.'],
  ['fiscal-pending', 'A emissão da fatura-recibo de um pagamento ainda está pendente.'],
  ['linked-order', 'Existe um pedido associado à inscrição que precisa de conferência.'],
  ['document-mismatch', 'Os pagamentos e as faturas-recibo associados não coincidem.'],
  ['archive-mismatch', 'O histórico da inscrição precisa de conferência antes da libertação.'],
  ['closed-attempt-unverified', 'O encerramento sem pagamento de um pedido associado ainda não está confirmado.'],
]);

function errorMessage(issue, fallback) {
  if (issue.code === 'registration-release-blocked' && issue.status === 409) {
    return blockedReasons.get(issue.reason) || errors[issue.code];
  }
  const message = errors[issue.code] || fallback;
  if (issue.code === 'registration-release-unavailable' && issue.status === 503
    && typeof issue.diagnostic === 'string' && SUPPORT_CODE.test(issue.diagnostic)) {
    return `${message} Código de apoio ${issue.diagnostic}.`;
  }
  return message;
}

function validPreview(value, requestedId) {
  return value?.allowed === true && value.registrationId === requestedId && email(value.email) === TARGET_EMAIL
    && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 300
    && Number.isSafeInteger(value.amountCents) && value.amountCents > 0 && value.currency === 'EUR'
    && Object.prototype.hasOwnProperty.call(statuses, value.paymentStatus) && STAMP.test(value.stamp || '')
    && Array.isArray(value.documentNumbers) && value.documentNumbers.length <= 100
    && value.documentNumbers.every(number => typeof number === 'string' && number.trim().length > 0 && number.length <= 200);
}

export default function RegistrationRelease({ registration, onReleased }) {
  const { user, isAdmin } = useAuth();
  const eligible = isAdmin === true && Boolean(user?.uid) && typeof user?.getIdToken === 'function'
    && ID.test(registration?.id || '') && email(registration?.participantEmail) === TARGET_EMAIL;
  const scope = `${user?.uid || ''}:${registration?.id || ''}:${eligible}`;
  const [preview, setPreview] = useState(null), [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState('idle'), [error, setError] = useState(''), [released, setReleased] = useState(null);
  const working = useRef(null), attempt = useRef(null), generation = useRef(0), previewController = useRef(null);
  const callback = useRef(onReleased); callback.current = onReleased;

  useEffect(() => {
    generation.current += 1;
    attempt.current = null; working.current = null;
    setPreview(null); setConfirmed(false); setPhase('idle'); setError(''); setReleased(null);
    return () => { generation.current += 1; previewController.current?.abort(); };
  }, [scope]);

  async function api(registrationId, body, signal) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/admin/registrations/${encodeURIComponent(registrationId)}/release`, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('invalid-response'); }
    if (!response.ok) throw Object.assign(new Error('request-failed'), {
      code: data.error, reason: data.reason, diagnostic: data.diagnostic, status: response.status,
    });
    return data;
  }

  async function prepare() {
    if (!eligible || working.current || attempt.current || phase === 'done') return;
    const operation = Symbol('preview'), currentGeneration = generation.current;
    working.current = operation; setPhase('preparing'); setError(''); setPreview(null); setConfirmed(false);
    const controller = new AbortController(); previewController.current = controller;
    try {
      const result = await api(registration.id, undefined, controller.signal);
      if (controller.signal.aborted || generation.current !== currentGeneration) return;
      if (!validPreview(result, registration.id)) throw new Error('invalid-preview');
      setPreview({ ...result, documentNumbers: [...result.documentNumbers] }); setPhase('review');
    } catch (issue) {
      if (controller.signal.aborted || generation.current !== currentGeneration) return;
      setPhase('idle'); setError(errorMessage(issue, 'Não foi possível conferir os dados desta inscrição. Nenhuma libertação foi pedida.'));
    } finally { if (working.current === operation) working.current = null; }
  }

  async function release(event) {
    event.preventDefault();
    if (!eligible || working.current || !confirmed || !preview || !validPreview(preview, registration.id)
      || !['review', 'uncertain'].includes(phase)) return;
    const operation = Symbol('release'), currentGeneration = generation.current;
    const original = attempt.current || { registrationId: preview.registrationId,
      preview: { ...preview, documentNumbers: [...preview.documentNumbers] },
      payload: { stamp: preview.stamp, confirmation: CONFIRMATION } };
    attempt.current = original;
    working.current = operation; setPhase('releasing'); setError(''); setConfirmed(false);
    let result, completed = false;
    try {
      // An uncertain response is recovered only by replaying this frozen stamp.
      // The server resolves its archive before considering the active record.
      result = await api(original.registrationId, original.payload);
      if (generation.current !== currentGeneration) return;
      if (result?.released !== true || result.registrationId !== original.registrationId
        || typeof result.archiveId !== 'string' || !result.archiveId.trim() || result.archiveId.length > 500) throw new Error('invalid-response');
      completed = true; setReleased(result); setPhase('done');
    } catch (issue) {
      if (generation.current !== currentGeneration) return;
      if (definitive.has(issue.code)) {
        attempt.current = null; setPreview(null); setPhase('idle');
        setError(errorMessage(issue, 'A libertação foi recusada. Prepare uma nova conferência antes de continuar.'));
      } else {
        setPreview(original.preview); setPhase('uncertain');
        setError(errorMessage(issue, 'O resultado da libertação não foi confirmado. Conserve esta conferência e consulte o resultado da mesma libertação antes de iniciar outra.'));
      }
    } finally { if (working.current === operation) working.current = null; }
    if (completed && generation.current === currentGeneration && typeof callback.current === 'function') {
      // A list-refresh callback cannot turn a confirmed archive into a retry.
      try { Promise.resolve(callback.current(result)).catch(() => {}); } catch { /* The confirmed result remains visible. */ }
    }
  }

  if (!eligible) return null;
  const busy = phase === 'preparing' || phase === 'releasing';
  const uncertain = phase === 'uncertain';
  const money = value => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value / 100);
  return <div className="admin-refund admin-registration-release">
    {phase === 'idle' || phase === 'preparing' ? <button type="button" className="admin-exception" disabled={busy} onClick={prepare}>
      {busy ? 'A conferir inscrição…' : 'Preparar nova inscrição para esta conta'}
    </button> : null}
    {preview && phase !== 'done' && <form onSubmit={release} aria-label={`Libertar nova inscrição de ${preview.email}`}>
      <p><strong>Conferência da inscrição atual</strong></p>
      <dl><dt>Titular</dt><dd>{preview.name}</dd><dt>Email</dt><dd>{preview.email}</dd>
        <dt>Montante registado</dt><dd>{money(preview.amountCents)}</dd><dt>Estado do pagamento</dt><dd>{statuses[preview.paymentStatus]}</dd>
        <dt>Documentos existentes</dt><dd>{preview.documentNumbers.length ? preview.documentNumbers.join(' · ') : 'Sem documentos indicados nesta conferência'}</dd></dl>
      <p>Os pagamentos e as faturas-recibo existentes são conservados. Esta ação retira a inscrição atual da lista ativa e permite iniciar outra inscrição; o novo valor terá de ser pago.</p>
      <p>O perfil e as validações de elegibilidade da conta são mantidos.</p>
      {uncertain && <p>Voltará a ser enviada a mesma confirmação. Se a libertação já foi concluída, será consultado o respetivo arquivo, sem retirar uma nova inscrição entretanto criada.</p>}
      <label className="admin-refund__ack"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        {uncertain ? 'Confirmo que pretendo concluir ou consultar esta mesma libertação, com os dados conferidos acima.' : 'Conferi os dados e autorizo retirar esta inscrição ativa para permitir uma nova inscrição, com um novo pagamento.'}
      </label>
      <button type="submit" disabled={busy || !confirmed}>{busy ? 'A confirmar libertação…' : uncertain ? 'Consultar resultado da libertação' : 'Libertar nova inscrição'}</button>
    </form>}
    {released && <p role="status">Inscrição libertada. Os pagamentos e documentos anteriores foram conservados. A conta pode iniciar uma nova inscrição e pagar o novo valor.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
