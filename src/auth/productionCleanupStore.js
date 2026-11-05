import { getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { anonymousReviewContent, acceptedReviewIdentity, validReviewerEmail } from './scientificReview';
import { assignScientificReviewers } from './scientificReviewStore';

const EVENT = 'circ-2027';
const LIMIT = 500;
const ARCHIVE_PREFIX = 'circ-production-archive-';
const SOURCE_COLLECTIONS = new Set(['registrations', 'registrationOrders', 'payments', 'documents', 'submissions']);
const SANDBOX_PREFIXES = [
  'circ-checkout-sandbox-', 'circ-eupago-sandbox-',
  'circ-bank-proof-sandbox-', 'circ-bank-credit-sandbox-',
];
const SANDBOX_KINDS = new Set(['checkout-test', 'gateway-test', 'bank-proof-test', 'bank-credit-test']);

// Dates, names, email addresses and unpaid status do not prove a test record.
// An explicit marker is required before anything leaves an active collection.
const explicitTest = data => data?.isTest === true || data?.testMode === true || data?.environment === 'sandbox';

function fail(code) { throw new Error(`cleanup/${code}`); }
function database(user) {
  if (!isAdminUser(user)) fail('admin-required');
  const db = getFirebaseFirestore();
  if (!db || !window.firebase?.firestore?.FieldValue) fail('unavailable');
  return db;
}
const timestamp = () => window.firebase.firestore.FieldValue.serverTimestamp();
const actor = user => ({ uid: user.uid, email: user.email || '' });
function normalize(value) {
  if (value?.toMillis) return { timestamp: value.toMillis() };
  if (value instanceof Date) return { timestamp: value.getTime() };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  return value;
}
const signature = value => JSON.stringify(normalize(value));
function millis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds != null) return Number(value.seconds) * 1000;
  return value ? new Date(value).getTime() : 0;
}
function newerThan(data, cutoff) {
  return ['createdAt', 'updatedAt', 'submittedAt', 'recordedAt'].some(key => millis(data[key]) > cutoff);
}
function unpackSandbox(data) {
  try { return typeof data.payload === 'string' ? JSON.parse(data.payload) : null; }
  catch { return null; }
}
function sandboxRecord(id, data) {
  const value = unpackSandbox(data);
  return SANDBOX_PREFIXES.some(prefix => id.startsWith(prefix))
    && value?.environment === 'sandbox' && SANDBOX_KINDS.has(value.kind)
    && (!value.eventId || value.eventId === EVENT) ? value : null;
}
function validSourcePath(path) {
  const [collection, id, ...extra] = String(path).split('/');
  if (!id || extra.length) return false;
  return SOURCE_COLLECTIONS.has(collection)
    || (collection === 'settings' && SANDBOX_PREFIXES.some(prefix => id.startsWith(prefix)))
    || collection === 'scientificReviewIdentities';
}
function row(document, collection) {
  const data = document.data();
  return { id: document.id, path: `${collection}/${document.id}`, data, signature: signature(data) };
}
async function readCollection(db, collection, eventOnly = false) {
  const base = db.collection(collection);
  const snapshot = await (eventOnly ? base.where('eventId', '==', EVENT) : base).limit(LIMIT + 1).get();
  if (snapshot.docs.length > LIMIT) fail('inventory-too-large');
  return snapshot.docs.map(document => row(document, collection));
}
async function readSandbox(db) {
  const lists = await Promise.all(SANDBOX_PREFIXES.map(async prefix => {
    const snapshot = await db.collection('settings').orderBy(window.firebase.firestore.FieldPath.documentId())
      .startAt(prefix).endAt(`${prefix}\uf8ff`).limit(LIMIT + 1).get();
    if (snapshot.docs.length > LIMIT) fail('inventory-too-large');
    return snapshot.docs.map(document => row(document, 'settings')).filter(item => sandboxRecord(item.id, item.data));
  }));
  return lists.flat();
}
function realIssued(document) {
  return document.environment === 'production'
    || (document.status === 'issued' && document.isTest !== true && document.testMode !== true)
    || (document.providerDocumentId && document.status !== 'simulated-issued');
}
function realFinancialItem(item) {
  return (item.path.startsWith('payments/') && item.data.environment === 'production')
    || (item.path.startsWith('registrationOrders/') && item.data.environment === 'production')
    || (item.path.startsWith('documents/') && realIssued(item.data));
}
function protectsRegistration(registration, related) {
  if (related.some(realFinancialItem)) return true;
  const test = registration.isTest === true || registration.testMode === true;
  if (!test && related.some(item => item.path.startsWith('payments/')
    && ['paid', 'refunded'].includes(item.data.status) && Number(item.data.amountCents) > 0
    && item.data.isTest !== true && item.data.testMode !== true && item.data.environment !== 'sandbox')) return true;
  return !test && ['paid', 'refunded'].includes(registration.payment?.status)
    && (Number(registration.payment?.amountCents) > 0 || Number(registration.payment?.coveredAmountCents) > 0 || Boolean(registration.voucherId));
}
const activeAssignment = assignment => assignment && (!Array.isArray(assignment.reviewerEmails) || assignment.reviewerEmails.length > 0);

