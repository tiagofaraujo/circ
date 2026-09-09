'use strict';

const { createHmac, randomInt, randomUUID, timingSafeEqual } = require('node:crypto');

const EVENT_ID = 'circ-2027';
const DOMAIN = 'ulscoimbra.min-saude.pt';
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

class VerificationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function normalizeMec(value) {
  // Keep identifiers as text: do not add padding or discard leading zeroes.
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value.trim())) {
    throw new VerificationError('invalid-argument', 'Indique um MEC válido.');
  }
  return value.trim();
}

function validRoster(entry) {
  return entry?.active === true && entry.eventId === EVENT_ID;
}

// Mandatory for Admin SDK checkout handlers, which bypass Firestore rules.
// Call in the SAME transaction that creates the order; compute prices on the server.
async function requireUlsEligibility(tx, uid, selection) {
  if (selection?.profile !== 'uls' && selection?.courseAffiliation !== 'uls') return;
  const eligibility = await tx.get(`ulsEligibility/${uid}`);
  if (eligibility?.status !== 'verified' || eligibility.eventId !== EVENT_ID) {
    throw new VerificationError('permission-denied', 'Valide primeiro o seu MEC.');
  }
  const [roster, claim] = await Promise.all([
    tx.get(`ulsRoster/${eligibility.mec}`), tx.get(`ulsMecClaims/${EVENT_ID}_${eligibility.mec}`),
  ]);
  if (!validRoster(roster) || claim?.userId !== uid) {
    throw new VerificationError('permission-denied', 'Contacte o secretariado para confirmar a elegibilidade ULS Coimbra.');
  }
}

