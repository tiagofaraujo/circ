const BASE = 'https://clientes.eupago.pt/clientes/rest_api';

export class EupagoLiveError extends Error {
  constructor(code, uncertain = false, diagnostic = null) {
    super(`eupago-live/${code}`);
    this.code = code;
    this.uncertain = uncertain;
    this.diagnostic = typeof diagnostic === 'string' ? diagnostic : null;
  }
}
const isReference = value => typeof value === 'string' && /^\d{1,30}$/.test(value);
const isIdentifier = value => typeof value === 'string' && /^circ_live_[a-f0-9]{32}$/.test(value);
const invalid = () => { throw new EupagoLiveError('invalid-input'); };

export function createEupagoLive({ apiKey, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new EupagoLiveError('not-configured');
  async function post(path, fields, creating = false) {
    let response, data;
    try {
      response = await fetchImpl(`${BASE}/${path}`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `ApiKey ${apiKey}` },
        body: JSON.stringify({ ...fields, chave: apiKey }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network';
      throw new EupagoLiveError('provider-unavailable', creating, reason);
    }
    try { data = await response.json(); }
    catch { throw new EupagoLiveError('provider-unavailable', creating, response.ok ? 'invalid-json' : `http-${response.status}`); }
    if (!response.ok) throw new EupagoLiveError('provider-unavailable', creating, `http-${response.status}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new EupagoLiveError('provider-unavailable', creating, 'invalid-response');
    if (data.sucesso !== true) throw new EupagoLiveError('provider-rejected', creating, 'rejected');
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
      else { fields.alias = phone; fields.descricao = 'CIRC 2027'; }
      const data = await post(`${method}/create`, fields, true);
      const reference = String(data.referencia ?? '');
      const entity = data.entidade == null ? null : String(data.entidade);
      if (!isReference(reference) || (method === 'multibanco' && !/^\d{5}$/.test(entity || ''))) {
        throw new EupagoLiveError('invalid-provider-response', true, 'invalid-reference');
      }
      return { environment: 'production', method, identifier, amountCents, currency, reference, entity, status: 'pending' };
    },
    async inspectReference(attempt) {
      if (attempt?.environment !== 'production' || !isReference(attempt.reference)
        || !isIdentifier(attempt.identifier)
        || (attempt.entity != null && !/^\d{5}$/.test(attempt.entity))) invalid();
      const data = await post('multibanco/info', { referencia: attempt.reference, ...(attempt.entity ? { entidade: attempt.entity } : {}) });
      if (String(data.referencia) !== attempt.reference || data.identificador !== attempt.identifier
        || (attempt.entity && String(data.entidade) !== attempt.entity)) throw new EupagoLiveError('reference-mismatch');
      const raw = data.estado_referencia ?? data.estado;
      const state = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
      return {
        reference: attempt.reference,
        providerState: ['pendente','pago','paga','expirado','cancelado','transferida','erro'].includes(state) ? state : 'unknown',
      };
    },
  };
}
