import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionResubmitApi, canonicalTimestamp } from '../submissions/resubmit.mjs';
import { createSubmissionStore, encode, decode } from '../submissions/store.mjs';

const ID = 'scientific-work';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const at = '2026-11-01T10:00:00.123456Z';
const env = { FIREBASE_PROJECT_ID: 'circ-test', SCIENTIFIC_CORRECTIONS_ENABLED: 'true' };
const claims = { sub: 'author', email: 'author@example.test', email_verified: true };
const sections = { introduction: 'Introdução corrigida', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia' };
const payload = () => ({ requestId: REQUEST, expectedUpdatedAt: '2026-11-01T10:00:00.123456000Z', expectedVersion: 0,
  correction: { title: 'Título corrigido', abstractSections: { ...sections } } });
const record = (name, data, version = 'v1') => ({ name, data: data && structuredClone(data),
  fields: data && encode(data).mapValue.fields, version: data ? version : null });
function fixture({ commitBarrier = false, loseAck = false, apiEnv = env } = {}) {
  let source = record(`submissions/${ID}`, { eventId: 'circ-2027', userId: claims.sub, isTest: false, type: 'oral', code: 'CIRC27-ABCD1234',
    title: 'Título original', authors: 'Author Secret', affiliation: 'Private Hospital', contactName: 'Contact Secret', contactEmail: claims.email,
    status: 'revisions', abstract: 'Resumo anterior', abstractSections: { ...sections, introduction: 'Introdução original' },
    revisionVersion: 0, createdAt: '2026-10-01T10:00:00Z', submittedAt: '2026-10-01T11:00:00Z', updatedAt: at,
    review: { note: 'Corrigir os métodos', updatedAt: at, updatedBy: { uid: 'supervisor', email: 'supervisor@example.test' } } });
  let assignment = record(`scientificReviewAssignments/${ID}`, { eventId: 'circ-2027', reviewerEmails: ['reviewer@example.test'] });
  let draft = record(`submissionCorrectionDrafts/${ID}`, null);
  const works = new Map([['reviewer@example.test', record(`scientificReviewers/reviewer@example.test/works/${ID}`, {
    eventId: 'circ-2027', submissionId: ID, code: 'CIRC27-ABCD1234', type: 'oral', isTest: false, status: 'revisions', active: true,
    revisionVersion: 0, assignedBy: 'supervisor', title: 'Título original', abstract: 'Resumo anterior', abstractSections: source.data.abstractSections,
    evaluation: { scores: { quality: 7 }, comment: 'Private reviewer comment', updatedAt: at, revisionVersion: 0 },
    evaluationHistory: [], updatedAt: at,
  })]]);
  const histories = new Map(), calls = [], commits = [];
  let version = 1, entries = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const clone = value => structuredClone(value);
  const store = token => ({
    source: async () => { calls.push(['source', token]); return clone(source); },
    history: async (id, requestId) => { calls.push(['history', token]); return clone(histories.get(requestId) || record(`scientificRevisionHistory/${id}__${requestId}`, null)); },
    assignment: async () => { calls.push(['assignment', token]); return clone(assignment); },
    draft: async () => { calls.push(['draft', token]); return clone(draft); },
    work: async email => { calls.push(['work', token]); return clone(works.get(email) || record(`scientificReviewers/${email}/works/${ID}`, null)); },
    commitResubmission: async input => {
      if (commitBarrier) { if (++entries === 2) release(); await barrier; }
      if (input.source.version !== source.version || input.assignment.version !== assignment.version
        || input.draft.version !== draft.version || input.works.some(work => work.version !== works.get(work.data?.submissionId ? 'reviewer@example.test' : '')?.version)
        || histories.has(input.historyName.split('__').pop())) throw Object.assign(new Error('conflict'), { code: 'conflict' });
      version++;
      source = { ...input.source, fields: clone(input.sourceFields), data: decode({ mapValue: { fields: input.sourceFields } }), version: `v${version}` };
      input.works.forEach((work, i) => works.set('reviewer@example.test', { ...work, fields: clone(input.workFields[i]), data: decode({ mapValue: { fields: input.workFields[i] } }), version: `v${version}` }));
      histories.set(input.historyName.split('__').pop(), { name: input.historyName, fields: clone(input.historyFields), data: decode({ mapValue: { fields: input.historyFields } }), version: `v${version}` });
      draft = record(draft.name, null); commits.push(clone(input));
      if (loseAck) throw Object.assign(new Error('private transport detail'), { code: 'storage-unavailable' });
    },
  });
  let identity = { ...claims }, serviceCalls = 0;
  const api = createSubmissionResubmitApi({ verify: async () => identity,
    tokenProvider: async () => { serviceCalls++; return 'service-token'; }, storeFactory: ({ token }) => store(token), now: () => '2026-11-01T12:00:00Z' });
  const call = (body = payload(), overrides = {}) => api(new Request(`https://circ.test/api/submissions/${ID}/resubmit`, {
    method: 'POST', headers: { Authorization: 'Bearer author-token', Origin: 'https://circ.test', 'Content-Type': 'application/json', ...overrides.headers },
    body: JSON.stringify(body), ...overrides,
  }), apiEnv);
  return { call, calls, commits, histories, works, setIdentity: value => { identity = value; },
    source: () => source, assignment: () => assignment, setAssignment: value => { assignment = value; },
    setDraft: value => { draft = value; }, serviceCalls: () => serviceCalls };
}

test('a requested correction atomically archives prior evaluation, updates anonymous copies and preserves identity', async () => {
  const f = fixture(), original = structuredClone(f.source().data);
  const response = await f.call(); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.submission.revisionVersion, 1); assert.equal(result.duplicate, false);
  const next = f.source().data;
  for (const key of ['type', 'code', 'userId', 'contactName', 'contactEmail', 'authors', 'affiliation', 'createdAt', 'submittedAt']) assert.deepEqual(next[key], original[key]);
  assert.equal(next.review, undefined); assert.equal(next.status, 'submitted'); assert.equal(next.title, 'Título corrigido');
  const work = f.works.get('reviewer@example.test').data;
  assert.equal(work.revisionVersion, 1); assert.equal(work.evaluation, null); assert.deepEqual(work.evaluationHistory, []);
  assert.equal(work.assignedBy, 'supervisor'); assert.equal(work.active, true); assert.equal(work.abstractSections.introduction, sections.introduction);
  assert.doesNotMatch(JSON.stringify(work), /Author Secret|Private Hospital|Contact Secret|author@example/);
  const historical = f.histories.get(REQUEST).data;
  assert.equal(historical.sourceSnapshot.review.note, original.review.note);
  assert.equal(historical.reviewerSnapshots[0].document.evaluation.comment, 'Private reviewer comment');
  assert.doesNotMatch(JSON.stringify(result), /reviewer|Secret|Hospital/);
  assert.deepEqual(f.calls[0], ['source', 'author-token']); assert.ok(f.calls.slice(1).every(([, token]) => token === 'service-token'));
});

