import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createEupagoLive } from './eupago-live.mjs';
import { billingCustomerFromProfile } from './toconline-billing-customer.mjs';
import { quotePrimary } from './quote.mjs';
import { REGISTRATION_OPEN_DATE } from '../../src/data/registration2027.js';
import { liveDataStamp as stamp, isLivePilotConfigured, isLiveCheckoutEnabled, isPrivatePilotWindow, livePilotDeadline, PILOT_CONFIRMATION } from './live-pilot-contract.mjs';

const PREFIX = '/api/checkout/live';
const ADMIN = 'circ.chuc@gmail.com';
const EVENT = 'circ-2027';
const reply = (body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
const fail=(code,status=400)=>{const e=new Error(code);e.code=code;e.status=status;throw e;};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))fail('invalid-request');};
async function body(request){if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('invalid-request');let x;try{x=await request.json();}catch{fail('invalid-request');}return x;}
const openForPublic=now=>now.slice(0,10)>=REGISTRATION_OPEN_DATE;
const typeLabel=mode=>mode==='onsite'?'CIRC 2027 · Presencial':mode==='virtual'?'CIRC 2027 · Virtual':'Cursos Pré-Congresso';
const publicOrder=(id,p)=>({id,status:p.status,amountCents:p.amountCents,currency:p.currency,method:p.method,
  reference:p.reference||null,entity:p.entity||null,paidAt:p.paidAt||null,fiscalStatus:p.fiscalStatus||null});