export async function prepareProductionCleanup(user, { cutoff = Date.now() } = {}) {
  const db = database(user);
  if (!Number.isFinite(cutoff) || cutoff > Date.now() + 1000) fail('invalid-cutoff');
  const [registrations, submissions, orders, payments, documents, assignments, sandbox, reviewConfig] = await Promise.all([
    readCollection(db, 'registrations', true), readCollection(db, 'submissions', true),
    readCollection(db, 'registrationOrders'), readCollection(db, 'payments'), readCollection(db, 'documents'),
    readCollection(db, 'scientificReviewAssignments', true), readSandbox(db),
    db.collection('reviewConfiguration').doc(EVENT).get(),
  ]);
  const groups = [], protectedItems = [], recent = [];
  const claimed = new Set();
  const relatedItems = [...orders, ...payments, ...documents];
  registrations.forEach(registration => {
    const related = relatedItems.filter(item => item.data.registrationId === registration.id
      || (item.path.startsWith('payments/') && item.id === registration.id));
    related.forEach(item => claimed.add(item.path));
    if (protectsRegistration(registration.data, related)) {
      protectedItems.push({ type: 'registration', id: registration.id, reason: 'financial-record' });
      return;
    }
    if (!explicitTest(registration.data)) {
      protectedItems.push({ type: 'registration', id: registration.id, reason: 'not-confirmed-test' });
      return;
    }
    if (newerThan(registration.data, cutoff) || related.some(item => newerThan(item.data, cutoff))) {
      recent.push({ type: 'registration', id: registration.id }); return;
    }
    groups.push({ type: 'registration', id: registration.id, sources: [registration, ...related] });
  });
  await Promise.all(submissions.map(async submission => {
    if (!explicitTest(submission.data)) {
      protectedItems.push({ type: 'submission', id: submission.id, reason: 'not-confirmed-test' }); return;
    }
    const assignment = assignments.find(item => item.id === submission.id);
    if (newerThan(submission.data, cutoff)) { recent.push({ type: 'submission', id: submission.id }); return; }
    let reviewBackup = null;
    if (assignment && activeAssignment(assignment.data)) {
      const emails = assignment.data.reviewerEmails;
      if (reviewConfig.data()?.enabled !== true || !['submitted', 'under_review', 'revisions', 'accepted', 'rejected'].includes(submission.data.status)
        || !Array.isArray(emails) || emails.length > 3 || new Set(emails).size !== emails.length
        || !emails.every(email => typeof email === 'string' && email === email.toLowerCase() && validReviewerEmail(email))) {
        protectedItems.push({ type: 'submission', id: submission.id, reason: 'review-linked' }); return;
      }
      const workSnapshots = await Promise.all(emails.map(email => db.doc(`scientificReviewers/${email}/works/${submission.id}`).get()));
      const identity = await db.collection('scientificReviewIdentities').doc(submission.id).get();
      const works = workSnapshots.map((snapshot, index) => ({ path: `scientificReviewers/${emails[index]}/works/${submission.id}`,
        exists: snapshot.exists, data: snapshot.exists ? snapshot.data() : null, signature: signature(snapshot.exists ? snapshot.data() : null) }));
      if (newerThan(assignment.data, cutoff) || works.some(work => work.exists && newerThan(work.data, cutoff))) {
        recent.push({ type: 'submission', id: submission.id }); return;
      }
      reviewBackup = { assignment, works, identity: { path: `scientificReviewIdentities/${submission.id}`,
        exists: identity.exists, data: identity.exists ? identity.data() : null, signature: signature(identity.exists ? identity.data() : null) } };
    }
    groups.push({ type: 'submission', id: submission.id, sources: [submission], ...(reviewBackup ? { reviewBackup } : {}) });
  }));
  relatedItems.forEach(item => {
    if (claimed.has(item.path) || item.data.eventId !== EVENT) return;
    if (!explicitTest(item.data) || realFinancialItem(item)) return;
    if (newerThan(item.data, cutoff)) { recent.push({ type: 'related', id: item.id }); return; }
    groups.push({ type: 'related', id: item.path, sources: [item] });
  });
  sandbox.forEach(item => {
    const value = unpackSandbox(item.data);
    if (newerThan(value, cutoff)) { recent.push({ type: 'sandbox', id: item.id }); return; }
    groups.push({ type: 'sandbox', id: item.id, sources: [item] });
  });
  if (groups.length > LIMIT) fail('inventory-too-large');
  if (groups.some(group => group.sources.length > 100 || new Blob([signature({ sources: group.sources, reviewBackup: group.reviewBackup || null })]).size > 750000)) fail('group-too-large');
  return {
    owner: user.uid, cutoff, preparedAt: Date.now(), groups, protectedItems, recent,
    totals: { registrations: registrations.length, submissions: submissions.length, sandbox: sandbox.length },
    eligible: { registrations: groups.filter(group => group.type === 'registration').length,
      submissions: groups.filter(group => group.type === 'submission').length,
      sandbox: groups.filter(group => group.type === 'sandbox').length,
      related: groups.filter(group => group.type === 'related').length },
  };
}