test('the same request is idempotent and a reused identifier with different content is rejected', async () => {
  const f = fixture(); await f.call();
  const repeated = await f.call(); assert.equal(repeated.status, 200); assert.equal((await repeated.json()).duplicate, true); assert.equal(f.commits.length, 1);
  const changed = payload(); changed.correction.title = 'Outra correção';
  assert.equal((await f.call(changed)).status, 409); assert.equal(f.commits.length, 1);
});

test('an earlier retry returns its immutable completed version after subsequent decisions or revisions', async () => {
  const f = fixture();
  const initial = await (await f.call()).json();
  Object.assign(f.source().data, { status: 'accepted', revisionVersion: 3, resubmittedAt: '2026-11-20T12:00:00Z' });
  const retried = await f.call(); assert.equal(retried.status, 200);
  assert.deepEqual((await retried.json()).submission, initial.submission); assert.equal(f.commits.length, 1);
  f.histories.get(REQUEST).data.nextRevisionVersion = 4;
  assert.equal((await f.call()).status, 503); assert.equal(f.commits.length, 1);
});

test('competing commits use CAS and a lost acknowledgement cannot create another version', async () => {
  const competing = fixture({ commitBarrier: true });
  const results = await Promise.all([competing.call(), competing.call()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(competing.commits.length, 1);
  const lost = fixture({ loseAck: true }); assert.equal((await lost.call()).status, 503);
  const recovered = await lost.call(); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).duplicate, true); assert.equal(lost.commits.length, 1);
});