export function createCheckoutLiveApi({
  verify,
  tokenProvider=createPaymentsServiceTokenProvider(),
  storeFactory=createCheckoutLiveStore,
  providerFactory=createEupagoLive,
  now=()=>new Date().toISOString(),
}={}) {
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
    const isAdmin=String(claims.email||'').toLowerCase()===ADMIN;
    const privatePilot=isPrivatePilotWindow(env);
    const creationEnabled=()=>isLiveCheckoutEnabled(env,Date.parse(now()));
    if(url.pathname===`${PREFIX}/diagnostics`&&request.method==='GET'){
      if(!isAdmin)return reply({error:'admin-required'},403);
      const required=['FIREBASE_PROJECT_ID','FIREBASE_PAYMENTS_SERVICE_ACCOUNT','EUPAGO_LIVE_API_KEY',
        'EUPAGO_LIVE_WEBHOOK_KEY','EUPAGO_LIVE_CHANNEL','TOCONLINE_OAUTH_CLIENT_ID',
        'TOCONLINE_OAUTH_CLIENT_SECRET','TOCONLINE_OAUTH_URL','TOCONLINE_API_URL','TOCONLINE_SESSION_KEY'];
      return reply({environment:'production',liveCheckoutEnabled:creationEnabled(),
        privatePilot,pilotUntil:livePilotDeadline(env),
        checks:Object.fromEntries(required.map(name=>[name,typeof env[name]==='string'&&env[name].trim().length>0])),
        channelMatchesExpected:env.EUPAGO_LIVE_CHANNEL==='CIRC 2027',externalValidationPerformed:false});
    }
    const configured=Boolean(creationEnabled()&&(!privatePilot||isAdmin)&&env.EUPAGO_LIVE_API_KEY?.trim()&&env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT);
    if(url.pathname===`${PREFIX}/config`&&request.method==='GET')return reply({
      enabled:configured,environment:'production',publicOpen:!privatePilot&&openForPublic(now()),pilotAvailable:isAdmin&&configured,
      methods:configured?['multibanco']:[],registrationOpenDate:REGISTRATION_OPEN_DATE,
    });
    const orderMatch=url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)$/);
    const readingOrder=request.method==='GET'&&orderMatch&&LIVE_ORDER_UUID.test(orderMatch[1]);
    const recoveringOrder=request.method==='GET'&&url.pathname===`${PREFIX}/primary-order`;
    if(recoveringOrder&&!isAdmin)return reply({error:'admin-required'},403);
    if(!configured&&!readingOrder&&!recoveringOrder)return reply({error:'live-checkout-not-configured'},503);
    // Recovery is an interactive admin read: use the already verified Firebase
    // session and existing Firestore rules, without expanding service-account IAM.
    let storeToken;try{storeToken=recoveringOrder?token:await tokenProvider(env);}catch{return reply({error:'payments-service-unavailable'},503);}
    const store=storeFactory({projectId:env.FIREBASE_PROJECT_ID,uid:claims.sub,token:storeToken});
    try{
      if(recoveringOrder){
        const registration=(await store.registration())?.data;
        if(!registration)return reply({error:'not-found'},404);
        const registrationChecks={owner:registration.userId===claims.sub,event:registration.eventId===EVENT,
          primary:registration.primaryRegistration===true,real:registration.isTest===false&&registration.testMode===false};
        const registrationFailures=Object.keys(registrationChecks).filter(key=>!registrationChecks[key]);
        if(registrationFailures.length)return reply({error:'order-recovery-mismatch',failedChecks:registrationFailures},409);
        const located=await store.primaryPayment();
        if(!located?.data)return reply({error:'not-found'},404);
        const payment=located.data;
        const paymentChecks={identifier:LIVE_ORDER_UUID.test(located.id)&&payment.id===located.id,
          owner:payment.userId===claims.sub,registration:payment.registrationId===store.registrationId,
          real:payment.environment==='production',provider:payment.provider==='eupago',event:payment.eventId===EVENT,
          method:payment.method==='multibanco'&&payment.method===registration.payment?.method,
          currency:payment.currency==='EUR'&&payment.currency===registration.payment?.currency,
          amount:Number.isSafeInteger(payment.amountCents)&&payment.amountCents>0&&payment.amountCents===registration.payment?.amountCents,
          reference:(payment.reference||'')===(registration.payment?.reference||'')};
        const paymentFailures=Object.keys(paymentChecks).filter(key=>!paymentChecks[key]);
        if(paymentFailures.length)return reply({error:'order-recovery-mismatch',failedChecks:paymentFailures},409);
        return reply({order:publicOrder(located.id,payment)});
      }
      if(readingOrder){
        const payment=await store.payment(orderMatch[1]);
        if(!payment.data||payment.data.userId!==claims.sub||payment.data.environment!=='production')return reply({error:'not-found'},404);
        return reply({order:publicOrder(orderMatch[1],payment.data)});
      }
      if(url.pathname===`${PREFIX}/quote`&&request.method==='POST'){
        const data=await body(request);exact(data,['selection','pilotAcknowledged']);
        if((privatePilot||!openForPublic(now()))&&!(isAdmin&&data.pilotAcknowledged===true))fail('registration-not-open',403);
        const selection=data.selection;exact(selection,['profile','congressMode','morningCourse','afternoonCourse','dinnerQuantity']);
        // First live cut: the exact fiscal scenario already accepted by TOConline.
        if(selection.congressMode!=='onsite'||selection.morningCourse!==false||selection.afternoonCourse!==false||selection.dinnerQuantity!==0)fail('live-scope-not-enabled',409);
        const existing=await store.registration();
        if(existing.data)fail('registration-exists',409);
        const ctx=await store.context(selection.profile);
        const quote=quotePrimary(selection,{...ctx,emailVerified:true},null,new Date(now()));
        if(privatePilot&&quote.amountCents!==9500)fail('live-scope-not-enabled',409);
        return reply({quote,stamp:stamp(quote)});
      }
      if(url.pathname===`${PREFIX}/orders`&&request.method==='POST'){
        const data=await body(request);exact(data,['id','selection','stamp','method','pilotAcknowledged','billingStamp','pilotConfirmation']);
        if(!LIVE_ORDER_UUID.test(data.id||'')||data.method!=='multibanco')fail('invalid-request');
        if((privatePilot||!openForPublic(now()))&&!(isAdmin&&data.pilotAcknowledged===true))fail('registration-not-open',403);
        const pilot=isAdmin&&data.pilotAcknowledged===true;
        if(pilot&&!isLivePilotConfigured(env,Date.parse(now())))fail('pilot-not-configured',503);
        if(pilot&&(data.pilotConfirmation!==PILOT_CONFIRMATION||!/^[a-f0-9]{64}$/.test(data.billingStamp||'')))fail('pilot-confirmation-required',400);
        const selection=data.selection;exact(selection,['profile','congressMode','morningCourse','afternoonCourse','dinnerQuantity']);
        const previousPayment=await store.payment(data.id);
        if(previousPayment.data){
          const previous=previousPayment.data;
          if(previous.environment!=='production'||previous.userId!==claims.sub||previous.method!==data.method
            ||stamp(previous.quote)!==data.stamp||(pilot&&stamp(previous.billingSnapshot)!==data.billingStamp))fail('idempotency-conflict',409);
          return reply({order:publicOrder(data.id,previous)},200);
        }
        if(selection.congressMode!=='onsite'||selection.morningCourse!==false||selection.afternoonCourse!==false||selection.dinnerQuantity!==0)fail('live-scope-not-enabled',409);
        const existing=await store.registration();if(existing.data)fail('registration-exists',409);
        const ctx=await store.context(selection.profile);
        const quote=quotePrimary(selection,{...ctx,emailVerified:true},null,new Date(now()));
        if(privatePilot&&quote.amountCents!==9500)fail('live-scope-not-enabled',409);
        if(data.stamp!==stamp(quote))fail('quote-changed',409);
        const profile=await store.profile();
        const billing=billingCustomerFromProfile(profile.data);
        if(!billing.ok)fail('billing-customer-unconfirmed',409);
        if(pilot&&stamp(billing.customer)!==data.billingStamp)fail('billing-preview-changed',409);
        const participantName=typeof profile.data?.name==='string'?profile.data.name.replace(/\s+/g,' ').trim():'';
        if(participantName.length<5||participantName.length>200)fail('profile-incomplete',409);
        const createdAt=now();
        const registration={
          eventId:EVENT,userId:claims.sub,registrationKey:`${EVENT}:${claims.sub}`,primaryRegistration:true,
          participantName,participantEmail:claims.email||'',registrationType:typeLabel(selection.congressMode),
          status:'submitted',isTest:false,testMode:false,
          selection:{...quote.selection,dinner:false,dinnerQuantity:0,ratePeriod:quote.ratePeriod},
          entitlements:{congressMode:'',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
          addOnOrderCount:0,documentCount:0,
          payment:{status:'pending',amountCents:quote.amountCents,currency:'EUR',method:'multibanco',reference:''},
          createdAt,updatedAt:createdAt,
        };
        const identifier=`circ_live_${data.id.replaceAll('-','')}`;
        const payment={
          eventId:EVENT,id:data.id,environment:'production',registrationId:store.registrationId,userId:claims.sub,
          status:'creating',amountCents:quote.amountCents,currency:'EUR',method:'multibanco',identifier,
          reference:null,entity:null,transactionId:null,paidAt:null,provider:'eupago',
          quote,billingSnapshot:billing.customer,createdAt,updatedAt:createdAt,
        };
        // Recheck after the profile/context reads, before the first durable write.
        if(!creationEnabled())fail('live-checkout-not-configured',503);
        const reserved=await store.createPendingPrimary({orderId:data.id,registration,payment,guards:ctx.guards});
        let created;
        try{created=await providerFactory({apiKey:env.EUPAGO_LIVE_API_KEY}).createPayment(payment);}
        catch(error){
          const latest=await store.payment(data.id);
          if(latest.data){
            await store.updatePayment(data.id,{...latest.data,status:error?.uncertain?'creation_unknown':'creation_failed',updatedAt:now()},latest.version);
          }
          return reply({error:error?.uncertain?'creation-unknown':'provider-rejected',orderId:data.id},error?.uncertain?502:422);
        }
        const paymentNext={...payment,status:'pending',reference:created.reference,entity:created.entity,updatedAt:now()};
        const registrationNext={...registration,payment:{...registration.payment,reference:created.reference},updatedAt:now()};
        await store.updatePendingProvider({orderId:data.id,payment:paymentNext,paymentVersion:reserved.paymentVersion,
          registration:registrationNext,registrationVersion:reserved.registrationVersion});
        return reply({order:{id:data.id,status:'pending',amountCents:quote.amountCents,currency:'EUR',method:'multibanco',
          reference:created.reference,entity:created.entity}},201);
      }
      return reply({error:'not-found'},404);
    }catch(error){
      const code=error.code||error.message||'service-unavailable';
      const status=Number(error.status)||(['registration-exists','quote-changed','billing-preview-changed','live-scope-not-enabled','billing-customer-unconfirmed','profile-incomplete','idempotency-conflict'].includes(code)?409:code==='registration-not-open'?403:503);
      return reply({error:code},status);
    }
  };
}
