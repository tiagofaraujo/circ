import { createToconlineReadonlyApi } from './toconline-readonly.mjs';

// A non-persistent proposal only. No store writes, sales API calls or hard-coded bank IDs.
// The existing OAuth reader confirms the complete server-configured IBAN.
const PREFIX = '/api/fiscal/sandbox/bank-preview/';
const ADMIN = 'circ.chuc@gmail.com';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{12}$/i;
const accountId = value => typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value)
  && Number.isSafeInteger(Number(value));
const reply = (body, status = 200, extra = {}) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff', ...extra,
} });
const providerErrors = new Set(['toconline-not-connected', 'toconline-reauthorize-required',
  'toconline-not-configured', 'invalid-session', 'sign-in-required', 'admin-required']);
const bankStatuses = new Set(['not-found', 'ambiguous', 'iban-mismatch', 'inactive',
  'unavailable', 'invalid-response', 'invalid-configuration']);

export function createToconlineBankPreviewApi({ verify, storeFactory, buildRehearsal,
  now = () => new Date().toISOString(), readonlyApiFactory = createToconlineReadonlyApi }) {
  const readonly = readonlyApiFactory({ verify, now: () => Date.parse(now()) });
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;
    if (request.method !== 'GET') return reply({ error: 'method-not-allowed' }, 405);
    if (url.search) return reply({ error: 'invalid-request' }, 400);
    const match = url.pathname.match(/^\/api\/fiscal\/sandbox\/bank-preview\/sessions\/([^/]+)\/orders\/([^/]+)$/);
    if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return reply({ error: 'not-found' }, 404);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email !== ADMIN || claims.email_verified !== true) return reply({ error: 'admin-required' }, 403);
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: claims.sub });
    let refreshHeaders = {};
    try {
      const [sessionId, orderId] = match.slice(1);
      const saved = await store.read(sessionId);
      if (!saved || saved.record?.owner !== claims.sub) return reply({ error: 'not-found' }, 404);
      const order = saved.record.orders?.find(item => item.id === orderId);
      const existing = saved.record.fiscalRehearsals?.find(item => item.orderId === orderId);
      if (!existing || !['prepared', 'simulated-issued'].includes(existing.status)) return reply({ error: 'not-prepared' }, 409);
      if (order?.method !== 'bank_transfer' || existing.mode !== 'invoice_receipt'
        || existing.liveWritesEnabled !== false) return reply({ error: 'bank-preview-not-applicable' }, 422);
      const draft = buildRehearsal(saved.record, orderId, 'invoice_receipt', existing.date);
      if (existing.fiscalPolicyVersion !== draft.fiscalPolicyVersion
        || existing.pricingPolicyVersion !== draft.pricingPolicyVersion) return reply({ error: 'stale-tax-policy' }, 409);
      if (existing.sourceDigest !== draft.sourceDigest) return reply({ error: 'stale-source' }, 409);
      // Bank-associated previews require positively verified payment-date pricing.
      if (draft.pricingCheck?.status !== 'matches') return reply({ error: 'payment-tariff-review-required' }, 409);
      if (draft.salesDocument.document_type !== 'FR' || draft.salesDocument.payment_mechanism !== 'TR'
        || draft.liveWritesEnabled !== false) return reply({ error: 'bank-preview-not-applicable' }, 422);

      // Invoke the existing fixed, authenticated read-only resource handler in process.
      // Never accepts a bank ID, IBAN, payload or provider URL from the browser.
      const readUrl = new URL('/api/fiscal/toconline/resources', url.origin);
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      if (request.headers.has('Cookie')) headers.set('Cookie', request.headers.get('Cookie'));
      const response = await readonly(new Request(readUrl, { method: 'GET', headers }), env);
      const refreshedCookie = response.headers.get('Set-Cookie');
      if (refreshedCookie?.startsWith('__Host-circ_toc_session=')) refreshHeaders = { 'Set-Cookie': refreshedCookie };
      const data = await response.json();
      if (!response.ok) return reply({ error: providerErrors.has(data?.error) ? data.error : 'billing-bank-read-failed' },
        [401, 403].includes(response.status) ? response.status : 503, refreshHeaders);
      const resource = data.resources?.billingBankAccount;
      if (data.mode !== 'read-only' || data.commercialWritesEnabled !== false
        || resource?.source !== 'company_bank_accounts' || resource.ok !== true
        || resource.status !== 'matched' || resource.commercialWritesEnabled !== false
        || !accountId(resource.account?.id) || !/^\d{4}$/.test(resource.account?.ibanLast4 || '')) {
        return reply({ error: 'billing-bank-unconfirmed',
          bankStatus: bankStatuses.has(resource?.status) ? resource.status : 'invalid-response',
          httpStatus: Number.isInteger(resource?.httpStatus) ? resource.httpStatus : null }, 409, refreshHeaders);
      }
      // Refuse a proposal based on a payment/rehearsal changed during the live read.
      const latest = await store.read(sessionId);
      if (!latest || latest.version !== saved.version) return reply({ error: 'stale-source' }, 409, refreshHeaders);
      return reply({ preview: {
        kind: 'toconline-bank-associated-preview', environment: 'sandbox',
        persisted: false, liveWritesEnabled: false, fiscalEffect: false,
        providerWriteMade: false, providerReadMade: true, preparedAt: now(),
        sessionId, orderId, amountCents: draft.amountCents,
        basedOnSimulatedDocument: existing.simulated?.salesDocumentNo || null,
        account: { source: 'company_bank_accounts', id: resource.account.id, ibanLast4: resource.account.ibanLast4 },
        salesDocument: { ...draft.salesDocument, bank_account_id: Number(resource.account.id) },
        taxPreview: draft.taxPreview,
      } }, 200, refreshHeaders);
    } catch (error) {
      const code = error?.message?.startsWith('fiscal/') ? error.message.slice(7) : '';
      const safe = ['paid-test-required', 'source-mismatch', 'invalid-date'].includes(code) ? code : 'bank-preview-unavailable';
      return reply({ error: safe }, safe === 'bank-preview-unavailable' ? 503 : 409, refreshHeaders);
    }
  };
}