test('ownership and verified identity are checked before privileged access', async () => {
  const foreign = fixture(); foreign.source().data.userId = 'another'; assert.equal((await foreign.call()).status, 404); assert.equal(foreign.serviceCalls(), 0);
  const unverified = fixture(); unverified.setIdentity({ ...claims, email_verified: false }); assert.equal((await unverified.call()).status, 403); assert.equal(unverified.calls.length, 0);
  const noOrigin = fixture(); assert.equal((await noOrigin.call(payload(), { headers: { Authorization: 'Bearer author-token', 'Content-Type': 'application/json' } })).status, 403);
});

test('closed, test, archived, unrequested or stale work cannot be resubmitted', async () => {
  for (const change of [{ status: 'accepted' }, { status: 'submitted' }, { isTest: true }, { archived: true }, { review: null },
    { review: { updatedAt: at, updatedBy: { uid: 'supervisor' } } }, { updatedAt: '2026-11-01T10:00:00.123457Z' }, { revisionVersion: 1 }]) {
    const f = fixture(); Object.assign(f.source().data, change);
    assert.ok([404, 409].includes((await f.call()).status)); assert.equal(f.commits.length, 0);
  }
});

test('arbitrary identity/type/decision fields and invalid corrections are rejected', async () => {
  for (const change of [{ extra: 'field' }, { expectedVersion: '0' }, { expectedUpdatedAt: '2026-02-31T10:00:00Z' },
    { correction: { ...payload().correction, type: 'poster' } }, { correction: { ...payload().correction, authors: 'Other identity' } },
    { correction: { title: 'a'.repeat(241), abstractSections: sections } }, { correction: { title: 'Valid title', abstractSections: { ...sections, methods: '' } } }]) {
    const f = fixture(); assert.equal((await f.call({ ...payload(), ...change })).status, 400); assert.equal(f.commits.length, 0);
  }
});

test('correction draft mismatches are retained rather than cleared by an older tab', async () => {
  const f = fixture();
  f.setDraft(record(`submissionCorrectionDrafts/${ID}`, { eventId: 'circ-2027', submissionId: ID, userId: claims.sub,
    sourceVersion: 0, sourceUpdatedAt: at, correction: { title: 'A newer saved draft', abstractSections: sections } }));
  const response = await f.call(); assert.equal(response.status, 409); assert.equal((await response.json()).error, 'correction-draft-changed'); assert.equal(f.commits.length, 0);
  const saved = fixture(); saved.setDraft(record(`submissionCorrectionDrafts/${ID}`, { eventId: 'circ-2027', submissionId: ID, userId: claims.sub,
    sourceVersion: 0, sourceUpdatedAt: at, correction: payload().correction }));
  assert.equal((await saved.call()).status, 200);
});

test('no assignment is supported, but malformed assignments and mismatched projections are not', async () => {
  const unassigned = fixture(); unassigned.setAssignment(record(`scientificReviewAssignments/${ID}`, null));
  assert.equal((await unassigned.call()).status, 200); assert.equal(unassigned.commits[0].works.length, 0);
  for (const mutate of [f => { f.assignment().data.reviewerEmails = ['author@example.test']; }, f => { delete f.assignment().data.reviewerEmails; },
    f => { f.works.get('reviewer@example.test').data.revisionVersion = 1; }]) {
    const f = fixture(); mutate(f); assert.equal((await f.call()).status, 409); assert.equal(f.commits.length, 0);
  }
});

