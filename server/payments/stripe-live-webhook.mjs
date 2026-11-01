import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore,readLivePaymentById,LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createStripeLive,matchStripeLiveSession,stripeLiveConfiguration,STRIPE_LIVE_FLOW,STRIPE_LIVE_WEBHOOK_PATH } from './stripe-live.mjs';
import { verifyStripeEvent } from './stripe-webhook.mjs';
import { quotePrimary,quoteSupplementary } from './quote.mjs';
import { buildLivePaymentFR } from './toconline-live-payload.mjs';
import { completeLiveFiscalJob } from './live-fiscal-issue.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';

const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const WALLETS=new Set(['apple_pay','google_pay','link','amex_express_checkout','masterpass','samsung_pay','visa_checkout']);
export const minimalStripeInstrument=value=>({funding:['credit','debit','prepaid','unknown'].includes(value?.funding)?value.funding:'unknown',wallet:WALLETS.has(value?.wallet)?value.wallet:null});
async function bytes(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid');
  const chunks=[];let length=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>65536){await reader.cancel();throw new Error('invalid');}chunks.push(Buffer.from(chunk.value));}
  return Buffer.concat(chunks);
}
function lisbonDate(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${map.year}-${map.month}-${map.day}`;
}

export function createStripeLiveWebhook({tokenProvider=createPaymentsServiceTokenProvider(),storeFactory=createCheckoutLiveStore,
  paymentLookup=readLivePaymentById,providerFactory=createStripeLive,fiscalClient=createToconlineLiveClient(),now=()=>new Date().toISOString()}={}){
  return async function handle(request,env){
    const url=new URL(request.url);if(url.pathname!==STRIPE_LIVE_WEBHOOK_PATH)return null;
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
    if(url.search||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'invalid_request'},400);
    if(!stripeLiveConfiguration(env).ready)return reply({error:'stripe_not_configured'},503);
    let event;try{event=verifyStripeEvent(await bytes(request),request.headers.get('Stripe-Signature'),env.STRIPE_LIVE_WEBHOOK_SECRET,Date.parse(now()));}
    catch{return reply({error:'invalid_signature_or_body'},400);}
    if(event?.object!=='event'||event.livemode!==true||event.account||!/^evt_[A-Za-z0-9]+$/.test(event.id||'')
      ||!Number.isSafeInteger(event.created)||event.created<1577836800||event.created>Math.floor(Date.parse(now())/1000)+300)return reply({error:'invalid_event'},422);
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type))return reply({received:true,ignored:true});
    const snapshot=event.data?.object,meta=snapshot?.metadata;
    if(meta?.integration!==STRIPE_LIVE_FLOW)return reply({received:true,ignored:true});
    if(!LIVE_ORDER_UUID.test(meta.order_id||'')||!/^[A-Za-z0-9_-]{1,128}$/.test(meta.owner||'')||meta.environment!=='production'
      ||meta.event_id!=='circ-2027'||meta.registration_id!==`circ-2027-${meta.owner}`||!['primary','supplementary'].includes(meta.order_kind))return reply({error:'invalid_event'},422);
    let serviceToken,located;
    try{serviceToken=await tokenProvider(env);located=await paymentLookup({projectId:env.FIREBASE_PROJECT_ID,token:serviceToken,orderId:meta.order_id});}
    catch{return reply({error:'storage_unavailable'},503);}
    const p=located?.data,id=meta.order_id;
    if(!p)return reply({error:'payment_not_found'},404);
    if(p.id!==id||p.environment!=='production'||p.provider!=='stripe'||p.method!=='stripe_card'||p.userId!==meta.owner
      ||p.registrationId!==meta.registration_id||p.eventId!=='circ-2027'||p.kind!==meta.order_kind)return reply({error:'payment_mismatch'},422);
    let signed;try{signed=matchStripeLiveSession(snapshot,p);}catch{return reply({error:'payment_mismatch'},422);}
    if(p.transactionId&&signed.paymentIntentId&&p.transactionId!==signed.paymentIntentId)return reply({error:'payment_transaction_conflict'},409);
    if(['paid','refunded'].includes(p.status))return reply({received:true,duplicate:true,fiscalStatus:p.fiscalStatus||null});
    if((p.paidAt||p.transactionId||p.registrationArchiveId)&&['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type))return reply({received:true,duplicate:true,reviewRequired:true});
    if(!['creating','creation_unknown','pending','expired','review_required'].includes(p.status))return reply({error:'payment_state_conflict'},409);
    const store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:p.userId,token:serviceToken});
    try{
      const provider=providerFactory({apiKey:env.STRIPE_LIVE_SECRET_KEY});
      const current=await provider.inspectReference({...p,reference:signed.id});
      if(current.id!==signed.id)return reply({error:'payment_mismatch'},422);
      if(event.type==='checkout.session.expired'){
        if(current.status!=='expired'||current.paymentStatus!=='unpaid')return reply({error:'reconciliation_pending'},503);
        await store.updatePayment(id,{...p,reference:current.id,stripe:current,status:'expired',providerState:'expired',retryAllowed:false,updatedAt:now()},located.version);
        return reply({received:true,expired:true});
      }
      if(event.type==='checkout.session.async_payment_failed'){
        if(current.status!=='complete'||current.paymentStatus!=='unpaid')return reply({error:'reconciliation_pending'},503);
        await store.updatePayment(id,{...p,reference:current.id,stripe:current,status:'review_required',reviewReason:'stripe-payment-failed',retryAllowed:false,updatedAt:now()},located.version);
        return reply({received:true,failed:true});
      }
      if(event.type==='checkout.session.completed'&&(signed.paymentStatus!=='paid'||current.paymentStatus!=='paid'))return reply({received:true,pending:true});
      if(signed.status!=='complete'||signed.paymentStatus!=='paid'||current.status!=='complete'||current.paymentStatus!=='paid'
        ||signed.paymentIntentId!==current.paymentIntentId)return reply({error:'reconciliation_pending'},503);
      const paidAt=new Date(event.created*1000).toISOString(),paymentDate=lisbonDate(paidAt);
      const savedRegistration=await store.registration(),r=savedRegistration?.data,kind=p.kind;
      async function review(reason,{preserveRegistration=false}={}){
        const payment={...p,status:'review_required',reference:current.id,stripe:current,transactionId:current.paymentIntentId,paidAt,paymentDate,
          reviewReason:reason,retryAllowed:false,updatedAt:now()};
        if(!r||preserveRegistration)await store.updatePayment(id,payment,located.version);
        else await store.updatePendingProvider({orderId:id,payment,paymentVersion:located.version,registration:{...r,updatedAt:now()},registrationVersion:savedRegistration.version});
        return reply({received:true,reviewRequired:true});
      }
      if(p.registrationArchiveId)return await review('historical-registration-payment',{preserveRegistration:true});
      if(!r||r.userId!==p.userId||r.eventId!=='circ-2027'||r.isTest!==false||r.testMode!==false||r.primaryRegistration!==true)return await review('registration-mismatch',{preserveRegistration:true});
      if(kind==='primary'?r.status!=='submitted'||r.payment?.orderId!==id
        :r.status!=='confirmed'||r.payment?.status!=='paid'||r.openSupplementaryOrderId!==id)return await review('registration-state-mismatch',{preserveRegistration:true});
      const context=await store.context(p.quote?.selection?.profile);
      let expected;
      try{expected=kind==='primary'?quotePrimary(p.quote.selection,{...context,emailVerified:true},null,new Date(`${paymentDate}T12:00:00Z`))
        :quoteSupplementary({morningCourse:p.quote.selection.morningCourse,afternoonCourse:p.quote.selection.afternoonCourse,dinnerQuantity:p.quote.selection.dinnerQuantity},
          {...context,emailVerified:true},{...r,id:store.registrationId},new Date(`${paymentDate}T12:00:00Z`));}
      catch(error){if(['checkout/uls-not-verified','checkout/student-not-approved','checkout/course-already-owned','checkout/paid-registration-required','checkout/invalid-addition'].includes(error.message))return await review('payment-eligibility-review');throw error;}
      if(expected.amountCents!==p.amountCents)return await review('payment-date-tariff-mismatch');
      const linked={...p,reference:current.id,stripe:current};
      let instrument=null;try{instrument=minimalStripeInstrument(await provider.inspectInstrument(linked,current));}catch{/* Financial proof is already complete; classify fiscal readiness separately. */}
      let salesDocument=null,errorCode='stripe-instrument-unconfirmed';
      if(['credit','debit'].includes(instrument?.funding)){
        try{salesDocument=buildLivePaymentFR({orderId:id,quote:expected,billing:{customer:p.billingSnapshot},paymentDate,method:'stripe_card',cardFunding:instrument.funding});}
        catch{errorCode='live-fiscal-payload-blocked';}
      }
      const fiscalStatus=salesDocument?'pending':'review_required',updatedAt=now(),ent=expected.selection,owned=r.entitlements||r.selection;
      const payment={...linked,status:'paid',transactionId:current.paymentIntentId,paidAt,paymentDate,providerState:'paid',fiscalStatus,fiscalQuote:expected,
        ...(instrument?{stripeInstrument:instrument}:{}),stripeNotification:{eventId:event.id,verifiedAt:updatedAt},updatedAt};
      const registration=kind==='primary'?{...r,status:'confirmed',fiscalPendingOrderId:id,
        entitlements:{congressMode:ent.congressMode==='courses-only'?'':ent.congressMode,morningCourse:ent.morningCourse,afternoonCourse:ent.afternoonCourse,dinnerQuantity:ent.dinnerQuantity},
        payment:{orderId:id,status:'paid',amountCents:p.amountCents,currency:'EUR',method:'stripe_card',reference:current.id},updatedAt}
        :{...r,fiscalPendingOrderId:id,entitlements:{...owned,morningCourse:Boolean(owned.morningCourse||ent.morningCourse),afternoonCourse:Boolean(owned.afternoonCourse||ent.afternoonCourse),dinnerQuantity:Number(owned.dinnerQuantity||0)+ent.dinnerQuantity},
          paidSupplementaryOrderIds:[...(r.paidSupplementaryOrderIds||[]),id],supplementaryPaidAmountCents:Number(r.supplementaryPaidAmountCents||0)+p.amountCents,updatedAt};
      const fiscalJob={id,eventId:'circ-2027',registrationId:p.registrationId,userId:p.userId,type:'invoice_receipt',orderKind:kind,environment:'production',
        status:fiscalStatus,provider:'toconline',externalReference:salesDocument?.external_reference||`CIRC27-${id.toUpperCase()}`,amountCents:p.amountCents,
        paymentMethod:'stripe_card',salesDocument,issuanceProtocol:'claimed-v1',...(!salesDocument?{errorCode}:{}),createdAt:updatedAt,updatedAt};
      await store.confirmPrimaryPaid({orderId:id,payment,paymentVersion:located.version,registration,registrationVersion:savedRegistration.version,fiscalJob});
      if(!salesDocument)return reply({received:true,duplicate:false,fiscalStatus});
      const [freshPayment,freshRegistration,freshJob]=await Promise.all([store.payment(id),store.registration(),store.document(id)]);
      const result=await completeLiveFiscalJob({store,orderId:id,payment:freshPayment,registration:freshRegistration,job:freshJob,fiscalClient,env,now});
      return reply({received:true,duplicate:false,fiscalStatus:result});
    }catch(error){return reply({error:error?.code==='conflict'?'retry_notification':'processing_unavailable'},503);}
  };
}
