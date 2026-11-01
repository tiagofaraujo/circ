import { createHash } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from '../payments/payments-service-token.mjs';
import { createSubmissionStore, encode } from './store.mjs';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EMAIL = /^[^/\s]{1,200}@[^/\s]+\.[^/\s]+$/;
const LIMITS = { introduction: 2500, objective: 1500, methods: 3000, results: 3000, conclusion: 2000, keywords: 500 };
const LABELS = { introduction: 'INTRODUÇÃO', objective: 'OBJETIVO', methods: 'MÉTODOS', results: 'RESULTADOS', conclusion: 'CONCLUSÃO', keywords: 'PALAVRAS-CHAVE' };
const KEYS = Object.keys(LIMITS);
const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).length === keys.length && Object.keys(object).every(key => keys.includes(key));
const error = (code, status = 409) => { throw Object.assign(new Error(code), { code, status }); };
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
export function canonicalTimestamp(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  if (!match) return null;
  const date = new Date(`${match[1]}.${(match[2] || '').padEnd(3, '0').slice(0, 3)}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === match[1]
    ? `${match[1]}.${(match[2] || '').padEnd(9, '0')}Z` : null;
}
async function boundedBody(request) {
  const limit = 96 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit || !request.body) error('invalid-request', 400);
  const reader = request.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); error('invalid-request', 400); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { error('invalid-request', 400); }
}
function correctionFrom(body) {
  if (!exact(body, ['requestId', 'expectedUpdatedAt', 'expectedVersion', 'correction']) || !UUID.test(body.requestId || '')
    || !canonicalTimestamp(body.expectedUpdatedAt) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || body.expectedVersion >= Number.MAX_SAFE_INTEGER || !exact(body.correction, ['title', 'abstractSections'])
    || typeof body.correction.title !== 'string' || !exact(body.correction.abstractSections, KEYS)) error('invalid-request', 400);
  const title = body.correction.title.trim();
  if (title.length < 3 || title.length > 240) error('invalid-correction', 400);
  const sections = {};
  for (const key of KEYS) {
    if (typeof body.correction.abstractSections[key] !== 'string') error('invalid-correction', 400);
    sections[key] = body.correction.abstractSections[key].trim();
    if (!sections[key] || sections[key].length > LIMITS[key]) error('invalid-correction', 400);
  }
  const abstract = KEYS.map(key => `${LABELS[key]}\n${sections[key]}`).join('\n\n');
  const requestHash = createHash('sha256').update(JSON.stringify({ expectedVersion: body.expectedVersion,
    expectedUpdatedAt: canonicalTimestamp(body.expectedUpdatedAt), title, sections })).digest('hex');
  return { title, sections, abstract, requestHash, requestId: body.requestId.toLowerCase() };
}
const versionOf = source => source.revisionVersion === undefined ? 0 : source.revisionVersion;
function owned(source, uid) {
  return source && source.userId === uid && source.eventId === 'circ-2027' && source.isTest === false
    && source.testMode !== true && source.archived !== true;
}
// Only a current management request for corrections grants this return path,
// including after the initial submission deadline. No new work is created.
function validRequest(source) {
  return source.status === 'revisions' && ['oral', 'poster'].includes(source.type)
    && canonicalTimestamp(source.updatedAt) && canonicalTimestamp(source.submittedAt)
    && canonicalTimestamp(source.review?.updatedAt) && ID.test(source.review?.updatedBy?.uid || '')
    && EMAIL.test(source.review?.updatedBy?.email || '');
}
function projectionFields(source, previous, id, correction, version, now) {
  const content = { eventId: 'circ-2027', submissionId: id, code: source.code || id, title: correction.title,
    type: source.type, abstract: correction.abstract, abstractSections: correction.sections,
    status: 'submitted', isTest: false, active: previous.active, evaluation: null,
    revisionVersion: version, assignedBy: previous.assignedBy };
  if (previous.evaluationHistory !== undefined) content.evaluationHistory = previous.evaluationHistory;
  return { ...encode(content).mapValue.fields, updatedAt: { timestampValue: now } };
}

export function createSubmissionResubmitApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createSubmissionStore, now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url), match = url.pathname.match(/^\/api\/submissions\/([^/]+)\/resubmit$/);
    if (!match) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    // Activation follows the matching Firestore rules release; previews are inert by default.
    if (env.SCIENTIFIC_CORRECTIONS_ENABLED !== 'true') return reply({ error: 'corrections-not-enabled' }, 503);
    if (url.search || request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    if (!ID.test(match[1])) return reply({ error: 'invalid-request' }, 400);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: 'invalid-request' }, 400);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true || !ID.test(claims?.sub || '')) return reply({ error: 'verified-email-required' }, 403);
    try {
      const text = await boundedBody(request);
      let body; try { body = JSON.parse(text); } catch { error('invalid-request', 400); }
      const correction = correctionFrom(body), id = match[1];
      // The participant's own Firebase rules are checked before server authority is used.
      const ownerStore = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token });
      let visible;
      try { visible = await ownerStore.source(id); } catch (failure) {
        if (failure?.code === 'storage-forbidden') error('not-found', 404);
        throw failure;
      }
      if (!owned(visible.data, claims.sub)) error('not-found', 404);
      const serviceToken = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: serviceToken });
      const [source, history] = await Promise.all([store.source(id), store.history(id, correction.requestId)]);
      if (!owned(source.data, claims.sub)) error('not-found', 404);
      const current = source.data;
      if (history.data) {
        if (history.data.userId !== claims.sub || history.data.submissionId !== id
          || history.data.requestHash !== correction.requestHash) error('idempotency-conflict');
        if (!Number.isSafeInteger(history.data.nextRevisionVersion)
          || history.data.nextRevisionVersion !== body.expectedVersion + 1
          || !canonicalTimestamp(history.data.resubmittedAt)) error('resubmission-unavailable', 503);
        return reply({ submission: { id, status: 'submitted', revisionVersion: history.data.nextRevisionVersion,
          resubmittedAt: history.data.resubmittedAt }, duplicate: true });
      }
      if (!validRequest(current) || !Number.isSafeInteger(versionOf(current)) || versionOf(current) < 0
        || current.lastResubmissionRequestId === correction.requestId) error('corrections-not-requested');
      if (versionOf(current) !== body.expectedVersion || canonicalTimestamp(current.updatedAt) !== canonicalTimestamp(body.expectedUpdatedAt)) error('submission-changed');
      const [assignment, draft] = await Promise.all([store.assignment(id), store.draft(id)]);
      const emails = assignment.data ? assignment.data.reviewerEmails : [];
      if ((assignment.data && assignment.data.eventId !== 'circ-2027') || !Array.isArray(emails) || emails.length > 3
        || new Set(emails).size !== emails.length || emails.some(email => !EMAIL.test(email) || email !== email.toLowerCase()
          || email === String(current.contactEmail || '').toLowerCase())) error('assignment-mismatch');
      const works = await Promise.all(emails.map(email => store.work(email, id)));
      for (const work of works) {
        const data = work.data;
        if (!data || data.eventId !== 'circ-2027' || data.submissionId !== id || data.active !== true
          || data.status !== 'revisions' || data.isTest !== false || data.type !== current.type || versionOf(data) !== versionOf(current)
          || typeof data.assignedBy !== 'string' || !data.assignedBy) error('assignment-mismatch');
      }
      if (draft.data) {
        if (draft.data.userId !== claims.sub || draft.data.submissionId !== id || draft.data.eventId !== 'circ-2027') error('correction-draft-mismatch');
        let savedCorrection;
        try { savedCorrection = correctionFrom({ ...body, correction: { title: draft.data.correction?.title, abstractSections: draft.data.correction?.abstractSections } }); }
        catch { error('correction-draft-changed'); }
        if (draft.data.sourceVersion !== body.expectedVersion
          || canonicalTimestamp(draft.data.sourceUpdatedAt) !== canonicalTimestamp(body.expectedUpdatedAt)
          || savedCorrection.requestHash !== correction.requestHash) error('correction-draft-changed');
      }
      const at = now(); if (!canonicalTimestamp(at)) error('service-unavailable', 503);
      const nextVersion = body.expectedVersion + 1;
      const sourceFields = { ...source.fields, title: encode(correction.title), abstract: encode(correction.abstract),
        abstractSections: encode(correction.sections), status: encode('submitted'), revisionVersion: encode(nextVersion),
        updatedAt: { timestampValue: at }, resubmittedAt: { timestampValue: at },
        lastResubmissionRequestId: encode(correction.requestId), lastResubmissionHash: encode(correction.requestHash) };
      delete sourceFields.review;
      const historyFields = { action: encode('submission.corrections.resubmitted'), eventId: encode('circ-2027'), submissionId: encode(id), userId: encode(claims.sub),
        requestId: encode(correction.requestId), requestHash: encode(correction.requestHash), revisionVersion: encode(body.expectedVersion),
        sourceSnapshot: { mapValue: { fields: source.fields } },
        reviewerSnapshots: { arrayValue: { values: works.map((work, index) => ({ mapValue: { fields: {
          email: encode(emails[index]), document: { mapValue: { fields: work.fields } },
        } } })) } },
        resubmittedAt: { timestampValue: at }, resubmittedBy: encode({ uid: claims.sub, email: claims.email || '' }),
        nextRevisionVersion: encode(nextVersion) };
      await store.commitResubmission({ source, assignment, works, draft, historyName: history.name, sourceFields,
        workFields: works.map(work => projectionFields(current, work.data, id, correction, nextVersion, at)), historyFields });
      return reply({ submission: { id, status: 'submitted', revisionVersion: nextVersion, resubmittedAt: at }, duplicate: false });
    } catch (failure) {
      if (failure?.status) return reply({ error: failure.code }, failure.status);
      const conflict = failure?.code === 'conflict';
      return reply({ error: conflict ? 'submission-changed' : 'resubmission-unavailable' }, conflict ? 409 : 503);
    }
  };
}
