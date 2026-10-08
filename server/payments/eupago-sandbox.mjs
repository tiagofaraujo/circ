// Server-only transport. Intentionally has no production hostname or automatic retries.
// Callers MUST persist an attempt before creating a reference and reconcile uncertain outcomes.
const BASE = 'https://sandbox.eupago.pt/clientes/rest_api';
export class EupagoError extends Error {
  constructor(code, uncertain = false, diagnostic) {
    super(`eupago/${code}`); this.code = code; this.uncertain = uncertain;
    this.diagnostic = safeProviderDiagnostic(diagnostic);
  }
}
export function safeProviderDiagnostic(value) {
  return typeof value === 'string' && /^provider\/(?:unknown|timeout|network|invalid-json|invalid-response|invalid-reference|invalid-entity|rejected(?:\/code--?\d{1,4})?|http-[1-5]\d{2}(?:\/code--?\d{1,4})?)$/.test(value) ? value : null;
}
function responseCode(data) {
  const value = data?.estado;
  const code = Number.isSafeInteger(value) && Math.abs(value) <= 9999 ? String(value)
    : typeof value === 'string' && /^-?\d{1,4}$/.test(value) ? value : null;
  return code === null ? '' : `/code-${code}`;
}
const invalid = () => { throw new EupagoError('invalid-input'); };
const isReference = value => typeof value === 'string' && /^\d{1,30}$/.test(value);
const isIdentifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);

export function createEupagoSandbox({ apiKey, environment, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (environment !== 'sandbox' || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new EupagoError('sandbox-not-configured');
  }
  async function post(path, fields, creating = false) {
    let response, data;
    try {
      // workerd rejects redirect: error. Manual returns 3xx, rejected by the !ok check.
      response = await fetchImpl(`${BASE}/${path}`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `ApiKey ${apiKey}` },
        body: JSON.stringify({ ...fields, chave: apiKey }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Never copy provider bodies, URLs or transport errors into logs/client responses.
      const reason = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network';
      throw new EupagoError('provider-unavailable', creating, `provider/${reason}`);
    }
    try { data = await response.json(); }
    catch { throw new EupagoError('provider-unavailable', creating, response.ok ? 'provider/invalid-json' : `provider/http-${response.status}`); }
    if (!response.ok) throw new EupagoError('provider-unavailable', creating, `provider/http-${response.status}${responseCode(data)}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new EupagoError('provider-unavailable', creating, 'provider/invalid-response');
    if (data.sucesso !== true) throw new EupagoError('provider-rejected', creating, `provider/rejected${responseCode(data)}`);
    return data;
  }
  return {
    async createPayment({ method, identifier, amountCents, currency, phone }) {
      if (!['multibanco', 'mbway'].includes(method) || !isIdentifier(identifier)
        || currency !== 'EUR' || !Number.isSafeInteger(amountCents)
        || amountCents < (method === 'multibanco' ? 100 : 50) || amountCents > 9999900) invalid();
      if (method === 'mbway' && (typeof phone !== 'string' || !/^9\d{8}$/.test(phone))) invalid();
      const fields = { id: identifier, valor: amountCents / 100, failOver: '0' };
      if (method === 'multibanco') fields.per_dup = 0;
      else { fields.alias = phone; fields.descricao = 'CIRC 2027 - TESTE'; }
      const data = await post(`${method}/create`, fields, true);
      const reference = String(data.referencia ?? '');
      const entity = data.entidade == null ? null : String(data.entidade);
      if (!isReference(reference) || (method === 'multibanco' && !/^\d{5}$/.test(entity || ''))) {
        throw new EupagoError('invalid-provider-response', true, !isReference(reference) ? 'provider/invalid-reference' : 'provider/invalid-entity');
      }
      // A successful creation is NOT evidence of payment.
      return { environment: 'sandbox', method, identifier, amountCents, currency,
        reference, entity, status: 'pending' };
    },
    async inspectReference(attempt) {
      if (attempt?.environment !== 'sandbox' || !isReference(attempt.reference)
        || !isIdentifier(attempt.identifier)
        || (attempt.entity != null && !/^\d{5}$/.test(attempt.entity))) invalid();
      const data = await post('multibanco/info', { referencia: attempt.reference,
        ...(attempt.entity ? { entidade: attempt.entity } : {}) });
      if (String(data.referencia) !== attempt.reference || data.identificador !== attempt.identifier
        || (attempt.entity && String(data.entidade) !== attempt.entity)) {
        throw new EupagoError('reference-mismatch');
      }
      // The documented info response has no payment amount/currency/transaction proof.
      // Expose only a bounded status hint. It must never confirm an inscription by itself.
      const paymentState = data.estado_referencia ?? data.estado;
      const state = typeof paymentState === 'string' ? paymentState.trim().toLowerCase() : null;
      const providerState = ['pendente', 'pago', 'paga', 'expirado', 'cancelado', 'transferida', 'erro'].includes(state)
        ? state : 'unknown';
      // Numeric response codes are not documented payment states. Never infer paid/pending.
      const providerStateCode = Number.isSafeInteger(data.estado) && Math.abs(data.estado) <= 9999
        ? data.estado : typeof data.estado === 'string' && /^-?\d{1,4}$/.test(data.estado.trim()) ? Number(data.estado.trim()) : null;
      return { reference: attempt.reference, providerState, providerStateCode, requiresReconciliation: true };
    },
  };
}
