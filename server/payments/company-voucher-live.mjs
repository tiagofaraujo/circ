import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore } from './checkout-live-store.mjs';

const EVENT = 'circ-2027';
const PATH = '/api/checkout/live/company-voucher/redeem';
const CODE = /^[a-f0-9]{32}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers });
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };

async function readCode(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('invalid-request');
  const reader = request.body?.getReader();
  if (!reader) fail('invalid-request');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) { await reader.cancel(); fail('invalid-request'); }
    chunks.push(Buffer.from(value));
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid-request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
    || typeof body.code !== 'string' || body.code.length > 100) fail('invalid-request');
  const code = body.code.replace(/[\s-]/g, '').toLowerCase();
  if (!CODE.test(code)) fail('company/invalid-code');
  return code;
}

function validAllocation(voucher, purchase, code) {
  return voucher?.eventId === EVENT && typeof voucher.purchaseId === 'string'
    && /^[A-Za-z0-9_-]{1,180}$/.test(voucher.purchaseId)
    && Number.isSafeInteger(voucher.index) && voucher.index >= 0
    && Number.isSafeInteger(voucher.unitAmountCents) && voucher.unitAmountCents > 0 && voucher.unitAmountCents <= 100000
    && purchase?.eventId === EVENT && purchase.status === 'paid'
    && Number.isSafeInteger(purchase.quantity) && purchase.quantity >= 1 && purchase.quantity <= 50
    && purchase.unitAmountCents === voucher.unitAmountCents
    && purchase.amountCents === purchase.quantity * purchase.unitAmountCents
    && typeof purchase.company?.name === 'string' && purchase.company.name.length >= 2 && purchase.company.name.length <= 160
    && voucher.companyName === purchase.company.name
    && Array.isArray(purchase.codes) && purchase.codes.length === purchase.quantity
    && purchase.codes.every(value => typeof value === 'string' && CODE.test(value))
    && new Set(purchase.codes).size === purchase.codes.length
    && purchase.codes[voucher.index] === code;
}

function ownRedemption(registration, voucher, code, uid, registrationId) {
  return registration?.eventId === EVENT && registration.userId === uid && registration.primaryRegistration === true
    && registration.registrationKey === `${EVENT}:${uid}` && registration.isTest === false && registration.testMode === false
    && registration.voucherId === code && registration.companyPurchaseId === voucher.purchaseId
    && registration.payment?.method === 'company_voucher' && registration.payment.reference === voucher.purchaseId
    && registration.payment.amountCents === 0 && registration.payment.coveredAmountCents === voucher.unitAmountCents
    && registration.payment.currency === 'EUR' && voucher.status === 'redeemed'
    && voucher.redeemedBy === uid && voucher.registrationId === registrationId;
}

export function createCompanyVoucherLiveApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createCheckoutLiveStore, now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    if (url.search) return reply({ error: 'invalid-request' }, 400);
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'company/auth' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'company/unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'company/auth' }, 401); }
    if (claims?.email_verified !== true || !UID.test(claims.sub || '') || typeof claims.email !== 'string'
      || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) return reply({ error: 'company/auth' }, 403);
    try {
      const code = await readCode(request);
      const serviceToken = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token: serviceToken });
      const registrationId = `${EVENT}-${claims.sub}`;
      const [config, profile, existing, locatedVoucher] = await Promise.all([
        store.companyConfig(), store.profile(), store.registration(), store.companyVoucher(code),
      ]);
      const voucher = locatedVoucher?.data;
      if (!voucher || !/^[A-Za-z0-9_-]{1,180}$/.test(voucher.purchaseId || '')) fail('company/invalid-code');
      const purchase = await store.companyPurchase(voucher.purchaseId);
      if (!validAllocation(voucher, purchase?.data, code)) fail('company/invalid-code');
      if (existing?.data) {
        if (ownRedemption(existing.data, voucher, code, claims.sub, registrationId)) return reply({ registrationId, duplicate: true });
        fail('company/existing', 409);
      }
      if (config?.data?.enabled !== true) fail('company/closed', 409);
      if (voucher.status !== 'available' || voucher.redeemedBy !== null || voucher.registrationId !== null || voucher.redeemedAt !== null) fail('company/invalid-code');
      const rawName = profile?.data?.name;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (name.length < 5 || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) fail('company/profile', 409);
      const timestamp = now();
      const registration = { eventId: EVENT, userId: claims.sub, registrationKey: `${EVENT}:${claims.sub}`,
        primaryRegistration: true, participantName: name, participantEmail: claims.email,
        registrationType: 'CIRC 2027 · Presencial', status: 'confirmed', isTest: false, testMode: false,
        selection: { profile: 'external', courseAffiliation: 'external', congressMode: 'onsite', morningCourse: false,
          afternoonCourse: false, dinner: false, dinnerQuantity: 0, ratePeriod: 'company' },
        entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
        payment: { status: 'paid', amountCents: 0, coveredAmountCents: voucher.unitAmountCents, currency: 'EUR',
          method: 'company_voucher', reference: voucher.purchaseId, payer: voucher.companyName },
        voucherId: code, companyPurchaseId: voucher.purchaseId, addOnOrderCount: 0, documentCount: 0,
        createdAt: timestamp, updatedAt: timestamp };
      await store.redeemCompanyVoucher({ code, registration, voucherVersion: locatedVoucher.version,
        voucher: { ...voucher, status: 'redeemed', redeemedBy: claims.sub, registrationId, redeemedAt: timestamp, updatedAt: timestamp },
        guards: [config, profile, purchase] });
      return reply({ registrationId, duplicate: false });
    } catch (error) {
      if (error?.status) return reply({ error: error.code }, error.status);
      if (error?.code === 'capacity-full') return reply({ error: 'company/capacity-full' }, 409);
      if (error?.code === 'conflict') return reply({ error: 'company/conflict' }, 409);
      return reply({ error: 'company/unavailable' }, 503);
    }
  };
}
