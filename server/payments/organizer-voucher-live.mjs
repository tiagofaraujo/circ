import { isRegistrationOpen } from '../../src/data/registration2027.js';
import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { availableOrganizerVoucher, organizerVoucherHash, validOrganizerVoucher } from './organizer-voucher-record.mjs';

const EVENT = 'circ-2027';
const PATH = '/api/checkout/live/organizer-voucher/redeem';
const PROVIDERS = new Map([
  ['multibanco', 'eupago'], ['mbway', 'eupago'], ['bank_transfer', 'internal_bank_transfer'], ['stripe_card', 'stripe'],
]);
const HEADERS = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const reject = (code, status = 409) => { throw Object.assign(new Error(code), { code, status }); };

async function readVoucherHash(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) reject('invalid-request', 400);
  const reader = request.body?.getReader();
  if (!reader) reject('invalid-request', 400);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512) {
      await reader.cancel();
      reject('invalid-request', 400);
    }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { reject('invalid-request', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
    || typeof body.code !== 'string' || body.code.length > 100) reject('invalid-request', 400);
  const hash = organizerVoucherHash(body.code);
  if (!hash) reject('organizer/invalid-code', 400);
  return hash;
}

function paidInternalRegistration(registration, uid) {
  const ledger = registration?.payment;
  return registration?.eventId === EVENT && registration.userId === uid && registration.primaryRegistration === true
    && registration.registrationKey === `${EVENT}:${uid}` && registration.isTest === false && registration.testMode === false
    && !registration.registrationArchiveId && !registration.registrationArchivedAt && registration.status === 'confirmed'
    && registration.selection?.profile === 'uls' && registration.selection.congressMode === 'onsite'
    && (registration.entitlements ?? registration.selection).congressMode === 'onsite' && ledger?.status === 'paid'
    && ledger.currency === 'EUR' && Number.isSafeInteger(ledger.amountCents) && ledger.amountCents > 0
    && PROVIDERS.has(ledger.method) && LIVE_ORDER_UUID.test(ledger.orderId || '');
}

function matchesDirectPayment(payment, registration, registrationId) {
  const ledger = registration.payment;
  return payment?.id === ledger.orderId && payment.userId === registration.userId && payment.registrationId === registrationId
    && payment.eventId === EVENT && payment.environment === 'production' && !payment.registrationArchiveId
    && payment.status === 'paid' && !payment.capacityStatus && (payment.kind ?? payment.quote?.kind) === 'primary'
    && typeof payment.transactionId === 'string' && payment.transactionId.length > 0 && Number.isFinite(Date.parse(payment.paidAt))
    && payment.quote?.selection?.profile === 'uls' && payment.quote.selection.congressMode === 'onsite'
    && payment.method === ledger.method && payment.provider === PROVIDERS.get(ledger.method)
    && payment.currency === ledger.currency && payment.amountCents === ledger.amountCents && payment.reference === ledger.reference;
}

export function createOrganizerVoucherLiveApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createCheckoutLiveStore, now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    if (url.search) return reply({ error: 'invalid-request' }, 400);
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'organizer/auth' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'organizer/unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'organizer/auth' }, 401); }
    if (claims?.email_verified !== true || !/^[A-Za-z0-9_-]{1,128}$/.test(claims.sub || '')) {
      return reply({ error: 'organizer/auth' }, 403);
    }

    try {
      const hash = await readVoucherHash(request);
      const timestamp = now();
      if (!isRegistrationOpen(timestamp)) reject('organizer/registration-not-open', 403);
      const serviceToken = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token: serviceToken });
      const registrationId = `${EVENT}-${claims.sub}`;
      const locatedRegistration = await store.registration();
      const current = locatedRegistration?.data;
      if (!paidInternalRegistration(current, claims.sub)) reject('organizer/paid-registration-required');
      const [locatedVoucher, locatedPayment] = await Promise.all([store.organizerVoucher(hash), store.payment(current.payment.orderId)]);
      if (!matchesDirectPayment(locatedPayment?.data, current, registrationId)) reject('organizer/paid-registration-required');
      const voucher = locatedVoucher?.data;
      if (current.organizerVoucherRedeemed === true) {
        if (validOrganizerVoucher(voucher) && voucher.status === 'redeemed' && voucher.redeemedBy === claims.sub && voucher.registrationId === registrationId) {
          return reply({ registrationId, duplicate: true });
        }
        reject('organizer/already-redeemed');
      }
      if (!availableOrganizerVoucher(voucher)) reject('organizer/invalid-code', 400);
      if (current.openSupplementaryOrderId || current.capacityReviewOrderId) reject('organizer/supplementary-pending');
      const owned = current.entitlements ?? current.selection;
      if (owned.morningCourse === true || owned.afternoonCourse === true) reject('organizer/course-already-owned');
      const dinnerQuantity = owned.dinnerQuantity ?? 0;
      if (!Number.isSafeInteger(dinnerQuantity) || dinnerQuantity < 0 || dinnerQuantity >= Number.MAX_SAFE_INTEGER) reject('organizer/unavailable', 503);

      const registration = {
        ...current,
        organizerVoucherRedeemed: true,
        entitlements: { ...owned, morningCourse: true, afternoonCourse: true, dinnerQuantity: dinnerQuantity + 1 },
        updatedAt: timestamp,
      };
      await store.redeemOrganizerVoucher({
        hash, registration, registrationVersion: locatedRegistration.version,
        voucher: { ...voucher, status: 'redeemed', redeemedBy: claims.sub, registrationId, redeemedAt: timestamp },
        voucherVersion: locatedVoucher.version, orderId: current.payment.orderId, orderVersion: locatedPayment.version,
      });
      return reply({ registrationId, duplicate: false });
    } catch (error) {
      if (error?.status) return reply({ error: error.code }, error.status);
      if (error?.code === 'capacity-full') return reply({ error: 'organizer/capacity-full', unavailable: error.unavailable }, 409);
      if (error?.code === 'conflict') return reply({ error: 'organizer/conflict' }, 409);
      return reply({ error: 'organizer/unavailable' }, 503);
    }
  };
}
