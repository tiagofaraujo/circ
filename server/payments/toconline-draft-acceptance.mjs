import { createCheckoutSandboxStore, CHECKOUT_UUID as UUID } from './checkout-sandbox-store.mjs';
import { buildToconlineRehearsal } from './toconline-rehearsal.mjs';
import { billingCustomerFromProfile } from './toconline-billing-customer.mjs';
import { withToconlineSession } from './toconline-readonly.mjs';

const PREFIX = '/api/fiscal/toconline/draft-test/';
const ADMIN = 'circ.chuc@gmail.com';
const CONFIRMATION = 'TESTAR API SEM FINALIZAR';
const reply = (body, status = 200, extra = {}) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization, Cookie',
  'X-Content-Type-Options': 'nosniff',
  ...extra,
} });

function legacyBase(apiUrl) {
  const url = new URL(apiUrl);
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  url.search = ''; url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function providerCall(base, token, path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${base}/${path.replace(/^\//, '')}`, {
      method,
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    const error = new Error('toconline-draft-api-unavailable');
    error.code = 'toconline-draft-api-unavailable';
    error.status = 502;
    throw error;
  }
  if (response.status === 401) {
    const error = new Error('toconline-api-unauthorized');
    error.code = 'toconline-api-unauthorized'; error.status = 401; throw error;
  }
  if (!response.ok || (response.status >= 300 && response.status < 400)) {
    const error = new Error('toconline-draft-api-rejected');
    error.code = 'toconline-draft-api-rejected'; error.status = response.status; throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    const error = new Error('toconline-draft-api-invalid-response');
    error.code = 'toconline-draft-api-invalid-response'; error.status = 502; throw error;
  }
}

function safeId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? value : null;
}

export function createToconlineDraftAcceptanceApi({
  verify,
  storeFactory = createCheckoutSandboxStore,
  now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const match = url.pathname.match(/^\/api\/fiscal\/toconline\/draft-test\/sessions\/([^/]+)\/orders\/([^/]+)$/);
    if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return reply({ error: 'not-found' }, 404);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true || claims.email !== ADMIN) return reply({ error: 'admin-required' }, 403);

    let body;
    try { body = await request.json(); } catch { return reply({ error: 'invalid-request' }, 400); }
    if (!body || Object.keys(body).some(key => !['confirmation'].includes(key)) || body.confirmation !== CONFIRMATION) {
      return reply({ error: 'confirmation-required' }, 400);
    }

    const [sessionId, orderId] = match.slice(1);
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: claims.sub });
    try {
      const saved = await store.read(sessionId);
      if (!saved || saved.record?.owner !== claims.sub) return reply({ error: 'not-found' }, 404);
      const order = saved.record.orders?.find(item => item.id === orderId);
      const existing = saved.record.fiscalRehearsals?.find(item => item.orderId === orderId);
      if (!order || !existing || existing.status !== 'simulated-issued') return reply({ error: 'simulated-issue-required' }, 409);
      if (order.method !== 'bank_transfer' || order.amountCents !== 9500) return reply({ error: 'first-test-scope-only' }, 409);
      const draft = buildToconlineRehearsal(saved.record, orderId, 'invoice_receipt', existing.date);
      if (draft.sourceDigest !== existing.sourceDigest
        || draft.fiscalPolicyVersion !== existing.fiscalPolicyVersion
        || draft.pricingPolicyVersion !== existing.pricingPolicyVersion
        || draft.pricingCheck?.status !== 'matches') return reply({ error: 'stale-source' }, 409);
      if (draft.salesDocument.document_type !== 'FR' || draft.salesDocument.document_series_id !== 244
        || draft.salesDocument.payment_mechanism !== 'TR'
        || draft.salesDocument.lines?.length !== 1
        || draft.salesDocument.lines[0]?.item_code !== 'CIRC27-CONG-P'
        || draft.salesDocument.lines[0]?.item_id !== 55
        || draft.salesDocument.lines[0]?.tax_code !== 'ISE'
        || draft.salesDocument.tax_exemption_reason_id !== 9) return reply({ error: 'first-test-scope-only' }, 409);

      const billingSource = await store.billingProfile();
      const billing = billingCustomerFromProfile(billingSource?.data);
      if (!billing.ok) return reply({ error: 'billing-customer-unconfirmed', issues: billing.issues }, 409);

      const result = await withToconlineSession(request, env, Date.parse(now()), async (apiUrl, accessToken) => {
        const base = legacyBase(apiUrl);
        let documentId = null, lineId = null, headerResponse = null, lineResponse = null;
        let cleanup = { lineDeleted: false, documentDeleted: false };
        try {
          const externalReference = `CIRC-DRAFT-${sessionId.slice(0, 8).toUpperCase()}-${orderId.slice(0, 8).toUpperCase()}`;
          const attributes = {
            document_type: 'FR',
            date: draft.date,
            document_series_prefix: 'CIRC2027',
            ...billing.customer,
            due_date: draft.date,
            payment_mechanism: 'TR',
            vat_included_prices: true,
            currency_iso_code: 'EUR',
            notes: 'TESTE API CIRC — RASCUNHO NÃO FINALIZAR',
            external_reference: externalReference,
          };
          headerResponse = await providerCall(base, accessToken, 'commercial_sales_documents', {
            method: 'POST',
            body: { data: { type: 'commercial_sales_documents', attributes } },
          });
          documentId = safeId(headerResponse?.data?.id);
          if (!documentId) throw Object.assign(new Error('toconline-draft-api-invalid-response'), { code: 'toconline-draft-api-invalid-response', status: 502 });

          lineResponse = await providerCall(base, accessToken, 'commercial_sales_document_lines', {
            method: 'POST',
            body: { data: { type: 'commercial_sales_document_lines', attributes: {
              document_id: Number(documentId),
              item_type: 'Service',
              quantity: 1,
              unit_price: 95,
              item_id: 55,
            } } },
          });
          lineId = safeId(lineResponse?.data?.id);
          if (!lineId) throw Object.assign(new Error('toconline-draft-api-invalid-response'), { code: 'toconline-draft-api-invalid-response', status: 502 });

          return {
            accepted: true,
            documentId,
            lineId,
            headerStatus: headerResponse?.data?.attributes?.status ?? null,
            documentType: headerResponse?.data?.attributes?.document_type || 'FR',
            lineTaxCode: lineResponse?.data?.attributes?.tax_code ?? null,
            lineTaxPercentage: lineResponse?.data?.attributes?.tax_percentage ?? null,
            lineExemptionReason: lineResponse?.data?.attributes?.exemption_reason ?? null,
            externalReference,
            cleanup,
          };
        } finally {
          if (lineId) {
            try { await providerCall(base, accessToken, `commercial_sales_document_lines/${lineId}`, { method: 'DELETE' }); cleanup.lineDeleted = true; }
            catch { cleanup.lineDeleted = false; }
          }
          if (documentId) {
            try { await providerCall(base, accessToken, `commercial_sales_documents/${documentId}`, { method: 'DELETE' }); cleanup.documentDeleted = true; }
            catch { cleanup.documentDeleted = false; }
          }
        }
      });

      const test = result.value;
      if (!test?.accepted) return reply({ error: 'draft-test-failed' }, 502, result.setCookie ? { 'Set-Cookie': result.setCookie } : {});
      if (!test.cleanup?.documentDeleted) return reply({
        error: 'draft-cleanup-required',
        draft: { documentId: test.documentId, lineId: test.lineId, lineDeleted: test.cleanup?.lineDeleted === true },
      }, 502, result.setCookie ? { 'Set-Cookie': result.setCookie } : {});
      return reply({
        test: {
          provider: 'toconline',
          mode: 'real-api-draft-not-finalized',
          finalized: false,
          fiscalDocumentIssued: false,
          documentType: test.documentType,
          amountCents: 9500,
          serviceId: 55,
          seriesPrefix: 'CIRC2027',
          headerAccepted: true,
          lineAccepted: true,
          returnedTaxCode: test.lineTaxCode,
          returnedTaxPercentage: test.lineTaxPercentage,
          returnedExemptionReason: test.lineExemptionReason,
          cleanup: { lineDeleted: test.cleanup.lineDeleted, documentDeleted: test.cleanup.documentDeleted },
          testedAt: now(),
        },
      }, 200, result.setCookie ? { 'Set-Cookie': result.setCookie } : {});
    } catch (error) {
      const code = error?.code || error?.message || 'draft-test-failed';
      const safe = new Set(['toconline-not-connected', 'toconline-reauthorize-required', 'toconline-not-configured',
        'toconline-draft-api-unavailable', 'toconline-draft-api-rejected', 'toconline-draft-api-invalid-response']);
      return reply({ error: safe.has(code) ? code : 'draft-test-failed' }, Number(error?.status) || 502);
    }
  };
}
