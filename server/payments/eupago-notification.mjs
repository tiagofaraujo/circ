import { createHash, timingSafeEqual } from 'node:crypto';
import { EupagoError } from './eupago-sandbox.mjs';

function amountInCents(value) {
  if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,2}0{0,3})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}
const digest = value => createHash('sha256').update(value).digest();

// Pure validation only; NOT a public route. Receives a server-loaded persisted attempt.
// A valid notification is a reconciliation trigger, never authorization to grant access.
export function validateSandboxNotification(params, attempt, { apiKey, channel }) {
  const fail = () => { throw new EupagoError('invalid-notification'); };
  if (!(params instanceof URLSearchParams) || typeof apiKey !== 'string' || !apiKey
    || typeof channel !== 'string' || !channel || attempt?.environment !== 'sandbox'
    || attempt.currency !== 'EUR' || !Number.isSafeInteger(attempt.amountCents)
    || attempt.amountCents <= 0) fail();
  const required = ['chave_api', 'canal', 'referencia', 'identificador', 'valor', 'transacao', 'mp'];
  if (required.some(key => params.getAll(key).length !== 1)) fail();
  const suppliedKey = params.get('chave_api');
  if (suppliedKey.length > 200 || !timingSafeEqual(digest(suppliedKey), digest(apiKey))) fail();
  if (params.get('canal') !== channel || params.get('referencia') !== attempt.reference
    || params.get('identificador') !== attempt.identifier
    || amountInCents(params.get('valor')) !== attempt.amountCents
    || !/^\d{1,30}$/.test(params.get('transacao'))
    || !['multibanco', 'mbway'].includes(attempt.method)
    || params.get('mp') !== (attempt.method === 'multibanco' ? 'PC:PT' : 'MW:PT')) fail();
  if (attempt.entity && (params.getAll('entidade').length !== 1 || params.get('entidade') !== attempt.entity)) fail();
  return { identifier: attempt.identifier, transactionId: params.get('transacao'),
    amountCents: attempt.amountCents, environment: 'sandbox', requiresReconciliation: true };
}
