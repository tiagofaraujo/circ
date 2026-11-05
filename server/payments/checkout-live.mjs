import { canResumeLiveFiscalJob,isUnstartedStripeInstrumentJob } from './live-fiscal-issue.mjs';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createEupagoLive } from './eupago-live.mjs';
import { createStripeLive,stripeLiveConfiguration,safeLiveCheckoutUrl,STRIPE_LIVE_SESSION_ID } from './stripe-live.mjs';
import { capacityDecision, selectionFootprint } from './paid-capacity.mjs';
import { billingCustomerFromProfile } from './toconline-billing-customer.mjs';
import { buildLiveMultibancoFR } from './toconline-live-payload.mjs';
import { livePaymentMethods, liveBankTransferAccount, MBWAY_APPROVAL_WINDOW_MS } from './live-payment-methods.mjs';
import { quotePrimary, quoteSupplementary } from './quote.mjs';
import { REGISTRATION_OPEN_DATE } from '../../src/data/registration2027.js';
import { isClosedUnpaidMbway, canReplaceUnpaidPrimary, holdUnconfirmedMbwayClosure } from './live-mbway-lifecycle.mjs';
import { liveDataStamp as stamp, isLivePilotConfigured, isLiveCheckoutEnabled, isPrivatePilotWindow, livePilotDeadline, PILOT_CONFIRMATION } from './live-pilot-contract.mjs';

const PREFIX='/api/checkout/live', ADMIN='circ.chuc@gmail.com', EVENT='circ-2027';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
const fail=(code,status=400,details={})=>{throw Object.assign(new Error(code),{code,status,details});};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))fail('invalid-request');};
async function body(request){if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('invalid-request');try{return await request.json();}catch{fail('invalid-request');}}
const openForPublic=now=>now.slice(0,10)>=REGISTRATION_OPEN_DATE;
const typeLabel=mode=>mode==='onsite'?'CIRC 2027 · Presencial':mode==='virtual'?'CIRC 2027 · Virtual':'Cursos Pré-Congresso';
const orderKind=p=>p.kind||p.quote?.kind||'primary';
const historical=p=>Boolean(p?.registrationArchiveId);
const paymentProvider=method=>method==='bank_transfer'?'internal_bank_transfer':method==='stripe_card'?'stripe':'eupago';
export const publicLiveOrder=(id,p,{canRetry=false}={})=>({id,kind:orderKind(p),selection:p.quote?.selection||null,status:p.status,amountCents:p.amountCents,currency:p.currency,method:p.method,
  reference:p.reference||null,entity:p.entity||null,paidAt:p.paidAt||null,fiscalStatus:p.fiscalStatus||null,
  ...(historical(p)?{historicalRegistration:true}:{}),
  ...(p.capacityStatus==='review_required'?{capacityStatus:'review_required',capacityUnavailable:p.capacityUnavailable||[]}:{}),
  ...(p.method==='stripe_card'?{stripe:{id:p.reference||null,url:safeLiveCheckoutUrl(p.stripe?.url,p.reference),expiresAt:p.stripe?.expiresAt||null,
    status:p.stripe?.status||null,paymentStatus:p.stripe?.paymentStatus||null},expiresAt:Number.isSafeInteger(p.stripe?.expiresAt)?new Date(p.stripe.expiresAt*1000).toISOString():null,canRetry:false}:{}),
  ...(p.method==='mbway'?{expiresAt:p.expiresAt||null,canRetry:Boolean(!historical(p)&&canRetry&&isClosedUnpaidMbway(p)),...(p.replacementOrderId?{replacementOrderId:p.replacementOrderId}:{})}:{}),
  ...(p.method==='bank_transfer'&&p.bankTransfer?{bankTransfer:Object.fromEntries(['status','revision','payee','iban','paymentReference','reportedAt','confirmedAt','bookingDate'].filter(key=>p.bankTransfer[key]!==undefined).map(key=>[key,p.bankTransfer[key]]))}:{}),
  ...(p.fiscalDocumentId?{fiscalDocumentId:p.fiscalDocumentId,fiscalDocumentNo:p.fiscalDocumentNo||null}:{})});
