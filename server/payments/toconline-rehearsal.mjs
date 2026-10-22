import { createHash } from 'node:crypto';
import { createCheckoutSandboxStore, CHECKOUT_UUID } from './checkout-sandbox-store.mjs';
import { FISCAL_POLICY_VERSION, prepareRehearsalTaxes } from './toconline-rehearsal-tax.mjs';
import { PRICING_POLICY_VERSION, inspectRehearsalPricing, pricingPaymentSnapshot } from './toconline-rehearsal-pricing.mjs';

const PREFIX = '/api/fiscal/sandbox';
const ADMIN = 'circ.chuc@gmail.com';
const EVENT = 'circ-2027';
const DATE_RE = /^20\d{2}-\d{2}-\d{2}$/;
const fail = code => { throw new Error(`fiscal/${code}`); };
const json = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization',
  'X-Content-Type-Options': 'nosniff',
} });
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) fail('invalid-request');
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const LINE_META = Object.freeze({
  'congress-onsite': ['CIRC27-CONG-P', 'Inscrição CIRC 2027 — Congresso presencial'],
  'congress-virtual': ['CIRC27-CONG-O', 'Inscrição CIRC 2027 — Congresso online'],
  'course-morning': ['CIRC27-CURSO-M', 'CIRC 2027 — Curso pré-congresso manhã'],
  'course-afternoon': ['CIRC27-CURSO-T', 'CIRC 2027 — Curso pré-congresso tarde'],
  dinner: ['CIRC27-JANTAR', 'CIRC 2027 — Jantar do congresso'],
});

export function mapReceiptPaymentMechanism(method) {
  if (method === 'multibanco') return { code: 'MB', label: 'Referência Multibanco', blocker: null };
  if (method === 'bank_transfer') return { code: 'TR', label: 'Transferência bancária', blocker: null };
  if (method === 'stripe') return { code: 'CC', label: 'Cartão', blocker: null };
  if (method === 'mbway') return { code: null, label: 'MB WAY', blocker: 'mbway-payment-mechanism-required' };
  return { code: null, label: method || 'desconhecido', blocker: 'payment-mechanism-required' };
}