function assertPlan(user, plan) {
  if (plan?.owner !== user.uid || !Array.isArray(plan.groups) || !Number.isFinite(plan.cutoff)) fail('invalid-plan');
  if (Date.now() - plan.preparedAt > 15 * 60 * 1000) fail('plan-expired');
  const paths = plan.groups.flatMap(group => group.sources.map(source => source.path));
  if (paths.some(path => !validSourcePath(path)) || new Set(paths).size !== paths.length) fail('invalid-plan');
}

export async function archiveProductionCleanup(user, plan, onProgress = () => {}) {
  const db = database(user);
  assertPlan(user, plan);
  const manifest = db.collection('settings').doc();
  const archiveId = `${ARCHIVE_PREFIX}${manifest.id}`;
  const manifestRef = db.collection('settings').doc(archiveId);
  await manifestRef.set({ kind: 'production-cleanup-archive', eventId: EVENT, cutoff: new Date(plan.cutoff).toISOString(),
    selection: 'explicit-test-only', createdAt: timestamp(), createdBy: actor(user), groupCount: plan.groups.length, completedGroups: 0, status: 'running' });
  let completed = 0;
  try {
    for (const [index, group] of plan.groups.entries()) {
      const archiveItemRef = db.collection('settings').doc(`${archiveId}-item-${String(index).padStart(5, '0')}`);
      if (group.reviewBackup) {
        if (group.type !== 'submission' || group.sources[0].path !== `submissions/${group.id}`
          || group.reviewBackup.assignment.path !== `scientificReviewAssignments/${group.id}`
          || group.reviewBackup.identity.path !== `scientificReviewIdentities/${group.id}`) fail('invalid-plan');
        // The source must remain present while Firestore validates the unlink.
        // Preserve the original source, assignment, identities and evaluations
        // in the same atomic operation that makes reviewer copies inactive.
        await db.runTransaction(async tx => {
          const sourceRef = db.doc(group.sources[0].path);
          const assignmentRef = db.doc(group.reviewBackup.assignment.path);
          const config = await tx.get(db.collection('reviewConfiguration').doc(EVENT));
          const source = await tx.get(sourceRef);
          const assignment = await tx.get(assignmentRef);
          const workRefs = group.reviewBackup.works.map(work => db.doc(work.path));
          const works = await Promise.all(workRefs.map(ref => tx.get(ref)));
          const identityRef = db.doc(group.reviewBackup.identity.path);
          const identity = await tx.get(identityRef);
          if (config.data()?.enabled !== true) fail('review-linked');
          if (source.data()?.eventId !== EVENT || source.data()?.status === 'draft') fail('review-linked');
          if (!explicitTest(source.data())) fail('not-confirmed-test');
          if (!source.exists || signature(source.data()) !== group.sources[0].signature
            || !assignment.exists || signature(assignment.data()) !== group.reviewBackup.assignment.signature
            || works.some((work, i) => signature(work.exists ? work.data() : null) !== group.reviewBackup.works[i].signature)
            || signature(identity.exists ? identity.data() : null) !== group.reviewBackup.identity.signature) fail('source-changed');
          tx.set(archiveItemRef, { kind: 'production-cleanup-item', eventId: EVENT, archiveId, groupType: group.type,
            sources: [{ path: sourceRef.path, data: source.data() }], reviewBackup: {
              assignment: { path: assignmentRef.path, data: assignment.data() },
              works: group.reviewBackup.works.map((work, i) => ({ path: work.path, exists: works[i].exists, data: works[i].exists ? works[i].data() : null })),
              identity: { path: identityRef.path, exists: identity.exists, data: identity.exists ? identity.data() : null },
            }, phase: 'reviews-unlinked', archivedAt: timestamp(), archivedBy: actor(user), restored: false });
          tx.set(assignmentRef, { eventId: EVENT, reviewerEmails: [], updatedAt: timestamp(), updatedBy: user.uid });
          workRefs.forEach((ref, i) => tx.set(ref, { ...anonymousReviewContent(source.data(), group.id), active: false,
            evaluation: works[i].data()?.evaluation || null, updatedAt: timestamp(), assignedBy: user.uid }));
          if (source.data().status === 'accepted') tx.set(identityRef, acceptedReviewIdentity(source.data()));
          else tx.delete(identityRef);
          tx.set(db.collection('auditLogs').doc(), { action: 'production.cleanup.reviews-unlinked', eventId: EVENT,
            archiveId, submissionId: group.id, actor: actor(user), createdAt: timestamp() });
        });
      }
      if (group.type === 'registration') {
        // Recheck related IDs before entering the transaction. The transaction
        // also checks the source registration and every frozen child record.
        const linked = await Promise.all(['registrationOrders', 'payments', 'documents'].map(async collection => {
          const snapshot = await db.collection(collection).where('registrationId', '==', group.id).limit(LIMIT + 1).get();
          if (snapshot.docs.length > LIMIT) fail('inventory-too-large');
          return snapshot.docs.map(document => `${collection}/${document.id}`);
        }));
        const planned = group.sources.slice(1).map(source => source.path);
        const current = linked.flat();
        // Legacy summaries may be keyed by the registration ID without a link.
        const legacy = `payments/${group.id}`;
        if (planned.includes(legacy) && !current.includes(legacy)) current.push(legacy);
        if (signature([...planned].sort()) !== signature(current.sort())) fail('source-changed');
      }
      await db.runTransaction(async tx => {
        const refs = group.sources.map(source => db.doc(source.path));
        const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
        if (snapshots.some((snapshot, sourceIndex) => !snapshot.exists
          || signature(snapshot.data()) !== group.sources[sourceIndex].signature)) fail('source-changed');
        let identity = null;
        if (group.type === 'submission') {
          const assignment = await tx.get(db.collection('scientificReviewAssignments').doc(group.id));
          if (assignment.exists && activeAssignment(assignment.data())) fail('review-linked');
          const identityRef = db.collection('scientificReviewIdentities').doc(group.id);
          const snapshot = await tx.get(identityRef);
          if (snapshot.exists) identity = { ref: identityRef, data: snapshot.data() };
        }
        const currentSources = group.sources.map((source, i) => ({ ...source, data: snapshots[i].data() }));
        if (currentSources.some(realFinancialItem)) fail('financial-record');
        if (group.type !== 'sandbox' && !explicitTest(currentSources[0].data)) fail('not-confirmed-test');
        if (group.type === 'registration' && protectsRegistration(currentSources[0].data, currentSources.slice(1))) fail('financial-record');
        if (group.type === 'sandbox' && !sandboxRecord(group.sources[0].id, currentSources[0].data)) fail('invalid-plan');
        const sources = currentSources.map(source => ({ path: source.path, data: source.data }));
        if (identity && !group.reviewBackup) sources.push({ path: identity.ref.path, data: identity.data });
        if (group.reviewBackup) {
          const archived = await tx.get(archiveItemRef);
          if (archived.data()?.phase !== 'reviews-unlinked' || archived.data()?.restored) fail('source-changed');
          tx.update(archiveItemRef, { phase: 'archived', updatedAt: timestamp() });
        } else tx.set(archiveItemRef, { kind: 'production-cleanup-item', eventId: EVENT, archiveId, groupType: group.type,
          sources, archivedAt: timestamp(), archivedBy: actor(user), restored: false });
        refs.forEach(ref => tx.delete(ref));
        if (identity) tx.delete(identity.ref);
        tx.set(db.collection('auditLogs').doc(), { action: 'production.cleanup.archived', eventId: EVENT,
          archiveId, sourcePaths: sources.map(source => source.path), actor: actor(user), createdAt: timestamp() });
        tx.update(manifestRef, { completedGroups: index + 1, updatedAt: timestamp() });
      });
      completed++;
      onProgress({ completed, total: plan.groups.length });
    }
    await manifestRef.update({ status: 'completed', completedAt: timestamp() });
    return { archiveId, completed, total: plan.groups.length };
  } catch (error) {
    try { await manifestRef.update({ status: 'partial', completedGroups: completed, updatedAt: timestamp() }); } catch { /* Preserve the already committed archive items. */ }
    const issue = new Error(error.message?.startsWith('cleanup/') ? error.message : 'cleanup/archive-failed');
    issue.archiveId = archiveId; issue.completed = completed;
    throw issue;
  }
}

