import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, readLivePaymentById, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createEupagoLive } from './eupago-live.mjs';
import { quotePrimary, quoteSupplementary } from './quote.mjs';
import { buildLiveMultibancoFR } from './toconline-live-payload.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';
import { completeLiveFiscalJob } from './live-fiscal-issue.mjs';

const PATH='/api/payments/live/notifications';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function rawBody(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid');
  const chunks=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>16384){await reader.cancel();throw new Error('invalid');}chunks.push(Buffer.from(chunk.value));}
  return Buffer.concat(chunks);
}
const digits=v=>typeof v==='string'&&/^\d{1,30}$/.test(v)?v:Number.isSafeInteger(v)&&v>=0?String(v):null;
function cents(v){
  const t=typeof v==='number'&&Number.isFinite(v)?String(v):v;
  if(typeof t!=='string'||!/^\d{1,5}(?:\.\d{1,5})?$/.test(t))return null;
  const [w,f='']=t.split('.');const scaled=Number(w)*100+Number(f.padEnd(2,'0').slice(0,2));
  return Number.isSafeInteger(scaled)?scaled:null;
}
function orderId(identifier){
  const m=/^circ_live_([a-f0-9]{32})$/.exec(identifier||'');if(!m)return null;
  const h=m[1];const id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  return LIVE_ORDER_UUID.test(id)?id:null;
}
function parsePaid(bytes,signature,key,channel){
  if(typeof key!=='string'||!key||typeof signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signature))throw new Error('invalid_signature');
  const expected=createHmac('sha256',key).update(bytes).digest();const supplied=Buffer.from(signature,'base64');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new Error('invalid_signature');
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!body||body.data!=null||(body.transactions!=null&&body.transaction!=null)||body.channel?.name!==channel)throw new Error('invalid_event');
  const tx=body.transactions??body.transaction;const id=orderId(tx?.identifier);
  const method=new Map([['Multibanco','multibanco'],['PC:PT','multibanco']]).get(tx?.method);
  const amountCents=cents(tx?.amount?.value);const reference=digits(tx?.reference);const entity=tx?.entity==null?null:digits(tx.entity);const trid=digits(tx?.trid);
  if(!tx||Array.isArray(tx)||tx.status!=='Paid'||!id||method!=='multibanco'||!reference||!/^[0-9]{5}$/.test(entity||'')||!trid
    ||!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>9999900||tx.amount?.currency!=='EUR'
    ||typeof tx.date!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)?$/.test(tx.date))throw new Error('invalid_event');
  const normalizedDate = tx.date.replace(/(?:Z|\+00:00)?$/, 'Z');
  const parsedDate = new Date(normalizedDate);
  if(!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,19)!==tx.date.slice(0,19))throw new Error('invalid_event');
  const event={id,identifier:tx.identifier,method,reference,entity,transactionId:trid,amountCents,currency:'EUR',paidAt:tx.date};
  return {...event,digest:createHash('sha256').update(JSON.stringify(event)).digest('hex')};
}
function lisbonPaymentDate(value){
  const explicit=/(?:Z|\+00:00)$/.test(value);
  if(!explicit)return {date:value.slice(0,10),timezoneUnspecified:true};
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${map.year}-${map.month}-${map.day}`,timezoneUnspecified:false};
}

export function createLivePaymentWebhook({
  tokenProvider=createPaymentsServiceTokenProvider(),
  storeFactory=createCheckoutLiveStore,
  paymentLookup=readLivePaymentById,
  providerFactory=createEupagoLive,
  fiscalClient=createToconlineLiveClient(),
  now=()=>new Date().toISOString(),
}={}) {
  return async function handle(request,env){
    const url=new URL(request.url);if(url.pathname!==PATH)return null;
    if(request.method!=='POST')return json({error:'method_not_allowed'},405);
    if(url.search||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'invalid_request'},400);
    // Closing reference creation must not strand a previously created real payment.
    // HMAC, persisted production order and provider reconciliation remain mandatory.
    if(!env.EUPAGO_LIVE_WEBHOOK_KEY||!env.EUPAGO_LIVE_CHANNEL?.trim()
      ||!env.EUPAGO_LIVE_API_KEY||!env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT||!env.FIREBASE_PROJECT_ID)return json({error:'webhook_not_configured'},503);
    let bytes;try{bytes=await rawBody(request);}catch{return json({error:'invalid_request'},400);}
    let event;try{event=parsePaid(bytes,request.headers.get('X-Signature'),env.EUPAGO_LIVE_WEBHOOK_KEY,env.EUPAGO_LIVE_CHANNEL);}
    catch(error){return json({error:error.message==='invalid_signature'?'invalid_signature':'invalid_event'},error.message==='invalid_signature'?401:422);}
    let serviceToken;try{serviceToken=await tokenProvider(env);}catch{return json({error:'service_unavailable'},503);}
    let located;
    try{located=await paymentLookup({projectId:env.FIREBASE_PROJECT_ID,token:serviceToken,orderId:event.id});}
    catch{return json({error:'storage_unavailable'},503);}
    if(!located?.data)return json({error:'payment_not_found'},404);
    const payment=located.data;
    if(payment.environment!=='production'||payment.provider!=='eupago'||payment.identifier!==event.identifier||payment.method!=='multibanco'
      ||payment.amountCents!==event.amountCents||payment.currency!==event.currency
      ||(payment.reference&&payment.reference!==event.reference)||(payment.entity&&payment.entity!==event.entity)
      ||payment.userId==null||payment.registrationId!==`circ-2027-${payment.userId}`)return json({error:'payment_mismatch'},422);
    if(['paid','refunded'].includes(payment.status)&&payment.transactionId===event.transactionId)return json({received:true,duplicate:true,fiscalStatus:payment.fiscalStatus||null});
    if(!['pending','creating','creation_unknown','review_required'].includes(payment.status))return json({error:'payment_state_conflict'},409);
    const store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:payment.userId,token:serviceToken});
    try{
      const hint=await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).inspectReference({...payment,reference:event.reference,entity:event.entity});
      if(!['paga','pago','transferida'].includes(hint.providerState))return json({error:'reconciliation_pending'},503);
      const paymentDate=lisbonPaymentDate(event.paidAt);if(!paymentDate)return json({error:'invalid_payment_date'},422);
      const registration=await store.registration();
      const original=registration.data;
      const kind=payment.kind||payment.quote?.kind||'primary';
      async function review(reason){
        const p={...payment,status:'review_required',reference:event.reference,entity:event.entity,transactionId:event.transactionId,paidAt:event.paidAt,
          paymentDate:paymentDate.date,providerState:hint.providerState,reviewReason:reason,updatedAt:now()};
        if(!original){await store.updatePayment(event.id,p,located.version);return json({received:true,reviewRequired:true});}
        const r=kind==='primary'&&original.status==='submitted'
          ?{...original,payment:{...original.payment,status:'awaiting_confirmation',reference:event.reference},updatedAt:now()}
          :{...original,updatedAt:now()};
        await store.updatePendingProvider({orderId:event.id,payment:p,paymentVersion:located.version,registration:r,registrationVersion:registration.version});
        return json({received:true,reviewRequired:true});
      }
      if(!original||original.isTest!==false||original.testMode!==false||original.userId!==payment.userId
        ||original.eventId!=='circ-2027'||original.primaryRegistration!==true)return review('registration-mismatch');
      if(kind==='primary'?original.status!=='submitted'
        :kind!=='supplementary'||original.status!=='confirmed'||original.payment?.status!=='paid'
          ||original.openSupplementaryOrderId!==event.id)return review('registration-state-mismatch');
      const ctx=await store.context(payment.quote?.selection?.profile);
      let expected;
      try{
        expected=kind==='primary'?quotePrimary(payment.quote.selection,{...ctx,emailVerified:true},null,new Date(`${paymentDate.date}T12:00:00Z`))
          :quoteSupplementary({morningCourse:payment.quote.selection.morningCourse,afternoonCourse:payment.quote.selection.afternoonCourse,dinnerQuantity:payment.quote.selection.dinnerQuantity},
            {...ctx,emailVerified:true},{...original,id:store.registrationId},new Date(`${paymentDate.date}T12:00:00Z`));
      }catch(error){
        if(['checkout/uls-not-verified','checkout/student-not-approved'].includes(error.message))return review('payment-eligibility-review');
        if(['checkout/course-already-owned','checkout/paid-registration-required','checkout/invalid-addition'].includes(error.message))return review('supplementary-entitlement-review');
        throw error;
      }
      const cutoffAmbiguous=paymentDate.timezoneUnspecified&&['2027-01-31','2027-02-01'].includes(paymentDate.date);
      if(cutoffAmbiguous||expected.amountCents!==event.amountCents)return review(cutoffAmbiguous?'payment-timezone-ambiguous':'payment-date-tariff-mismatch');
      let salesDocument;
      try{salesDocument=buildLiveMultibancoFR({orderId:event.id,quote:expected,billing:{customer:payment.billingSnapshot},paymentDate:paymentDate.date});}
      catch{return review('fiscal-payload-blocked');}
      const p={...payment,kind,status:'paid',reference:event.reference,entity:event.entity,transactionId:event.transactionId,paidAt:event.paidAt,paymentDate:paymentDate.date,
        providerState:hint.providerState,fiscalStatus:'pending',fiscalQuote:expected,updatedAt:now()};
      const ent=expected.selection, owned=original.entitlements||original.selection;
      const r=kind==='primary'?{...original,status:'confirmed',fiscalPendingOrderId:event.id,
        entitlements:{congressMode:ent.congressMode==='courses-only'?'':ent.congressMode,morningCourse:ent.morningCourse,afternoonCourse:ent.afternoonCourse,dinnerQuantity:ent.dinnerQuantity},
        payment:{orderId:event.id,status:'paid',amountCents:event.amountCents,currency:'EUR',method:'multibanco',reference:event.reference},updatedAt:now()}
        :{...original,fiscalPendingOrderId:event.id,entitlements:{...owned,morningCourse:Boolean(owned.morningCourse||ent.morningCourse),afternoonCourse:Boolean(owned.afternoonCourse||ent.afternoonCourse),dinnerQuantity:Number(owned.dinnerQuantity||0)+ent.dinnerQuantity},
          paidSupplementaryOrderIds:[...(original.paidSupplementaryOrderIds||[]),event.id],supplementaryPaidAmountCents:Number(original.supplementaryPaidAmountCents||0)+event.amountCents,updatedAt:now()};
      const job={id:event.id,eventId:'circ-2027',registrationId:payment.registrationId,userId:payment.userId,type:'invoice_receipt',orderKind:kind,
        environment:'production',status:'pending',provider:'toconline',externalReference:salesDocument.external_reference,amountCents:event.amountCents,
        paymentMethod:'multibanco',salesDocument,createdAt:now(),updatedAt:now()};
      await store.confirmPrimaryPaid({orderId:event.id,payment:p,paymentVersion:located.version,registration:r,registrationVersion:registration.version,fiscalJob:job});

      // Payment is already durably confirmed. Billing is best-effort and never changes the webhook acknowledgement to a retry storm.
      const [freshPayment,freshRegistration,freshJob]=await Promise.all([store.payment(event.id),store.registration(),store.document(event.id)]);
      const fiscalStatus=await completeLiveFiscalJob({store,orderId:event.id,payment:freshPayment,
        registration:freshRegistration,job:freshJob,fiscalClient,env,now});
      return json({received:true,duplicate:false,fiscalStatus});
    }catch(error){
      if(error?.code==='conflict')return json({error:'retry_notification'},503);
      return json({error:'processing_unavailable'},503);
    }
  };
}
