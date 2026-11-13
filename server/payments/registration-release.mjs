import { randomUUID } from 'node:crypto';
import { liveDataStamp } from './live-pilot-contract.mjs';
import { isClosedUnpaidMbway } from './live-mbway-lifecycle.mjs';
import { createRegistrationReleaseStore, RegistrationReleaseStoreError, releaseFields } from './registration-release-store.mjs';

const EVENT='circ-2027', ADMIN='circ.chuc@gmail.com', TARGET='araujotiagofc@gmail.com';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const headers={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const blocked=reason=>{throw Object.assign(new Error('registration-release-blocked'),{code:'registration-release-blocked',status:409,reason});};
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const positive=value=>Number.isSafeInteger(value)&&value>0;
const providerId=value=>typeof value==='string'&&/^[1-9]\d{0,17}$/.test(value)||positive(value);
const rowIdentity=(row,uid,id)=>row?.data&&row.version&&row.fields&&row.data.userId===uid&&row.data.eventId===EVENT&&row.data.registrationId===id;
const snap=row=>({id:row.id,name:row.name,version:row.version,fields:row.fields});

function unavailableResponse(stage,error){
  const allowed=/^(?:network|timeout|response|http-(?:400|401|403|404|408|429|500|502|503|504))$/;
  const cause=error instanceof RegistrationReleaseStoreError
    ? error.code==='storage_invalid'?'invalid':allowed.test(error.supportCause||'')?error.supportCause:'response'
    : 'unexpected';
  return reply({error:'registration-release-unavailable',diagnostic:`release-${stage}-${cause}`},503);
}

async function bodyOf(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('invalid-request',400);
  const reader=request.body?.getReader();if(!reader)fail('invalid-request',400);
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>1024){await reader.cancel();fail('invalid-request',400);}chunks.push(Buffer.from(value));}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('invalid-request',400);}
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length!==2||Object.keys(body).some(k=>!['stamp','confirmation'].includes(k))||!HASH.test(body.stamp||''))fail('invalid-request',400);
  if(body.confirmation!=='LIBERTAR NOVA INSCRICAO')fail('confirmation-required',400);
  return body;
}
function validArchive(row,id,stamp){
  const a=row?.data;
  return a?.kind==='registration-release'&&a.eventId===EVENT&&a.registrationId===id&&a.email===TARGET&&a.released===true
    &&UUID.test(a.archiveId||'')&&row.id===`circ-registration-release-${a.archiveId}`&&HASH.test(a.stamp||'')
    &&(stamp===undefined||a.stamp===stamp)&&date(a.archivedAt)&&Array.isArray(a.paymentIds)&&Array.isArray(a.documentIds);
}

function validClosedSupplement(row,uid,registrationId){
  const p=row?.data;
  return UUID.test(row?.id||'')&&p?.id===row.id&&rowIdentity(row,uid,registrationId)
    &&p.kind==='supplementary'&&p.quote?.kind==='supplementary'&&p.quote.eventId===EVENT
    &&positive(p.amountCents)&&p.quote.amountCents===p.amountCents&&p.currency==='EUR'
    &&p.identifier===`circ_live_${row.id.replaceAll('-','')}`&&/^\d{1,30}$/.test(p.reference||'')
    &&isClosedUnpaidMbway(p)&&p.providerState===p.status&&date(p.providerClosure.checkedAt)
    &&p.providerClosure.entity===(p.entity||null)
    &&!p.replacesOrderId&&!p.paymentDate&&!p.fiscalStatus&&!p.fiscalDocumentNo&&!p.fiscalQuote;
}