export async function restoreProductionCleanup(user, archiveId) {
  const db = database(user);
  if (typeof archiveId !== 'string' || !/^circ-production-archive-[A-Za-z0-9_-]{1,128}$/.test(archiveId)) fail('invalid-archive');
  const manifestRef = db.collection('settings').doc(archiveId);
  const manifest = await manifestRef.get();
  if (!manifest.exists || manifest.data().kind !== 'production-cleanup-archive' || manifest.data().eventId !== EVENT) fail('invalid-archive');
  if (!['completed', 'partial', 'restored'].includes(manifest.data().status)) fail('archive-running');
  const snapshot = await db.collection('settings').orderBy(window.firebase.firestore.FieldPath.documentId())
    .startAt(`${archiveId}-item-`).endAt(`${archiveId}-item-\uf8ff`).limit(LIMIT + 1).get();
  if (snapshot.docs.length > LIMIT) fail('inventory-too-large');
  let restored = 0;
  for (const item of snapshot.docs) {
    let reviewEmails = null;
    await db.runTransaction(async tx => {
      const current = await tx.get(item.ref);
      const value = current.data();
      if (value?.restored) return;
      if (value?.kind !== 'production-cleanup-item' || value.archiveId !== archiveId || value.eventId !== EVENT
        || !Array.isArray(value.sources) || value.sources.some(source => !validSourcePath(source.path))) fail('invalid-archive');
      const refs = value.sources.map(source => db.doc(source.path));
      const destinations = await Promise.all(refs.map(ref => tx.get(ref)));
      const linked = value.reviewBackup?.assignment?.data?.reviewerEmails;
      if (linked && (!Array.isArray(linked) || linked.length > 3 || !linked.every(validReviewerEmail))) fail('invalid-archive');
      if (destinations.some((destination, index) => destination.exists
        && (!linked || !['reviews-unlinked', 'source-restored'].includes(value.phase)
          || signature(destination.data()) !== signature(value.sources[index].data)))) fail('restore-conflict');
      refs.forEach((ref, index) => { if (!destinations[index].exists) tx.set(ref, value.sources[index].data); });
      reviewEmails = linked || null;
      tx.update(item.ref, linked ? { phase: 'source-restored', updatedAt: timestamp() }
        : { restored: true, restoredAt: timestamp(), restoredBy: actor(user) });
      tx.set(db.collection('auditLogs').doc(), { action: 'production.cleanup.restored', eventId: EVENT,
        archiveId, sourcePaths: value.sources.map(source => source.path), actor: actor(user), createdAt: timestamp() });
    });
    if (reviewEmails) {
      try { await assignScientificReviewers(user, item.data().sources[0].path.split('/')[1], reviewEmails); }
      catch { fail('reviewer-restore-required'); }
      await item.ref.update({ restored: true, restoredAt: timestamp(), restoredBy: actor(user) });
    }
    restored++;
  }
  await manifestRef.update({ status: 'restored', restoredAt: timestamp(), restoredBy: actor(user) });
  return { archiveId, restored };
}
