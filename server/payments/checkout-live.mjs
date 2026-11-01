import { RESUMABLE_AUTH_ERRORS } from './live-fiscal-issue.mjs';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createEupagoLive } from './eupago-live.mjs';
import { billingCustomerFromProfile } from './toconline-billing-customer.mjs';
import { buildLiveMultibancoFR } from './toconline-live-payload.mjs';
import { quotePrimary, quoteSupplementary } from './quote.mjs';
import { REGISTRATION_OPEN_DATE } from '../../src/data/registration2027.js';
import { liveDataStamp as stamp, isLivePilotConfigured, isLiveCheckoutEnabled, isPrivatePilotWindow, livePilotDeadline, PILOT_CONFIRMATION } from './live-pilot-contract.mjs';

const PREFIX='/api/checkout/live', ADMIN='circ.chuc@gmail.com', EVENT='circ-2027';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))fail('invalid-request');};
async function body(request){if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('invalid-request');try{return await request.json();}catch{fail('invalid-request');}}
const openForPublic=now=>now.slice(0,10)>=REGISTRATION_OPEN_DATE;
const typeLabel=mode=>mode==='onsite'?'CIRC 2027 · Presencial':mode==='virtual'?'CIRC 2027 · Virtual':'Cursos Pré-Congresso';
const orderKind=p=>p.kind||p.quote?.kind||'primary';
export const publicLiveOrder=(id,p)=>({id,kind:orderKind(p),selection:p.quote?.selection||null,status:p.status,amountCents:p.amountCents,currency:p.currency,method:p.method,
  reference:p.reference||null,entity:p.entity||null,paidAt:p.paidAt||null,fiscalStatus:p.fiscalStatus||null,...(p.fiscalDocumentId?{fiscalDocumentId:p.fiscalDocumentId,fiscalDocumentNo:p.fiscalDocumentNo||null}:{})});
const realRegistration=(r,uid)=>r?.userId===uid&&r.eventId===EVENT&&r.primaryRegistration===true&&r.isTest===false&&r.testMode===false;