function createVerificationService({ store, secret, sendCode, clock = Date.now }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('ULS_OTP_SECRET must contain at least 32 bytes.');
  }
  const hash = (...parts) => createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
  const codeHash = (uid, challengeId, mec, code) => hash('otp', uid, challengeId, mec, code);
  const eligibilityPath = (uid) => `ulsEligibility/${uid}`;
  const claimPath = (mec) => `ulsMecClaims/${EVENT_ID}_${mec}`;
  const rosterPath = (mec) => `ulsRoster/${mec}`;
  const challengePath = (uid) => `ulsChallenges/${uid}`;
  const isVerified = (data) => data?.status === 'verified' && data.eventId === EVENT_ID;

  function rateBucket(previous, now, limit, cooldown = 0) {
    const current = previous && now - previous.windowStart < WINDOW_MS
      ? previous : { windowStart: now, count: 0, lastAt: 0 };
    if (current.count >= limit || (previous && now - previous.lastAt < cooldown)) {
      throw new VerificationError('resource-exhausted', 'Aguarde antes de tentar novamente.');
    }
    return { windowStart: current.windowStart, count: current.count + 1, lastAt: now,
      deleteAfter: new Date(now + 2 * WINDOW_MS) };
  }

  async function requestCode({ uid, mec: rawMec, ip = 'unknown' }) {
    const mec = normalizeMec(rawMec);
    const now = clock();
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const ratePaths = [
      `ulsRateLimits/user_${hash('user', uid)}`,
      `ulsRateLimits/mec_${hash('mec', mec)}`,
      `ulsRateLimits/ip_${hash('ip', ip)}`,
      'ulsRateLimits/global',
    ];
    const prepared = await store.runTransaction(async (tx) => {
      const [eligibility, roster, claim, ...rates] = await Promise.all([
        tx.get(eligibilityPath(uid)), tx.get(rosterPath(mec)), tx.get(claimPath(mec)),
        ...ratePaths.map((path) => tx.get(path)),
      ]);
      if (isVerified(eligibility)) return { alreadyVerified: true };
      const nextRates = rates.map((rate, i) => rateBucket(rate, now, [5, 5, 30, 200][i], i < 2 ? COOLDOWN_MS : 0));
      nextRates.forEach((rate, i) => tx.set(ratePaths[i], rate));
      const eligible = validRoster(roster) && (!claim || claim.userId === uid);
      tx.set(challengePath(uid), {
        challengeId, eventId: EVENT_ID, mec, attempts: 0,
        digest: eligible ? codeHash(uid, challengeId, mec, code) : null,
        status: eligible ? 'sending' : 'unavailable',
        createdAt: new Date(now), expiresAtMs: now + CODE_LIFETIME_MS,
        deleteAfter: new Date(now + 24 * WINDOW_MS),
      });
      return { eligible };
    });
    if (prepared.alreadyVerified) return { verified: true };

    if (prepared.eligible) {
      try {
        // Sending happens once, outside the retried Firestore transaction.
        await sendCode({ to: `${mec}@${DOMAIN}`, code });
        await store.runTransaction(async (tx) => {
          const challenge = await tx.get(challengePath(uid));
          if (challenge?.challengeId === challengeId && challenge.status === 'sending') {
            tx.set(challengePath(uid), { ...challenge, status: 'sent' });
          }
        });
      } catch (error) {
        await store.runTransaction(async (tx) => {
          const challenge = await tx.get(challengePath(uid));
          if (challenge?.challengeId === challengeId) {
            tx.set(challengePath(uid), { ...challenge, digest: null, status: 'delivery_failed' });
          }
        });
        // Do not expose SMTP responses, recipient addresses, or codes in logs/errors.
        throw new VerificationError('unavailable', 'Não foi possível concluir o pedido. Tente novamente mais tarde.');
      }
    }
    // Same response for absent, disabled, or already claimed MECs. No roster lookup API.
    return { challengeId, expiresAtMs: now + CODE_LIFETIME_MS, retryAtMs: now + COOLDOWN_MS };
  }

  async function verifyCode({ uid, challengeId, code }) {
    if (typeof challengeId !== 'string' || challengeId.length > 100 || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new VerificationError('invalid-argument', 'Indique o código de seis algarismos.');
    }
    const now = clock();
    const result = await store.runTransaction(async (tx) => {
      const [challenge, eligibility, rate] = await Promise.all([
        tx.get(challengePath(uid)), tx.get(eligibilityPath(uid)),
        tx.get(`ulsRateLimits/verify_${hash('user', uid)}`),
      ]);
      if (isVerified(eligibility)) return { verified: true };
      const nextRate = rateBucket(rate, now, 30);
      const live = challenge?.challengeId === challengeId
        && challenge.eventId === EVENT_ID && challenge.expiresAtMs > now
        && challenge.attempts < MAX_ATTEMPTS && challenge.status === 'sent';
      const digest = codeHash(uid, challengeId, challenge?.mec || '', code);
      const expected = challenge?.digest || '0'.repeat(64);
      const matches = expected.length === digest.length
        && timingSafeEqual(Buffer.from(expected), Buffer.from(digest));
      // Read every document before making any transaction writes.
      const [roster, claim] = live && matches
        ? await Promise.all([tx.get(rosterPath(challenge.mec)), tx.get(claimPath(challenge.mec))])
        : [null, null];
      tx.set(`ulsRateLimits/verify_${hash('user', uid)}`, nextRate);
      if (!live || !matches || !validRoster(roster) || (claim && claim.userId !== uid)) {
        if (challenge && challenge.challengeId === challengeId && challenge.status === 'sent') {
          const attempts = challenge.attempts + 1;
          tx.set(challengePath(uid), { ...challenge, attempts,
            status: attempts >= MAX_ATTEMPTS || challenge.expiresAtMs <= now ? 'locked' : 'sent',
            digest: attempts >= MAX_ATTEMPTS || challenge.expiresAtMs <= now ? null : challenge.digest });
        }
        // Return the error so failed-attempt counters commit; throwing here rolls them back.
        return { error: true };
      }
      const verifiedAt = new Date(now);
      tx.set(claimPath(challenge.mec), { eventId: EVENT_ID, userId: uid, verifiedAt });
      tx.set(eligibilityPath(uid), {
        eventId: EVENT_ID, status: 'verified', mec: challenge.mec,
        institutionalEmail: `${challenge.mec}@${DOMAIN}`, verifiedAt,
      });
      tx.set(challengePath(uid), { ...challenge, digest: null, status: 'used', usedAt: verifiedAt });
      tx.set(`auditLogs/uls_${challengeId}`, {
        action: 'registration.uls.verified', eventId: EVENT_ID, userId: uid, createdAt: verifiedAt,
      });
      return { verified: true };
    });
    if (result.error) throw new VerificationError('permission-denied', 'Código inválido, expirado ou indisponível. Peça um novo código ou contacte o secretariado.');
    return result;
  }

  return { requestCode, verifyCode, requireUlsEligibility };
}

module.exports = { createVerificationService, requireUlsEligibility, VerificationError, normalizeMec, EVENT_ID, DOMAIN, CODE_LIFETIME_MS, COOLDOWN_MS, MAX_ATTEMPTS };