async function inspect(store,id,uid,tx){
  const registration=await store.readRegistration(id,tx),r=registration.data;
  if(!r)fail('registration-not-found',404);
  if(!registration.version||!registration.fields||r.userId!==uid||r.eventId!==EVENT||r.primaryRegistration!==true||r.isTest!==false||r.testMode!==false
    ||r.participantEmail!==TARGET||r.voucherId||r.companyPurchaseId||r.registrationArchiveId||r.registrationArchivedAt
    ||!['confirmed','cancelled'].includes(r.status)||!UUID.test(r.payment?.orderId||''))blocked('registration-state');
  if(r.openSupplementaryOrderId||!['paid','refunded'].includes(r.payment?.status))blocked('open-payment');
  if(r.fiscalPendingOrderId)blocked('fiscal-pending');
  const profile=await store.readProfile(uid,tx);
  if(profile.data?.email!==TARGET||!profile.version||!profile.fields)blocked('profile-mismatch');
  const payments=await store.related('payments',id,tx),documents=await store.related('documents',id,tx),legacy=await store.related('registrationOrders',id,tx);
  if(payments.length>25||documents.length>25||legacy.length||!payments.length)blocked('linked-order');
  const archiveCache=new Map();
  async function isHistorical(row,collection){
    const marker=row.data?.registrationArchiveId;
    if(!marker){if(row.data?.registrationArchivedAt)blocked('archive-mismatch');return false;}
    if(!UUID.test(marker)||!date(row.data.registrationArchivedAt)||!rowIdentity(row,uid,id))blocked('archive-mismatch');
    if(!archiveCache.has(marker))archiveCache.set(marker,await store.readArchive(marker,tx));
    const archive=archiveCache.get(marker);
    if(!validArchive(archive,id)||archive.data.userId!==uid||archive.data.archivedAt!==row.data.registrationArchivedAt
      ||!archive.data[collection==='payments'?'paymentIds':'documentIds'].includes(row.id))blocked('archive-mismatch');
    return true;
  }
  const activePayments=[],activeDocuments=[];
  for(const p of payments)(await isHistorical(p,'payments')?[]:activePayments).push(p);
  for(const d of documents)(await isHistorical(d,'documents')?[]:activeDocuments).push(d);
  const closedId=r.lastClosedSupplementaryOrderId;
  if(closedId&&(r.status!=='confirmed'||r.payment.status!=='paid'
    ||!validClosedSupplement(activePayments.find(p=>p.id===closedId),uid,id)
    ||documents.some(d=>d.id===closedId)))blocked('closed-attempt-unverified');
  const settledPayments=activePayments.filter(p=>p.id!==closedId);
  if(!settledPayments.length)blocked('linked-order');
  if(settledPayments.some(row=>!['paid','refunded'].includes(row.data?.status)))blocked('open-payment');
  if(activeDocuments.length!==settledPayments.length)blocked('document-mismatch');
  const primary=settledPayments.filter(p=>(p.data.kind||p.data.quote?.kind)==='primary');
  if(primary.length!==1||primary[0].id!==r.payment.orderId)blocked('linked-order');
  const credits=[],supplementary=[];
  for(const row of settledPayments){
    const p=row.data,kind=p.kind||p.quote?.kind;
    if(!UUID.test(row.id)||p.id!==row.id||!rowIdentity(row,uid,id)||p.environment!=='production'||!['primary','supplementary'].includes(kind)
      ||p.quote?.kind!==kind||p.quote?.eventId!==EVENT||!positive(p.amountCents)||p.currency!=='EUR'
      ||!date(p.paidAt)||typeof p.transactionId!=='string'||!p.transactionId||!/^20\d{2}-\d{2}-\d{2}$/.test(p.paymentDate||'')
      ||p.identifier!==`circ_live_${row.id.replaceAll('-','')}`
      ||!(p.provider==='eupago'&&['multibanco','mbway'].includes(p.method)||p.provider==='internal_bank_transfer'&&p.method==='bank_transfer'||p.provider==='stripe'&&p.method==='stripe_card'))blocked('linked-order');
    if(p.fiscalStatus!=='issued'||!providerId(p.fiscalDocumentId))blocked('fiscal-pending');
    const document=activeDocuments.find(d=>d.id===row.id),d=document?.data;
    if(!document||!rowIdentity(document,uid,id)||d.id!==row.id||d.environment!=='production'||d.provider!=='toconline'
      ||d.type!=='invoice_receipt'||d.status!=='issued'||d.amountCents!==p.amountCents||d.paymentMethod!==p.method
      ||d.orderKind!==kind||!date(d.issuedAt)||!providerId(d.providerDocumentId)||String(d.providerDocumentId)!==String(p.fiscalDocumentId)
      ||typeof d.providerDocumentNo!=='string'||!/^FR\s\S.{0,100}$/.test(d.providerDocumentNo)||p.fiscalDocumentNo!==d.providerDocumentNo)blocked('document-mismatch');
    if(p.provider==='stripe'&&(!/^cs_live_[A-Za-z0-9]{8,240}$/.test(p.reference||'')||!/^pi_[A-Za-z0-9]{8,240}$/.test(p.transactionId||'')||p.stripe?.id!==p.reference
      ||p.stripe.status!=='complete'||p.stripe.paymentStatus!=='paid'||p.stripe.paymentIntentId!==p.transactionId
      ||!['credit','debit'].includes(p.stripeInstrument?.funding)))blocked('linked-order');
    if(kind==='supplementary')supplementary.push(row.id);
    if(p.method==='bank_transfer'){
      const c=p.bankTransfer?.confirmation,key=c?.creditKey;
      if(p.reference!==row.id||p.bankTransfer?.paymentReference!==row.id||p.bankTransfer.status!=='confirmed'||!HASH.test(key||'')
        ||!UUID.test(c.decisionId||'')||!HASH.test(c.requestHash||'')||c.amountCents!==p.amountCents||c.currency!=='EUR'
        ||c.bookingDate!==p.paymentDate||p.transactionId!==`bank_${key}`||!date(c.confirmedAt))blocked('linked-order');
      const credit=await store.readCredit(key,tx),v=credit.data;
      if(!credit.version||!credit.fields||v?.kind!=='bank-credit-live'||v.environment!=='production'||v.eventId!==EVENT||v.orderId!==row.id
        ||v.key!==key||v.decisionId!==c.decisionId||v.requestHash!==c.requestHash||v.creditReference!==c.creditReference
        ||v.bookingDate!==c.bookingDate||v.amountCents!==p.amountCents||v.currency!=='EUR')blocked('linked-order');
      credits.push(credit);
    }
  }
  const p=primary[0].data;
  if(r.payment.status!==p.status||r.payment.amountCents!==p.amountCents||r.payment.currency!==p.currency||r.payment.method!==p.method||r.payment.reference!==p.reference
    ||(p.status==='paid'&&r.status!=='confirmed')||r.addOnOrderCount!==supplementary.length)blocked('linked-order');
  if(r.documentCount!==activeDocuments.length)blocked('document-mismatch');
  const paidIds=r.paidSupplementaryOrderIds||[];
  if(!Array.isArray(paidIds)||paidIds.length!==supplementary.length||new Set(paidIds).size!==paidIds.length||paidIds.some(x=>!supplementary.includes(x)))blocked('linked-order');
  // The primary retry history still requires a settled ledger for each attempt.
  const attempts=r.paymentAttemptOrderIds||[p.id];
  if(!Array.isArray(attempts)||attempts.some(x=>!settledPayments.some(row=>row.id===x))||new Set(attempts).size!==attempts.length)blocked('linked-order');
  const sources=[registration,profile,...payments,...documents,...credits,...archiveCache.values()].map(snap).sort((a,b)=>a.name.localeCompare(b.name));
  const changedNames=new Set([registration,...activePayments,...activeDocuments].map(row=>row.name));
  const guards=sources.filter(source=>!changedNames.has(source.name));
  const stamp=liveDataStamp({operation:'registration-release-v1',registrationId:id,email:TARGET,sources});
  return {registration,payments:activePayments,documents:activeDocuments,credits,guards,stamp,
    preview:{registrationId:id,email:TARGET,name:typeof r.participantName==='string'?r.participantName:'',amountCents:p.amountCents,currency:'EUR',
      paymentStatus:p.status,documentNumbers:activeDocuments.map(d=>d.data.providerDocumentNo).sort(),stamp,allowed:true}};
}