function assertDate(value) {
  if (!DATE_RE.test(value || '') || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('invalid-date');
}

function assertPaidOrder(record, orderId) {
  if (!record || record.kind !== 'checkout-test' || record.environment !== 'sandbox'
    || record.eventId !== EVENT || record.registration?.status !== 'confirmed') fail('paid-test-required');
  const order = record.orders?.find(candidate => candidate.id === orderId);
  if (!order || order.environment !== 'sandbox' || order.status !== 'confirmed'
    || order.quote?.eventId !== EVENT || order.currency !== 'EUR'
    || !Number.isSafeInteger(order.amountCents) || order.amountCents <= 0
    || order.quote.amountCents !== order.amountCents || !Array.isArray(order.quote.lines)
    || !order.quote.lines.length) fail('paid-test-required');
  const total = order.quote.lines.reduce((sum, line) => sum + Number(line.amountCents || 0), 0);
  if (total !== order.amountCents) fail('source-mismatch');
  return order;
}

function sourceSnapshot(record, order) {
  return {
    sessionId: record.id,
    orderId: order.id,
    method: order.method,
    amountCents: order.amountCents,
    currency: order.currency,
    quote: order.quote,
    paymentTransactionId: order.notification?.transactionId || order.bankTransfer?.confirmation?.creditReference || order.reference || null,
    pricingPaymentEvidence: pricingPaymentSnapshot(order),
  };
}

export function buildToconlineRehearsal(record, orderId, mode, date) {
  if (!['invoice_receipt', 'invoice_plus_receipt'].includes(mode)) fail('invalid-mode');
  assertDate(date);
  const order = assertPaidOrder(record, orderId);
  const mechanism = mapReceiptPaymentMechanism(order.method);
  const source = sourceSnapshot(record, order);
  const pricingCheck = inspectRehearsalPricing(order);
  const externalReference = `CIRC-TESTE-${record.id.slice(0, 8).toUpperCase()}-${order.id.slice(0, 8).toUpperCase()}`;
  const lines = order.quote.lines.map(line => {
    const meta = LINE_META[line.code];
    if (!meta || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0
      || line.amountCents % line.quantity !== 0
      || (line.unitAmountCents !== undefined && line.unitAmountCents !== line.amountCents / line.quantity)) fail('source-mismatch');
    return {
      item_type: 'Service',
      item_code: meta[0],
      description: meta[1],
      quantity: line.quantity,
      unit_price: (line.amountCents / line.quantity) / 100,
      unit_of_measure: 'un',
    };
  });
  const salesDocument = {
    document_type: mode === 'invoice_receipt' ? 'FR' : 'FT',
    date,
    due_date: date,
    currency_iso_code: 'EUR',
    customer_business_name: 'Participante Teste CIRC',
    customer_tax_registration_number: '000000000',
    customer_address_detail: 'Rua de Teste, 1',
    customer_postcode: '3000-000',
    customer_city: 'Coimbra',
    customer_country: 'PT',
    external_reference: externalReference,
    notes: 'SIMULAÇÃO INTERNA CIRC — NÃO ENVIAR AO TOCONLINE',
    vat_included_prices: true,
    ...(mechanism.code ? { payment_mechanism: mechanism.code } : {}),
    lines,
  };
  const fiscal = prepareRehearsalTaxes(salesDocument, order.quote.lines);
  const receipt = mode === 'invoice_plus_receipt' ? {
    date,
    ...(mechanism.code ? { payment_mechanism: mechanism.code } : {}),
    lines: [{
      receivable_type: 'Document',
      receivable_id: '<sales_document_id>',
      received_value: order.amountCents / 100,
    }],
  } : null;
  const blockers = [
    'document-series-required',
    'services-must-exist',
    'vat-or-exemption-configuration-required',
    'production-customer-data-required',
    'toconline-calculation-not-tested',
    ...fiscal.reviews,
    ...(mode === 'invoice_plus_receipt' ? ['receipt-series-required'] : []),
    ...(mechanism.blocker ? [mechanism.blocker] : []),
  ];
  const warnings = [
    ...(order.method === 'bank_transfer' || order.method === 'stripe' ? ['bank-account-mapping-may-be-required'] : []),
    ...(mode === 'invoice_receipt' ? ['fr-auto-creates-associated-receipt'] : []),
  ];
  return {
    kind: 'toconline-rehearsal',
    environment: 'sandbox',
    provider: 'toconline',
    liveWritesEnabled: false,
    fiscalPolicyVersion: fiscal.fiscalPolicyVersion,
    pricingPolicyVersion: PRICING_POLICY_VERSION,
    pricingCheck,
    taxPreview: fiscal.taxPreview,
    sessionId: record.id,
    orderId,
    sourceDigest: digest(source),
    source,
    mode,
    date,
    amountCents: order.amountCents,
    payment: mechanism,
    salesDocument: fiscal.salesDocument,
    receipt,
    blockers,
    warnings,
  };
}

function publicRehearsal(value) {
  if (!value) return null;
  const { sourceDigest, ...visible } = value;
  return visible;
}

function rehearsals(record) {
  return Array.isArray(record.fiscalRehearsals) ? record.fiscalRehearsals : [];
}

function replaceRehearsal(record, next) {
  return { ...record, fiscalRehearsals: [...rehearsals(record).filter(item => item.orderId !== next.orderId), next] };
}

function currentSourceDigest(record, orderId) {
  const order = assertPaidOrder(record, orderId);
  return digest(sourceSnapshot(record, order));
}

function safeError(error) {
  const code = error.message?.startsWith('fiscal/') ? error.message.slice(7) : '';
  const allowed = new Set(['invalid-request', 'invalid-date', 'invalid-mode', 'paid-test-required',
    'source-mismatch', 'not-found', 'not-prepared', 'already-issued', 'stale-source', 'stale-tax-policy', 'payment-tariff-review-required']);
  if (allowed.has(code)) return json({ error: code }, ['already-issued', 'stale-source', 'stale-tax-policy', 'payment-tariff-review-required'].includes(code) ? 409 : code === 'not-found' ? 404 : 400);
  if (['storage_forbidden', 'storage_session_expired', 'storage_unavailable', 'conflict'].includes(error.code)) {
    return json({ error: error.code }, error.code === 'conflict' ? 409 : 503);
  }
  return json({ error: 'service-unavailable' }, 503);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('invalid-request');
  const text = await request.text();
  if (!text || text.length > 4096) fail('invalid-request');
  try { return JSON.parse(text); } catch { fail('invalid-request'); }
}

export function createToconlineRehearsalApi({ verify, storeFactory = createCheckoutSandboxStore, now = () => new Date().toISOString() }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return json({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return json({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return json({ error: 'invalid-session' }, 401); }
    if (claims.email_verified !== true || claims.email !== ADMIN) return json({ error: 'admin-required' }, 403);
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return json({ error: 'invalid-origin' }, 403);
    if (url.pathname === `${PREFIX}/config`) {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      return json({
        provider: 'toconline',
        environment: 'rehearsal',
        liveWritesEnabled: false,
        fiscalPolicyVersion: FISCAL_POLICY_VERSION,
        pricingPolicyVersion: PRICING_POLICY_VERSION,
        scopeRequired: 'commercial',
        salesDocumentsEndpoint: '/api/v1/commercial_sales_documents',
        receiptsEndpoint: '/api/v1/commercial_sales_receipts',
        note: 'No TOConline credentials or POST calls are used by this rehearsal.',
      });
    }
    const match = url.pathname.match(/^\/api\/fiscal\/sandbox\/sessions\/([^/]+)(?:\/orders\/([^/]+)\/(prepare|issue|reset))?$/);
    if (!match || !CHECKOUT_UUID.test(match[1]) || (match[2] && !CHECKOUT_UUID.test(match[2]))) return json({ error: 'not-found' }, 404);
    if (match[3] && request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
    if (!match[3] && request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: claims.sub });
    try {
      if (!match[3]) {
        const saved = await store.read(match[1]);
        if (!saved) fail('not-found');
        const confirmedOrders = saved.record.orders.filter(order => order.status === 'confirmed').map(order => ({
          id: order.id,
          method: order.method,
          amountCents: order.amountCents,
          currency: order.currency,
          createdAt: order.createdAt,
          quote: order.quote,
          transaction: order.notification?.transactionId || order.bankTransfer?.confirmation?.creditReference || order.reference || null,
          rehearsal: publicRehearsal(rehearsals(saved.record).find(item => item.orderId === order.id)),
        }));
        return json({ session: { id: saved.record.id, registrationConfirmed: saved.record.registration?.status === 'confirmed', orders: confirmedOrders } });
      }
      const body = await readJson(request);
      const sessionId = match[1], orderId = match[2], action = match[3];
      for (let retry = 0; retry < 4; retry++) {
        const saved = await store.read(sessionId);
        if (!saved) fail('not-found');
        const existing = rehearsals(saved.record).find(item => item.orderId === orderId);
        if (action === 'prepare') {
          exact(body, ['mode', 'date', 'sandboxAcknowledged']);
          if (body.sandboxAcknowledged !== true) fail('invalid-request');
          if (existing?.status === 'simulated-issued') fail('already-issued');
          const draft = buildToconlineRehearsal(saved.record, orderId, body.mode, body.date);
          const next = { ...draft, status: 'prepared', preparedAt: now(), issuedAt: null, simulated: null };
          try {
            const updated = await store.replace(sessionId, replaceRehearsal(saved.record, next), saved.version);
            return json({ rehearsal: publicRehearsal(rehearsals(updated.record).find(item => item.orderId === orderId)) }, 201);
          } catch (error) { if (error.code !== 'conflict') throw error; continue; }
        }
        if (action === 'issue') {
          exact(body, ['id', 'sandboxAcknowledged']);
          if (!CHECKOUT_UUID.test(body.id || '') || body.sandboxAcknowledged !== true) fail('invalid-request');
          if (!existing) fail('not-prepared');
          if (existing.status === 'simulated-issued') return json({ rehearsal: publicRehearsal(existing), duplicate: true });
          if (existing.status !== 'prepared') fail('not-prepared');
          if (existing.fiscalPolicyVersion !== FISCAL_POLICY_VERSION || existing.pricingPolicyVersion !== PRICING_POLICY_VERSION) fail('stale-tax-policy');
          if (existing.sourceDigest !== currentSourceDigest(saved.record, orderId)) fail('stale-source');
          // Recompute from the saved payment, never trust a browser or stored diagnostic flag.
          const pricingCheck = inspectRehearsalPricing(assertPaidOrder(saved.record, orderId));
          if (pricingCheck.simulationBlocked) fail('payment-tariff-review-required');
          const short = body.id.replaceAll('-', '').slice(0, 10).toUpperCase();
          const next = { ...existing, status: 'simulated-issued', issuedAt: now(), issueRequestId: body.id,
            simulated: {
              salesDocumentId: `TEST-DOC-${short}`,
              salesDocumentNo: `${existing.mode === 'invoice_receipt' ? 'FR' : 'FT'} TESTE/${short}`,
              receiptId: existing.mode === 'invoice_receipt' ? `AUTO-${short}` : `TEST-RC-${short}`,
              receiptNo: `RC TESTE/${short}`,
              fiscalEffect: false,
              providerCallMade: false,
            } };
          try {
            const updated = await store.replace(sessionId, replaceRehearsal(saved.record, next), saved.version);
            return json({ rehearsal: publicRehearsal(rehearsals(updated.record).find(item => item.orderId === orderId)), duplicate: false });
          } catch (error) { if (error.code !== 'conflict') throw error; continue; }
        }
        exact(body, ['sandboxAcknowledged']);
        if (body.sandboxAcknowledged !== true) fail('invalid-request');
        if (!existing) return json({ reset: false });
        try {
          const updatedRecord = { ...saved.record, fiscalRehearsals: rehearsals(saved.record).filter(item => item.orderId !== orderId) };
          await store.replace(sessionId, updatedRecord, saved.version);
          return json({ reset: true });
        } catch (error) { if (error.code !== 'conflict') throw error; }
      }
      return json({ error: 'conflict' }, 409);
    } catch (error) { return safeError(error); }
  };
}