const realRegistration=(r,uid)=>r?.userId===uid&&r.eventId===EVENT&&r.primaryRegistration===true&&r.isTest===false&&r.testMode===false;
const retryAllowed=(p,r)=>!historical(p)&&realRegistration(r,p.userId)&&isClosedUnpaidMbway(p)&&(orderKind(p)==='primary'?canReplaceUnpaidPrimary(r,p)
  :r.status==='confirmed'&&r.payment?.status==='paid'&&!r.openSupplementaryOrderId&&!r.fiscalPendingOrderId);

export function createCheckoutLiveApi({verify,tokenProvider=createPaymentsServiceTokenProvider(),storeFactory=createCheckoutLiveStore,providerFactory=createEupagoLive,stripeFactory=createStripeLive,now=()=>new Date().toISOString()}={}) {
  return async function handle(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith(PREFIX))return null;
    if(!['GET','POST'].includes(request.method))return reply({error:'method-not-allowed'},405);
    const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if(!token)return reply({error:'sign-in-required'},401);
    if(!env.FIREBASE_PROJECT_ID)return reply({error:'service-unavailable'},503);
    let claims;try{claims=await verify(token,env.FIREBASE_PROJECT_ID);}catch{return reply({error:'invalid-session'},401);}
    if(claims.email_verified!==true)return reply({error:'verified-email-required'},403);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return reply({error:'invalid-origin'},403);
    const isAdmin=String(claims.email||'').toLowerCase()===ADMIN, privatePilot=isPrivatePilotWindow(env);
    const creationEnabled=()=>isLiveCheckoutEnabled(env,Date.parse(now()));
    if(url.pathname===`${PREFIX}/diagnostics`&&request.method==='GET'){
      if(!isAdmin)return reply({error:'admin-required'},403);
      const required=['FIREBASE_PROJECT_ID','FIREBASE_PAYMENTS_SERVICE_ACCOUNT','EUPAGO_LIVE_API_KEY','EUPAGO_LIVE_WEBHOOK_KEY','EUPAGO_LIVE_CHANNEL','TOCONLINE_OAUTH_CLIENT_ID','TOCONLINE_OAUTH_CLIENT_SECRET','TOCONLINE_OAUTH_URL','TOCONLINE_API_URL','TOCONLINE_SESSION_KEY'];
      const stripe=stripeLiveConfiguration(env);
      return reply({environment:'production',liveCheckoutEnabled:creationEnabled(),privatePilot,pilotUntil:livePilotDeadline(env),checks:Object.fromEntries([...required,'STRIPE_LIVE_SECRET_KEY','STRIPE_LIVE_WEBHOOK_SECRET'].map(name=>[name,typeof env[name]==='string'&&env[name].trim().length>0])),channelMatchesExpected:env.EUPAGO_LIVE_CHANNEL==='CIRC 2027',externalValidationPerformed:false,
        stripe:{...stripe,configured:stripe.ready,liveEnabled:env.LIVE_STRIPE_ENABLED==='true',validationOnly:env.LIVE_STRIPE_VALIDATION_ONLY!=='false'}});
    }
    const eupagoReady=isLivePilotConfigured(env,Date.parse(now()));
    const commonReady=creationEnabled()&&['FIREBASE_PROJECT_ID','FIREBASE_PAYMENTS_SERVICE_ACCOUNT','TOCONLINE_OAUTH_CLIENT_ID','TOCONLINE_OAUTH_CLIENT_SECRET','TOCONLINE_OAUTH_URL','TOCONLINE_API_URL','TOCONLINE_SESSION_KEY'].every(key=>typeof env[key]==='string'&&env[key].trim());
    const methods=privatePilot?['multibanco']:livePaymentMethods(env,{isAdmin,emailVerified:claims.email_verified,email:claims.email}).filter(method=>method==='stripe_card'||method==='bank_transfer'?commonReady:eupagoReady);
    const configured=Boolean(privatePilot?eupagoReady&&isAdmin:commonReady&&methods.length);
    if(url.pathname===`${PREFIX}/config`&&request.method==='GET')return reply({enabled:configured,environment:'production',publicOpen:!privatePilot&&openForPublic(now()),pilotAvailable:isAdmin&&configured,methods:configured?methods:[],registrationOpenDate:REGISTRATION_OPEN_DATE});
    const orderMatch=url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)$/);
    const readingOrder=request.method==='GET'&&orderMatch&&LIVE_ORDER_UUID.test(orderMatch[1]);
    const recoveringPrimary=request.method==='GET'&&url.pathname===`${PREFIX}/primary-order`;
    const recoveringSupplement=request.method==='GET'&&url.pathname===`${PREFIX}/supplementary-order`;
    const reconcileMatch=request.method==='POST'&&url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)\/mbway-reconcile$/);
    const stripeReconcile=request.method==='POST'&&url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)\/stripe-reconcile$/);
    const billingReading=request.method==='GET'&&url.pathname===`${PREFIX}/billing-readiness`;
    const capacityReading=request.method==='GET'&&url.pathname===`${PREFIX}/capacity`;
    if(!configured&&!billingReading&&!capacityReading&&!readingOrder&&!recoveringPrimary&&!recoveringSupplement&&!reconcileMatch&&!stripeReconcile)return reply({error:'live-checkout-not-configured'},503);
    let storeToken;try{storeToken=(recoveringPrimary||recoveringSupplement)?token:await tokenProvider(env);}catch{return reply({error:'payments-service-unavailable'},503);}
    let store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:claims.sub,token:storeToken});
    try{
      if(billingReading){
        const profile=await store.profile(),billing=billingCustomerFromProfile(profile.data);
        const name=typeof profile.data?.name==='string'?profile.data.name.replace(/\s+/g,' ').trim():'';
        const issues=[...billing.issues,...(name.length<5||name.length>200?['profile-name-required']:[])];
        return reply({ready:issues.length===0,issues});
      }
      if(capacityReading)return reply(await store.capacity());
      if(stripeReconcile){
        const id=stripeReconcile[1];if(!LIVE_ORDER_UUID.test(id))fail('invalid-request');
        const input=await body(request);exact(input,[]);
        const saved=await store.payment(id),p=saved?.data;
        if(!p||(!isAdmin&&p.userId!==claims.sub)||p.environment!=='production')return reply({error:'not-found'},404);
        if(historical(p)||['paid','refunded'].includes(p.status))return reply({order:publicLiveOrder(id,p)});
        if(p.method!=='stripe_card'||p.provider!=='stripe'||p.id!==id||p.eventId!==EVENT||p.registrationId!==`${EVENT}-${p.userId}`||p.paidAt||p.transactionId)fail('stripe-order-not-reconcilable',409);
        if(!STRIPE_LIVE_SESSION_ID.test(p.reference||''))fail('stripe-session-unconfirmed',409);
        const hint=await stripeFactory({apiKey:env.STRIPE_LIVE_SECRET_KEY}).inspectReference(p);
        const next={...p,stripe:hint,status:hint.status==='expired'&&hint.paymentStatus==='unpaid'?'expired':p.status,
          providerState:hint.paymentStatus==='paid'?'awaiting_signed_confirmation':hint.status,retryAllowed:false,updatedAt:now()};
        await store.updatePayment(id,next,saved.version);
        return reply({order:publicLiveOrder(id,next)});
      }
      if(reconcileMatch){
        const id=reconcileMatch[1];if(!LIVE_ORDER_UUID.test(id))fail('invalid-request');
        const input=await body(request);exact(input,[]);
        const saved=await store.payment(id),p=saved?.data;
        if(!p||(!isAdmin&&p.userId!==claims.sub)||p.environment!=='production')return reply({error:'not-found'},404);
        if(historical(p))return reply({order:publicLiveOrder(id,p)});
        if(isAdmin&&p.userId!==claims.sub)store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:p.userId,token:storeToken});
        const registration=await store.registration(),r=registration?.data;
        if(p.method!=='mbway'||p.provider!=='eupago'||p.id!==id||p.eventId!==EVENT||p.registrationId!==store.registrationId
          ||p.identifier!==`circ_live_${id.replaceAll('-','')}`||!realRegistration(r,p.userId))fail('mbway-order-not-retryable',409);
        if(['paid','refunded'].includes(p.status)||p.replacementOrderId)return reply({order:publicLiveOrder(id,p,{canRetry:retryAllowed(p,r)})});
        if(!['pending','creating','creation_unknown','expired','cancelled',...(p.providerClosure?['review_required']:[])].includes(p.status)||p.transactionId||p.paidAt||p.fiscalStatus||p.fiscalDocumentId)fail('mbway-order-not-retryable',409);
        if(!/^\d{1,30}$/.test(p.reference||''))fail('mbway-reference-unconfirmed',409);
        const hint=await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).inspectReference(p);
        if(!['expired','cancelled'].includes(hint.providerState)){
          if(p.providerClosure){
            const held=holdUnconfirmedMbwayClosure(p,r,hint.providerState,now());
            await store.updatePendingProvider({orderId:id,payment:held.payment,paymentVersion:saved.version,registration:held.registration,registrationVersion:registration.version});
            return reply({order:publicLiveOrder(id,held.payment)});
          }
          return reply({order:publicLiveOrder(id,p)});
        }
        if((await store.document(id))?.data)fail('mbway-order-not-retryable',409);
        const updatedAt=now(),closed={...p,status:hint.providerState,retryAllowed:true,providerState:hint.providerState,
          providerClosure:{source:'eupago-reference-info',state:hint.providerState,checkedAt:updatedAt,reference:p.reference,identifier:p.identifier,entity:p.entity||null},updatedAt};
        let next;
        if(orderKind(p)==='primary'){
          next={...r,payment:{...r.payment,closedUnpaidStatus:closed.status},updatedAt};
          if(!canReplaceUnpaidPrimary(next,closed))fail('mbway-order-not-retryable',409);
        }else{
          const open=r.openSupplementaryOrderId===id;
          if(orderKind(p)!=='supplementary'||r.status!=='confirmed'||r.payment?.status!=='paid'
            ||(!open&&r.lastClosedSupplementaryOrderId!==id)||r.openSupplementaryOrderId&&!open
            ||r.fiscalPendingOrderId||r.paidSupplementaryOrderIds?.includes(id)||!Number.isSafeInteger(r.addOnOrderCount)||r.addOnOrderCount<(open?1:0))fail('mbway-order-not-retryable',409);
          next={...r,addOnOrderCount:r.addOnOrderCount-(open?1:0),lastClosedSupplementaryOrderId:id,updatedAt};delete next.openSupplementaryOrderId;
        }
        await store.updatePendingProvider({orderId:id,payment:closed,paymentVersion:saved.version,registration:next,registrationVersion:registration.version});
        return reply({order:publicLiveOrder(id,closed,{canRetry:retryAllowed(closed,next)})});
      }
      if(recoveringPrimary||recoveringSupplement){
        const r=(await store.registration())?.data;
        if(!r)return reply({error:'not-found'},404);
        if(!realRegistration(r,claims.sub))return reply({error:'order-recovery-mismatch',failedChecks:['owner','real']},409);
        const savedId=recoveringSupplement?r.openSupplementaryOrderId||r.lastClosedSupplementaryOrderId:r.payment?.orderId;
        if(recoveringSupplement&&!savedId)return reply({error:'not-found'},404);
        if(savedId&&!LIVE_ORDER_UUID.test(savedId))return reply({error:'order-recovery-mismatch',failedChecks:['identifier']},409);
        const direct=savedId?await store.payment(savedId):null;
        const located=direct?.data?{id:savedId,...direct}:recoveringPrimary?await store.primaryPayment():null;
        if(!located?.data)return reply({error:'not-found'},404);
        if(historical(located.data))return reply({error:'not-found'},404);
        const p=located.data, kind=recoveringSupplement?'supplementary':'primary';
        const checks={identifier:LIVE_ORDER_UUID.test(located.id)&&p.id===located.id,owner:p.userId===claims.sub,registration:p.registrationId===store.registrationId,
          real:p.environment==='production',provider:p.provider===paymentProvider(p.method),event:p.eventId===EVENT,kind:orderKind(p)===kind,
          method:['multibanco','mbway','bank_transfer','stripe_card'].includes(p.method),currency:p.currency==='EUR',amount:Number.isSafeInteger(p.amountCents)&&p.amountCents>0};
        if(kind==='primary'){checks.method=checks.method&&p.method===r.payment?.method;checks.currency=checks.currency&&p.currency===r.payment?.currency;
          checks.amount=checks.amount&&p.amountCents===r.payment?.amountCents;checks.reference=(p.reference||'')===(r.payment?.reference||'');}
        const failed=Object.keys(checks).filter(k=>!checks[k]);
        return failed.length?reply({error:'order-recovery-mismatch',failedChecks:failed},409):reply({order:publicLiveOrder(located.id,p,{canRetry:retryAllowed(p,r)})});
      }
      if(readingOrder){
        const p=(await store.payment(orderMatch[1]))?.data;
        if(!p||(!isAdmin&&p.userId!==claims.sub)||p.environment!=='production')return reply({error:'not-found'},404);
        let eligibility={};
        if(isAdmin&&!historical(p)&&p.status==='paid'&&['pending','pending_authorization','review_required'].includes(p.fiscalStatus)){
          const j=(await store.document(orderMatch[1]))?.data;
          eligibility={canResumeFiscal:Boolean(canResumeLiveFiscalJob(p,j)&&j.userId===p.userId&&j.registrationId===p.registrationId&&j.environment==='production'),
            ...(isUnstartedStripeInstrumentJob(p,j)?{fiscalResumeReason:'stripe-instrument'}:{})};
        }
        let canRetry=false;
        if(!historical(p)&&isClosedUnpaidMbway(p)){
          const ownerStore=p.userId===claims.sub?store:storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:p.userId,token:storeToken});
          canRetry=retryAllowed(p,(await ownerStore.registration())?.data);
        }
        return reply({order:{...publicLiveOrder(orderMatch[1],p,{canRetry}),...eligibility}});
      }
      const kind=url.pathname.startsWith(`${PREFIX}/supplementary/`)?'supplementary':'primary';
      const quoting=request.method==='POST'&&url.pathname===`${PREFIX}${kind==='supplementary'?'/supplementary':''}/quote`;
      const creating=request.method==='POST'&&url.pathname===`${PREFIX}${kind==='supplementary'?'/supplementary':''}/orders`;
      if(!quoting&&!creating)return reply({error:'not-found'},404);
      const data=await body(request);
      exact(data,quoting?['selection','pilotAcknowledged']:['id','selection','stamp','method','phone','replacesOrderId','pilotAcknowledged','billingStamp','pilotConfirmation']);
      if((privatePilot||!openForPublic(now()))&&!(isAdmin&&data.pilotAcknowledged===true))fail('registration-not-open',403);
      const pilot=isAdmin&&data.pilotAcknowledged===true;
      if(creating&&(!LIVE_ORDER_UUID.test(data.id||'')||!['multibanco','mbway','bank_transfer','stripe_card'].includes(data.method)
        ||(data.method==='mbway'?(typeof data.phone!=='string'||!/^9\d{8}$/.test(data.phone)):data.phone!==undefined)
        ||(data.replacesOrderId!==undefined&&(!LIVE_ORDER_UUID.test(data.replacesOrderId)||data.replacesOrderId===data.id))))fail('invalid-request');
      if(pilot&&creating&&(!isLivePilotConfigured(env,Date.parse(now()))||data.pilotConfirmation!==PILOT_CONFIRMATION||!/^[a-f0-9]{64}$/.test(data.billingStamp||'')))fail('pilot-confirmation-required',400);
      exact(data.selection,kind==='supplementary'?['morningCourse','afternoonCourse','dinnerQuantity']:['profile','congressMode','morningCourse','afternoonCourse','dinnerQuantity']);
      if(creating){
        const previous=(await store.payment(data.id))?.data;
        if(previous){
          if(previous.environment==='production'&&previous.userId===claims.sub&&historical(previous))return reply({error:'historical-order',order:publicLiveOrder(data.id,previous)},409);
          if(previous.environment!=='production'||previous.userId!==claims.sub||previous.method!==data.method||orderKind(previous)!==kind||stamp(previous.quote)!==data.stamp||stamp(previous.billingSnapshot)!==data.billingStamp
            ||(previous.method==='mbway'&&previous.methodFingerprint!==stamp({method:data.method,phone:data.phone}))
            ||(previous.replacesOrderId||null)!==(data.replacesOrderId||null))fail('idempotency-conflict',409);
          return reply({order:publicLiveOrder(data.id,previous)});
        }
        if(!methods.includes(data.method))fail('payment-method-unavailable',409);
      }
      const existing=await store.registration(), r=existing.data;
      if(r?.capacityReviewOrderId)fail('capacity-review-required',409);
      let replacement=null;
      if(kind==='primary'&&r){
        const previous=LIVE_ORDER_UUID.test(r.payment?.orderId||'')?await store.payment(r.payment.orderId):null;
        if(!realRegistration(r,claims.sub)||!previous?.data||historical(previous.data)||!canReplaceUnpaidPrimary(r,previous.data))fail('registration-exists',409);
        if(creating&&data.replacesOrderId!==previous.data.id)fail('replacement-required',409);
        if((await store.document(previous.data.id))?.data)fail('mbway-order-not-retryable',409);
        replacement={orderId:previous.data.id,payment:previous.data,paymentVersion:previous.version,registrationVersion:existing.version};
      }else if(kind==='primary'&&data.replacesOrderId)fail('replacement-required',409);
      if(kind==='supplementary'){
        if(!realRegistration(r,claims.sub)||r.status!=='confirmed'||r.payment?.status!=='paid')fail('paid-registration-required',409);
        if(r.openSupplementaryOrderId){
          const p=LIVE_ORDER_UUID.test(r.openSupplementaryOrderId)?(await store.payment(r.openSupplementaryOrderId))?.data:null;
          if(p&&p.userId===claims.sub&&historical(p))return reply({error:'historical-order',order:publicLiveOrder(r.openSupplementaryOrderId,p)},409);
          return reply({error:'supplementary-order-exists',...(p&&p.userId===claims.sub&&p.environment==='production'?{order:publicLiveOrder(r.openSupplementaryOrderId,p)}:{})},409);
        }
        if(r.fiscalPendingOrderId)fail('fiscal-pending',409);
        const predecessor=r.lastClosedSupplementaryOrderId||data.replacesOrderId;
        if(predecessor){
          if(creating&&data.replacesOrderId!==predecessor)fail('replacement-required',409);
          const previous=await store.payment(predecessor);
          if(!previous?.data||historical(previous.data)||previous.data.userId!==claims.sub||previous.data.registrationId!==store.registrationId||orderKind(previous.data)!=='supplementary'
            ||!isClosedUnpaidMbway(previous.data)||(await store.document(predecessor))?.data)fail('replacement-required',409);
          replacement={orderId:predecessor,payment:previous.data,paymentVersion:previous.version};
        }
      }
      const selectedProfile=kind==='supplementary'?r.selection?.profile:data.selection.profile;
      const context=await store.context(selectedProfile);
      const quote=kind==='primary'?quotePrimary(data.selection,{...context,emailVerified:true},null,new Date(now())):quoteSupplementary(data.selection,{...context,emailVerified:true},{...r,id:store.registrationId},new Date(now()));
      if(privatePilot&&(kind!=='primary'||quote.selection.congressMode!=='onsite'||quote.selection.morningCourse||quote.selection.afternoonCourse||quote.selection.dinnerQuantity||quote.amountCents!==9500))fail('live-scope-not-enabled',409);
      const profile=await store.profile(), billing=billingCustomerFromProfile(profile.data);
      if(!billing.ok)fail('billing-customer-unconfirmed',409,{issues:billing.issues});
      context.guards.push(profile);
      const participantName=typeof profile.data?.name==='string'?profile.data.name.replace(/\s+/g,' ').trim():'';
      if(participantName.length<5||participantName.length>200)fail('profile-incomplete',409);
      buildLiveMultibancoFR({orderId:creating?data.id:'11111111-1111-4111-8111-111111111111',quote,billing,paymentDate:now().slice(0,10)});
      if(Object.values(selectionFootprint(quote.selection)).some(value=>value>0)){
        const available=await store.capacity(),decision=capacityDecision(available,{selection:quote.selection});
        if(!decision.allocated)fail('capacity-full',409,{unavailable:decision.unavailable});
      }
      if(quoting)return reply({quote,stamp:stamp(quote),billing:billing.customer,billingStamp:stamp(billing.customer)});
      if(data.stamp!==stamp(quote))fail('quote-changed',409);
      if(stamp(billing.customer)!==data.billingStamp)fail('billing-preview-changed',409);
      const createdAt=now();
      const registration=kind==='primary'?{...(replacement?r:{}),eventId:EVENT,userId:claims.sub,registrationKey:`${EVENT}:${claims.sub}`,primaryRegistration:true,
        participantName,participantEmail:claims.email||'',registrationType:typeLabel(quote.selection.congressMode),status:'submitted',isTest:false,testMode:false,
        selection:{...quote.selection,dinner:quote.selection.dinnerQuantity>0,ratePeriod:quote.ratePeriod},entitlements:{congressMode:'',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
        addOnOrderCount:0,documentCount:0,payment:{orderId:data.id,status:'pending',amountCents:quote.amountCents,currency:'EUR',method:data.method,reference:data.method==='bank_transfer'?data.id:''},createdAt:replacement?r.createdAt:createdAt,updatedAt:createdAt,
        ...(replacement?{paymentAttemptOrderIds:[...(r.paymentAttemptOrderIds||[replacement.orderId]),data.id]}:{})}
        :{...r,openSupplementaryOrderId:data.id,addOnOrderCount:Number(r.addOnOrderCount||0)+1,updatedAt:createdAt};
      if(kind==='supplementary'&&replacement)delete registration.lastClosedSupplementaryOrderId;
      const account=data.method==='bank_transfer'?liveBankTransferAccount(env):null;
      const payment={eventId:EVENT,id:data.id,kind,environment:'production',registrationId:store.registrationId,userId:claims.sub,status:account?'pending':'creating',amountCents:quote.amountCents,currency:'EUR',method:data.method,
        identifier:`circ_live_${data.id.replaceAll('-','')}`,reference:account?data.id:null,entity:null,transactionId:null,paidAt:null,provider:paymentProvider(data.method),quote,billingSnapshot:billing.customer,createdAt,updatedAt:createdAt,
        ...(data.method==='mbway'?{methodFingerprint:stamp({method:data.method,phone:data.phone}),expiresAt:new Date(Date.parse(createdAt)+MBWAY_APPROVAL_WINDOW_MS).toISOString()}:{}),
        ...(replacement?{replacesOrderId:replacement.orderId}:{}),
        ...(account?{bankTransfer:{status:'awaiting_transfer',revision:0,...account,paymentReference:data.id,reports:[],createdAt}}:{})};
      if(!creationEnabled())fail('live-checkout-not-configured',503);
      if(replacement){
        let hint;try{hint=await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).inspectReference(replacement.payment);}
        catch{return reply({error:'replacement-check-unavailable',order:publicLiveOrder(replacement.orderId,replacement.payment)},503);}
        if(!['expired','cancelled'].includes(hint.providerState)){
          const held=holdUnconfirmedMbwayClosure(replacement.payment,r,hint.providerState,now());
          await store.updatePendingProvider({orderId:replacement.orderId,payment:held.payment,paymentVersion:replacement.paymentVersion,registration:held.registration,registrationVersion:existing.version});
          return reply({error:'replacement-not-closed',order:publicLiveOrder(replacement.orderId,held.payment)},409);
        }
        replacement.payment={...replacement.payment,replacementCheck:{source:'eupago-reference-info',state:hint.providerState,checkedAt:now(),reference:replacement.payment.reference,identifier:replacement.payment.identifier}};
      }
      const reserved=kind==='primary'?await store.createPendingPrimary({orderId:data.id,registration,payment,guards:context.guards,replacement}):await store.createPendingSupplementary({orderId:data.id,registration,registrationVersion:existing.version,payment,guards:context.guards,replacement});
      if(account)return reply({order:publicLiveOrder(data.id,payment)},201);
      let created;
      try{created=data.method==='stripe_card'?await stripeFactory({apiKey:env.STRIPE_LIVE_SECRET_KEY}).createPayment(payment)
        :await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).createPayment({...payment,...(data.method==='mbway'?{phone:data.phone}:{})});}
      catch(error){const latest=await store.payment(data.id);
        // A signed callback can arrive while creation is waiting for its response.
        // Once it has durably captured the paid transaction, do not roll it back.
        if(latest.data?.userId===claims.sub&&latest.data.method===data.method&&latest.data.transactionId
          &&['paid','refunded','review_required'].includes(latest.data.status))return reply({order:publicLiveOrder(data.id,latest.data)});
        const uncertain=data.method==='stripe_card'?error?.definite!==true:Boolean(error?.uncertain);
        if(latest.data)await store.updatePayment(data.id,{...latest.data,status:uncertain?'creation_unknown':'creation_failed',updatedAt:now()},latest.version);
        return reply({error:uncertain?'creation-unknown':'provider-rejected',orderId:data.id},uncertain?502:422);}
      const p={...payment,status:'pending',reference:created.reference,entity:created.entity,...(created.stripe?{stripe:created.stripe}:{}),updatedAt:now()};
      const next=kind==='primary'?{...registration,payment:{...registration.payment,reference:created.reference},updatedAt:now()}:{...registration,updatedAt:now()};
      try{await store.updatePendingProvider({orderId:data.id,payment:p,paymentVersion:reserved.paymentVersion,registration:next,registrationVersion:reserved.registrationVersion});}
      catch(error){const latest=(await store.payment(data.id))?.data;
        if(latest?.userId===claims.sub&&latest.method===data.method&&latest.reference===created.reference
          &&(!created.entity||latest.entity===created.entity)&&['pending','paid','refunded','review_required'].includes(latest.status))return reply({order:publicLiveOrder(data.id,latest)});
        throw error;
      }
      return reply({order:publicLiveOrder(data.id,p)},201);
    }catch(error){const code=error.code||(typeof error.message==='string'?error.message.replace(/^checkout\//,''):'service-unavailable');
      const conflict=['registration-exists','paid-registration-required','invalid-addition','course-already-owned','quote-changed','billing-preview-changed','live-scope-not-enabled','billing-customer-unconfirmed','profile-incomplete','idempotency-conflict','fiscal-pending','capacity-full','capacity-review-required','conflict'].includes(code);
      return reply({error:code,...(error.details||{}),...(error.unavailable?{unavailable:error.unavailable}:{})},Number(error.status)||(conflict?409:['registration-not-open','uls-not-verified','student-not-approved','sign-in-required'].includes(code)?403:503));}
  };
}