export function createRegistrationReleaseApi({verify,storeFactory=createRegistrationReleaseStore,now=()=>new Date().toISOString(),makeArchiveId=randomUUID}={}){
  return async function handle(request,env){
    const url=new URL(request.url),match=url.pathname.match(/^\/api\/admin\/registrations\/(circ-2027-([A-Za-z0-9_-]{1,128}))\/release$/);
    if(!match)return null;
    if(!['GET','POST'].includes(request.method))return reply({error:'method-not-allowed'},405);
    if(url.search)return reply({error:'invalid-request'},400);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return reply({error:'invalid-origin'},403);
    const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if(!token)return reply({error:'sign-in-required'},401);
    if(!env.FIREBASE_PROJECT_ID)return reply({error:'registration-release-unavailable'},503);
    let claims;try{claims=await verify(token,env.FIREBASE_PROJECT_ID);}catch{return reply({error:'invalid-session'},401);}
    if(claims?.email!==ADMIN||claims.email_verified!==true||!/^[-A-Za-z0-9_]{1,128}$/.test(claims.sub||''))return reply({error:'admin-required'},403);
    let store,tx,stage='parse';
    try{
      const body=request.method==='POST'?await bodyOf(request):null;
      stage='begin';
      store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,token});
      tx=await store.begin();
      const id=match[1],uid=match[2];
      if(body){
        stage='lookup';
        const prior=await store.findArchive(id,body.stamp,tx);
        if(prior.length){
          if(prior.length!==1||!validArchive(prior[0],id,body.stamp)||prior[0].data.userId!==uid)blocked('archive-mismatch');
          return reply({released:true,archiveId:prior[0].data.archiveId,registrationId:id});
        }
      }
      stage='inspect';
      const current=await inspect(store,id,uid,tx);
      if(!body)return reply(current.preview);
      if(body.stamp!==current.stamp)fail('registration-changed');
      stage='prepare';
      const archiveId=makeArchiveId(),archivedAt=now();
      if(!UUID.test(archiveId)||!date(archivedAt))fail('registration-release-unavailable',503);
      const actor={uid:claims.sub,email:ADMIN};
      const archiveFields={...releaseFields({kind:'registration-release',version:1,eventId:EVENT,registrationId:id,userId:uid,email:TARGET,archiveId,
        released:true,stamp:current.stamp,archivedAt,actor,paymentIds:current.payments.map(p=>p.id).sort(),documentIds:current.documents.map(d=>d.id).sort(),
        creditClaimIds:current.credits.map(c=>c.id).sort(),sourceVersions:[current.registration,...current.payments,...current.documents,...current.credits].map(row=>({name:row.name,version:row.version}))}),
        registration:{mapValue:{fields:current.registration.fields}}};
      if(Buffer.byteLength(JSON.stringify(archiveFields))>750000)blocked('archive-mismatch');
      stage='commit';
      await store.commit({registration:current.registration,payments:current.payments,documents:current.documents,guards:current.guards,archiveId,archiveFields,
        archivedAt,auditFields:releaseFields({action:'registration.released',eventId:EVENT,registrationId:id,archiveId,actor,createdAt:archivedAt,
          details:{email:TARGET,stamp:current.stamp,paymentIds:current.payments.map(p=>p.id),documentIds:current.documents.map(d=>d.id)}})});
      return reply({released:true,archiveId,registrationId:id});
    }catch(error){
      if(error?.code==='conflict')return reply({error:'registration-changed'},409);
      if(error?.code==='registration-release-blocked')return reply({error:error.code,reason:error.reason},409);
      if(error?.status&&error.code)return reply({error:error.code},error.status);
      return request.method==='POST'?unavailableResponse(stage,error):reply({error:'registration-release-unavailable'},503);
    }finally{if(tx&&store)try{await store.rollback(tx);}catch{/* The read snapshot may already have expired. */}}
  };
}