test('timestamp comparison preserves nanoseconds and rejects rolled calendar dates', () => {
  assert.equal(canonicalTimestamp(at), '2026-11-01T10:00:00.123456000Z');
  assert.notEqual(canonicalTimestamp(at), canonicalTimestamp('2026-11-01T10:00:00.123456001Z'));
  assert.equal(canonicalTimestamp('2026-02-31T10:00:00Z'), null);
});

test('Firestore store uses one atomic commit, preserves timestamp fields and guards absent records', async () => {
  const root = 'projects/circ-test/databases/(default)/documents', requests = [];
  const raw = { name: `${root}/submissions/${ID}`, fields: { eventId: { stringValue: 'circ-2027' }, createdAt: { timestampValue: at } }, updateTime: at };
  const store = createSubmissionStore({ projectId: 'circ-test', token: 'service-token', fetchImpl: async (url, options) => {
    requests.push({ url, options }); assert.equal(options.headers.Authorization, 'Bearer service-token');
    if (options.method === 'GET') return url.endsWith(`/submissions/${ID}`) ? Response.json(raw) : new Response(null, { status: 404 });
    const data = JSON.parse(options.body); return Response.json({ writeResults: data.writes.map(() => ({ updateTime: at })) });
  } });
  const source = await store.source(ID), assignment = await store.assignment(ID), draft = await store.draft(ID), history = await store.history(ID, REQUEST);
  await store.commitResubmission({ source, assignment, draft, works: [], historyName: history.name,
    sourceFields: { ...source.fields, status: encode('submitted') }, workFields: [], historyFields: { sourceSnapshot: { mapValue: { fields: source.fields } } } });
  const commit = requests.at(-1); assert.ok(commit.url.endsWith('/documents:commit'));
  const writes = JSON.parse(commit.options.body).writes;
  assert.deepEqual(writes[0].update.fields.createdAt, { timestampValue: at }); assert.deepEqual(writes[0].currentDocument, { updateTime: at });
  assert.deepEqual(writes[1], { delete: `${root}/scientificReviewAssignments/${ID}`, currentDocument: { exists: false } });
  assert.deepEqual(writes.at(-1), { delete: `${root}/submissionCorrectionDrafts/${ID}`, currentDocument: { exists: false } });
  assert.equal(writes[2].currentDocument.exists, false);
});

test('reviewer document identifiers are encoded as path segments rather than URL queries', async () => {
  let requested;
  const store = createSubmissionStore({ projectId: 'circ-test', token: 'service-token', fetchImpl: async url => {
    requested = url; return new Response(null, { status: 404 });
  } });
  const email = 'reviewer?#tag@example.test';
  const work = await store.work(email, ID);
  assert.ok(requested.includes(`scientificReviewers/${encodeURIComponent(email)}/works/${ID}`));
  assert.equal(new URL(requested).search, ''); assert.equal(new URL(requested).hash, '');
  assert.ok(work.name.endsWith(`/scientificReviewers/${email}/works/${ID}`));
});

test('corrections are disabled by default and only the explicit string flag enables server access', async () => {
  for (const apiEnv of [{ FIREBASE_PROJECT_ID: 'circ-test' }, ...[false, true, 'false', 'TRUE', '', null].map(value => ({ ...env, SCIENTIFIC_CORRECTIONS_ENABLED: value }))]) {
    const f = fixture({ apiEnv });
    const response = await f.call();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'corrections-not-enabled');
    assert.equal(f.calls.length, 0); assert.equal(f.serviceCalls(), 0); assert.equal(f.commits.length, 0);
  }
});
