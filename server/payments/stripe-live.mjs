// Hosted Checkout owns card entry. Only session/intent identifiers and a small
// funding classification leave this adapter; raw card details never do.
import { createHash } from 'node:crypto';
export const STRIPE_LIVE_API_VERSION = '2026-09-30.endive';
export const STRIPE_LIVE_WEBHOOK_PATH = '/api/payments/stripe/live/notifications';
export const STRIPE_LIVE_FLOW = 'circ-checkout-live';
export const STRIPE_LIVE_SESSION_ID = /^cs_live_[A-Za-z0-9]{8,240}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const INTENT=/^pi_[A-Za-z0-9]{8,240}$/;
const liveKey=value=>typeof value==='string'&&/^(rk|sk)_live_[A-Za-z0-9_-]{8,512}$/.test(value);
const NAMES=Object.freeze({'congress-onsite':'Congresso presencial / Onsite congress','congress-virtual':'Congresso online / Online congress',
  'course-morning':'Curso da manhã / Morning course','course-afternoon':'Curso da tarde / Afternoon course',dinner:'Jantar / Dinner'});
const WALLETS=new Set(['apple_pay','google_pay','link','amex_express_checkout','masterpass','samsung_pay','visa_checkout']);
export class StripeLiveError extends Error {
  constructor(code,definite=false){super(code);this.code=code;this.definite=definite;}
}
const fail=code=>{throw new StripeLiveError(code);};
export function stripeLiveConfiguration(env={}){
  const apiKeyPresent=Boolean(env.STRIPE_LIVE_SECRET_KEY),liveKeyValid=liveKey(env.STRIPE_LIVE_SECRET_KEY);
  const webhookKeyPresent=typeof env.STRIPE_LIVE_WEBHOOK_SECRET==='string'&&/^whsec_[A-Za-z0-9]{8,512}$/.test(env.STRIPE_LIVE_WEBHOOK_SECRET);
  const serviceAccountPresent=Boolean(env.FIREBASE_PROJECT_ID&&env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT);
  return{apiKeyPresent,liveKeyValid,webhookKeyPresent,serviceAccountPresent,ready:liveKeyValid&&webhookKeyPresent&&serviceAccountPresent,
    webhookPath:STRIPE_LIVE_WEBHOOK_PATH,apiVersion:STRIPE_LIVE_API_VERSION};
}
function metadataFor(order){
  if(!order||order.environment!=='production'||order.method!=='stripe_card'||!UUID.test(order.id||'')||!UID.test(order.userId||'')
    ||order.eventId!=='circ-2027'||order.registrationId!==`circ-2027-${order.userId}`
    ||order.identifier!==`circ_live_${order.id.replaceAll('-','')}`||!['primary','supplementary'].includes(order.kind)
    ||order.quote?.kind!==order.kind||order.quote?.eventId!=='circ-2027'||order.quote?.currency!=='EUR'
    ||order.currency!=='EUR'||!Number.isSafeInteger(order.amountCents)||order.amountCents<50||order.amountCents>9999900
    ||order.quote.amountCents!==order.amountCents||(order.provider!==undefined&&order.provider!=='stripe'))fail('stripe/mismatch');
  return{integration:STRIPE_LIVE_FLOW,environment:'production',event_id:'circ-2027',owner:order.userId,
    registration_id:order.registrationId,order_id:order.id,identifier:order.identifier,order_kind:order.kind};
}
export function safeLiveCheckoutUrl(value,sessionId){
  if(typeof value!=='string'||value.length>4096||!STRIPE_LIVE_SESSION_ID.test(sessionId||''))return null;
  try{const u=new URL(value);return u.origin==='https://checkout.stripe.com'&&!u.username&&!u.password
    &&[`/c/pay/${sessionId}`,`/pay/${sessionId}`].includes(u.pathname)?value:null;}catch{return null;}
}
export const safeCheckoutUrl=safeLiveCheckoutUrl;
export function matchStripeLiveSession(session,order){
  const metadata=metadataFor(order);
  if(session?.object!=='checkout.session'||session.livemode!==true||!STRIPE_LIVE_SESSION_ID.test(session.id||'')
    ||(order.reference&&order.reference!==session.id)||(order.stripe?.id&&order.stripe.id!==session.id)
    ||session.mode!=='payment'||session.currency!=='eur'||session.client_reference_id!==order.identifier||session.amount_total!==order.amountCents
    ||!['open','complete','expired'].includes(session.status)||!['paid','unpaid','no_payment_required'].includes(session.payment_status)
    ||!Array.isArray(session.payment_method_types)||session.payment_method_types.length!==1||session.payment_method_types[0]!=='card'
    ||Object.entries(metadata).some(([key,value])=>session.metadata?.[key]!==value)||!Number.isSafeInteger(session.expires_at)||session.expires_at<=0)fail('stripe/mismatch');
  const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;
  if((intent!==null&&!INTENT.test(intent))||(session.payment_status==='paid'&&(session.status!=='complete'||!INTENT.test(intent||'')))
    ||session.payment_status==='no_payment_required')fail('stripe/mismatch');
  const url=session.status==='open'?safeLiveCheckoutUrl(session.url,session.id):null;
  if(session.status==='open'&&!url)fail('stripe/invalid-response');
  return{id:session.id,url,expiresAt:session.expires_at,status:session.status,paymentStatus:session.payment_status,paymentIntentId:intent};
}
async function boundedJson(response){
  const reader=response.body?.getReader();if(!reader)fail('stripe/invalid-response');
  const chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;
    if(size>262144){await reader.cancel();fail('stripe/invalid-response');}chunks.push(Buffer.from(part.value));}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }catch{fail('stripe/invalid-response');}
}
export function createStripeLive({apiKey,fetchImpl=fetch}={}){
  if(!liveKey(apiKey))fail('stripe/live-key-required');
  async function call(path,body,idempotencyKey){
    let response;
    try{response=await fetchImpl(`https://api.stripe.com/v1/${path}`,{method:body?'POST':'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000),
      headers:{Authorization:`Bearer ${apiKey}`,'Stripe-Version':STRIPE_LIVE_API_VERSION,
        ...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey}:{})},
      ...(body?{body:body.toString()}:{})});}
    catch(error){fail(error?.name==='TimeoutError'||error?.name==='AbortError'?'stripe/timeout':'stripe/network');}
    if(!response.ok){
      const code=({400:'stripe/request-rejected',401:'stripe/authentication',403:'stripe/permissions',404:'stripe/session-not-found',409:'stripe/conflict',429:'stripe/rate-limit'})[response.status]||'stripe/unavailable';
      try{await response.body?.cancel();}catch{/* Never expose the upstream body. */}
      throw new StripeLiveError(code,Boolean(body&&[400,401,403].includes(response.status)));
    }
    return boundedJson(response);
  }
  return{
    async createPayment(order){
      const metadata=metadataFor(order),lines=order.quote.lines;
      if(!Array.isArray(lines)||!lines.length||lines.length>5||new Set(lines.map(l=>l?.code)).size!==lines.length
        ||lines.some(l=>!l||!Object.hasOwn(NAMES,l.code)||!Number.isSafeInteger(l.quantity)||l.quantity<1
          ||!Number.isSafeInteger(l.unitAmountCents)||l.unitAmountCents<=0||!Number.isSafeInteger(l.amountCents)
          ||l.amountCents!==l.quantity*l.unitAmountCents)||lines.reduce((sum,l)=>sum+l.amountCents,0)!==order.amountCents)fail('stripe/invalid-quote');
      const landing='https://circ-coimbra.org/conta/inscricoes';
      const body=new URLSearchParams({mode:'payment',client_reference_id:order.identifier,
        success_url:`${landing}?stripe=return&order=${order.id}`,cancel_url:`${landing}?stripe=cancel&order=${order.id}`,locale:'auto',
        'allowed_payment_method_types[0]':'card','automatic_tax[enabled]':'false','adaptive_pricing[enabled]':'false',
        'invoice_creation[enabled]':'false',customer_creation:'if_required'});
      Object.entries(metadata).forEach(([k,v])=>{body.set(`metadata[${k}]`,v);body.set(`payment_intent_data[metadata][${k}]`,v);});
      lines.forEach((line,index)=>{
        body.set(`line_items[${index}][quantity]`,String(line.quantity));body.set(`line_items[${index}][price_data][currency]`,'eur');
        body.set(`line_items[${index}][price_data][unit_amount]`,String(line.unitAmountCents));
        body.set(`line_items[${index}][price_data][product_data][name]`,`CIRC 2027 — ${NAMES[line.code]}`);
      });
      const idempotencyKey=`circ-live-${createHash('sha256').update(`${order.userId}/${order.registrationId}/${order.id}`).digest('hex')}`;
      // One reserved order, one provider POST. A timeout retains uncertainty;
      // the caller must recover that order instead of creating a second one.
      const session=await call('checkout/sessions',body,idempotencyKey);
      return{reference:session.id,entity:null,stripe:matchStripeLiveSession(session,order)};
    },
    async inspectReference(order){
      metadataFor(order);
      if(!STRIPE_LIVE_SESSION_ID.test(order.reference||''))fail('stripe/mismatch');
      return matchStripeLiveSession(await call(`checkout/sessions/${order.reference}`),order);
    },
    async inspectInstrument(order,currentSession){
      const metadata=metadataFor(order);
      if(!STRIPE_LIVE_SESSION_ID.test(order.reference||'')||currentSession?.id!==order.reference||currentSession.status!=='complete'
        ||currentSession.paymentStatus!=='paid'||!INTENT.test(currentSession.paymentIntentId||'')
        ||(order.stripe?.paymentIntentId&&order.stripe.paymentIntentId!==currentSession.paymentIntentId))fail('stripe/instrument-mismatch');
      const intent=await call(`payment_intents/${currentSession.paymentIntentId}?expand%5B%5D=payment_method`);
      if(intent?.object!=='payment_intent'||intent.id!==currentSession.paymentIntentId||intent.livemode!==true||intent.status!=='succeeded'
        ||intent.currency!=='eur'||intent.amount!==order.amountCents||intent.amount_received!==order.amountCents
        ||Object.entries(metadata).some(([key,value])=>intent.metadata?.[key]!==value))fail('stripe/instrument-mismatch');
      const pm=intent.payment_method;
      if(!pm||typeof pm!=='object'||pm.object!=='payment_method'||pm.livemode!==true||pm.type!=='card'||!pm.card||typeof pm.card!=='object')fail('stripe/instrument-mismatch');
      return{funding:['credit','debit','prepaid','unknown'].includes(pm.card.funding)?pm.card.funding:'unknown',
        wallet:WALLETS.has(pm.card.wallet?.type)?pm.card.wallet.type:null};
    },
  };
}
