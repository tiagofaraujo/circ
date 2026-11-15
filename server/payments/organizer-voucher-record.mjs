import { createHash } from 'node:crypto';

export const ORGANIZER_VOUCHER_BATCH = 'circ-2027-organizers-01';
export const ORGANIZER_VOUCHER_QUANTITY = 9;

export function organizerVoucherHash(code) {
  if (typeof code !== 'string' || code.length > 100) return null;
  const normalized = code.replace(/[\s-]/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? createHash('sha256').update(normalized).digest('hex') : null;
}

export function validOrganizerVoucher(voucher) {
  return voucher?.eventId === 'circ-2027' && voucher.batchId === ORGANIZER_VOUCHER_BATCH && Number.isInteger(voucher.index)
    && voucher.index >= 1 && voucher.index <= ORGANIZER_VOUCHER_QUANTITY;
}

export function availableOrganizerVoucher(voucher) {
  return validOrganizerVoucher(voucher) && voucher.status === 'available' && voucher.redeemedBy == null
    && voucher.registrationId == null && voucher.redeemedAt == null && voucher.userId == null
    && voucher.orderId == null && voucher.claimedAt == null;
}

export function claimedOrganizerVoucher(voucher, uid, orderId) {
  return validOrganizerVoucher(voucher) && voucher.status === 'claimed' && voucher.userId === uid
    && voucher.orderId === orderId && Number.isFinite(Date.parse(voucher.claimedAt)) && voucher.redeemedBy == null
    && voucher.registrationId == null && voucher.redeemedAt == null;
}