export function createCheckoutLiveApi({verify,tokenProvider=createPaymentsServiceTokenProvider(),storeFactory=createCheckoutLiveStore,providerFactory=createEupagoLive,now=()=>new Date().toISOString()}={}) {
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
      return reply({environment:'production',liveCheckoutEnabled:creationEnabled(),privatePilot,pilotUntil:livePilotDeadline(env),checks:Object.fromEntries(required.map(name=>[name,typeof env[name]==='string'&&env[name].trim().length>0])),channelMatchesExpected:env.EUPAGO_LIVE_CHANNEL==='CIRC 2027',externalValidationPerformed:false});
    }
    const configured=Boolean(isLivePilotConfigured(env,Date.parse(now()))&&(!privatePilot||isAdmin));
    if(url.pathname===`${PREFIX}/config`&&request.method==='GET')return reply({enabled:configured,environment:'production',publicOpen:!privatePilot&&openForPublic(now()),pilotAvailable:isAdmin&&configured,methods:configured?['multibanco']:[],registrationOpenDate:REGISTRATION_OPEN_DATE});
    const orderMatch=url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)$/);
    const readingOrder=request.method==='GET'&&orderMatch&&LIVE_ORDER_UUID.test(orderMatch[1]);
    const recoveringPrimary=request.method==='GET'&&url.pathname===`${PREFIX}/primary-order`;
    const recoveringSupplement=request.method==='GET'&&url.pathname===`${PREFIX}/supplementary-order`;
    if(!configured&&!readingOrder&&!recoveringPrimary&&!recoveringSupplement)return reply({error:'live-checkout-not-configured'},503);
    let storeToken;try{storeToken=(recoveringPrimary||recoveringSupplement)?token:await tokenProvider(env);}catch{return reply({error:'payments-service-unavailable'},503);}
    const store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:claims.sub,token:storeToken});
    try{
      if(recoveringPrimary||recoveringSupplement){
        const r=(await store.registration())?.data;
        if(!r)return reply({error:'not-found'},404);
        if(!realRegistration(r,claims.sub))return reply({error:'order-recovery-mismatch',failedChecks:['owner','real']},409);
        const savedId=recoveringSupplement?r.openSupplementaryOrderId:r.payment?.orderId;
        if(recoveringSupplement&&!savedId)return reply({error:'not-found'},404);
        if(savedId&&!LIVE_ORDER_UUID.test(savedId))return reply({error:'order-recovery-mismatch',failedChecks:['identifier']},409);
        const direct=savedId?await store.payment(savedId):null;
        const located=direct?.data?{id:savedId,...direct}:recoveringPrimary?await store.primaryPayment():null;
        if(!located?.data)return reply({error:'not-found'},404);
        const p=located.data, kind=recoveringSupplement?'supplementary':'primary';
        const checks={identifier:LIVE_ORDER_UUID.test(located.id)&&p.id===located.id,owner:p.userId===claims.sub,registration:p.registrationId===store.registrationId,
          real:p.environment==='production',provider:p.provider==='eupago',event:p.eventId===EVENT,kind:orderKind(p)===kind,
          method:p.method==='multibanco',currency:p.currency==='EUR',amount:Number.isSafeInteger(p.amountCents)&&p.amountCents>0};
        if(kind==='primary'){checks.method=checks.method&&p.method===r.payment?.method;checks.currency=checks.currency&&p.currency===r.payment?.currency;
          checks.amount=checks.amount&&p.amountCents===r.payment?.amountCents;checks.reference=(p.reference||'')===(r.payment?.reference||'');}
        const failed=Object.keys(checks).filter(k=>!checks[k]);
        return failed.length?reply({error:'order-recovery-mismatch',failedChecks:failed},409):reply({order:publicLiveOrder(located.id,p)});
      }
      if(readingOrder){
        const p=(await store.payment(orderMatch[1]))?.data;
        if(!p||(!isAdmin&&p.userId!==claims.sub)||p.environment!=='production')return reply({error:'not-found'},404);
        let eligibility={};
        if(isAdmin&&p.status==='paid'&&p.fiscalStatus==='pending_authorization'){
          const j=(await store.document(orderMatch[1]))?.data;
          eligibility={canResumeFiscal:Boolean(j?.status==='pending_authorization'&&RESUMABLE_AUTH_ERRORS.has(j.errorCode)&&j.userId===p.userId&&j.registrationId===p.registrationId&&j.environment==='production'&&!j.providerDocumentId&&!j.issuedAt)};
        }
        return reply({order:{...publicLiveOrder(orderMatch[1],p),...eligibility}});
      }
      const kind=url.pathname.startsWith(`${PREFIX}/supplementary/`)?'supplementary':'primary';
      const quoting=request.method==='POST'&&url.pathname===`${PREFIX}${kind==='supplementary'?'/supplementary':''}/quote`;
      const creating=request.method==='POST'&&url.pathname===`${PREFIX}${kind==='supplementary'?'/supplementary':''}/orders`;
      if(!quoting&&!creating)return reply({error:'not-found'},404);
      const data=await body(request);
      exact(data,quoting?['selection','pilotAcknowledged']:['id','selection','stamp','method','pilotAcknowledged','billingStamp','pilotConfirmation']);
      if((privatePilot||!openForPublic(now()))&&!(isAdmin&&data.pilotAcknowledged===true))fail('registration-not-open',403);
      const pilot=isAdmin&&data.pilotAcknowledged===true;
      if(creating&&(!LIVE_ORDER_UUID.test(data.id||'')||data.method!=='multibanco'))fail('invalid-request');
      if(pilot&&creating&&(!isLivePilotConfigured(env,Date.parse(now()))||data.pilotConfirmation!==PILOT_CONFIRMATION||!/^[a-f0-9]{64}$/.test(data.billingStamp||'')))fail('pilot-confirmation-required',400);
      exact(data.selection,kind==='supplementary'?['morningCourse','afternoonCourse','dinnerQuantity']:['profile','congressMode','morningCourse','afternoonCourse','dinnerQuantity']);
      if(creating){
        const previous=(await store.payment(data.id))?.data;
        if(previous){
          if(previous.environment!=='production'||previous.userId!==claims.sub||previous.method!==data.method||orderKind(previous)!==kind||stamp(previous.quote)!==data.stamp||stamp(previous.billingSnapshot)!==data.billingStamp)fail('idempotency-conflict',409);
          return reply({order:publicLiveOrder(data.id,previous)});
        }
      }
      const existing=await store.registration(), r=existing.data;
      if(kind==='primary'&&r)fail('registration-exists',409);
      if(kind==='supplementary'){
        if(!realRegistration(r,claims.sub)||r.status!=='confirmed'||r.payment?.status!=='paid')fail('paid-registration-required',409);
        if(r.openSupplementaryOrderId){
          const p=LIVE_ORDER_UUID.test(r.openSupplementaryOrderId)?(await store.payment(r.openSupplementaryOrderId))?.data:null;
          return reply({error:'supplementary-order-exists',...(p&&p.userId===claims.sub&&p.environment==='production'?{order:publicLiveOrder(r.openSupplementaryOrderId,p)}:{})},409);
        }
        if(r.fiscalPendingOrderId)fail('fiscal-pending',409);
      }
      const selectedProfile=kind==='supplementary'?r.selection?.profile:data.selection.profile;
      const context=await store.context(selectedProfile);
      const quote=kind==='primary'?quotePrimary(data.selection,{...context,emailVerified:true},null,new Date(now())):quoteSupplementary(data.selection,{...context,emailVerified:true},{...r,id:store.registrationId},new Date(now()));
      if(privatePilot&&(kind!=='primary'||quote.selection.congressMode!=='onsite'||quote.selection.morningCourse||quote.selection.afternoonCourse||quote.selection.dinnerQuantity||quote.amountCents!==9500))fail('live-scope-not-enabled',409);
      const profile=await store.profile(), billing=billingCustomerFromProfile(profile.data);
      if(!billing.ok)fail('billing-customer-unconfirmed',409);
      const participantName=typeof profile.data?.name==='string'?profile.data.name.replace(/\s+/g,' ').trim():'';
      if(participantName.length<5||participantName.length>200)fail('profile-incomplete',409);
      buildLiveMultibancoFR({orderId:creating?data.id:'11111111-1111-4111-8111-111111111111',quote,billing,paymentDate:now().slice(0,10)});
      if(quoting)return reply({quote,stamp:stamp(quote),billing:billing.customer,billingStamp:stamp(billing.customer)});
      if(data.stamp!==stamp(quote))fail('quote-changed',409);
      if(stamp(billing.customer)!==data.billingStamp)fail('billing-preview-changed',409);
      const createdAt=now();
      const registration=kind==='primary'?{eventId:EVENT,userId:claims.sub,registrationKey:`${EVENT}:${claims.sub}`,primaryRegistration:true,
        participantName,participantEmail:claims.email||'',registrationType:typeLabel(quote.selection.congressMode),status:'submitted',isTest:false,testMode:false,
        selection:{...quote.selection,dinner:quote.selection.dinnerQuantity>0,ratePeriod:quote.ratePeriod},entitlements:{congressMode:'',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
        addOnOrderCount:0,documentCount:0,payment:{orderId:data.id,status:'pending',amountCents:quote.amountCents,currency:'EUR',method:'multibanco',reference:''},createdAt,updatedAt:createdAt}
        :{...r,openSupplementaryOrderId:data.id,addOnOrderCount:Number(r.addOnOrderCount||0)+1,updatedAt:createdAt};
      const payment={eventId:EVENT,id:data.id,kind,environment:'production',registrationId:store.registrationId,userId:claims.sub,status:'creating',amountCents:quote.amountCents,currency:'EUR',method:'multibanco',
        identifier:`circ_live_${data.id.replaceAll('-','')}`,reference:null,entity:null,transactionId:null,paidAt:null,provider:'eupago',quote,billingSnapshot:billing.customer,createdAt,updatedAt:createdAt};
      if(!creationEnabled())fail('live-checkout-not-configured',503);
      const reserved=kind==='primary'?await store.createPendingPrimary({orderId:data.id,registration,payment,guards:context.guards}):await store.createPendingSupplementary({orderId:data.id,registration,registrationVersion:existing.version,payment,guards:context.guards});
      let created;
      try{created=await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).createPayment(payment);}
      catch(error){const latest=await store.payment(data.id);if(latest.data)await store.updatePayment(data.id,{...latest.data,status:error?.uncertain?'creation_unknown':'creation_failed',updatedAt:now()},latest.version);
        return reply({error:error?.uncertain?'creation-unknown':'provider-rejected',orderId:data.id},error?.uncertain?502:422);}
      const p={...payment,status:'pending',reference:created.reference,entity:created.entity,updatedAt:now()};
      const next=kind==='primary'?{...registration,payment:{...registration.payment,reference:created.reference},updatedAt:now()}:{...registration,updatedAt:now()};
      await store.updatePendingProvider({orderId:data.id,payment:p,paymentVersion:reserved.paymentVersion,registration:next,registrationVersion:reserved.registrationVersion});
      return reply({order:publicLiveOrder(data.id,p)},201);
    }catch(error){const code=error.code||(typeof error.message==='string'?error.message.replace(/^checkout\//,''):'service-unavailable');
      const conflict=['registration-exists','paid-registration-required','invalid-addition','course-already-owned','quote-changed','billing-preview-changed','live-scope-not-enabled','billing-customer-unconfirmed','profile-incomplete','idempotency-conflict','fiscal-pending','conflict'].includes(code);
      return reply({error:code},Number(error.status)||(conflict?409:['registration-not-open','uls-not-verified','student-not-approved','sign-in-required'].includes(code)?403:503));}
  };
}
