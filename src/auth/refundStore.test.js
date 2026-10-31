import { canRecordRegistrationRefund, recordRegistrationRefund } from './refundStore';
import { getFirebaseFirestore } from './firebaseClient';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn(), isAdminUser: user => user?.emailVerified && user?.email === 'circ.chuc@gmail.com' }));
const ID='af91d4b0-d844-4a37-a71e-05f939a04f83';
const user={uid:'admin',email:'circ.chuc@gmail.com',emailVerified:true};
const registration={id:'circ-2027-owner',eventId:'circ-2027',userId:'owner',primaryRegistration:true,isTest:false,testMode:false,
  status:'confirmed',addOnOrderCount:0,selection:{profile:'external'},entitlements:{congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
  payment:{status:'paid',amountCents:9500,currency:'EUR',method:'multibanco',reference:'123456789'}};
const payment={id:ID,eventId:'circ-2027',userId:'owner',registrationId:registration.id,environment:'production',provider:'eupago',method:'multibanco',
  identifier:'circ_live_'+ID.replaceAll('-',''),status:'paid',paidAt:'2026-10-30T12:00:00Z',transactionId:'777',fiscalStatus:'issued',
  amountCents:9500,currency:'EUR',reference:'123456789',entity:'12345'};
const input={completed:true,reason:'Desistência comunicada pelo participante',reference:'DEV-20261031-01',date:'2026-10-31'};
function setup() {
  const reg=JSON.parse(JSON.stringify(registration)), pay=JSON.parse(JSON.stringify(payment));
  const changes=[];
  const refs={registration:{path:'registrations/'+registration.id},payment:{path:'payments/'+ID},audit:{path:'auditLogs/a1'}};
  const query={where:jest.fn(()=>query),limit:jest.fn(()=>query),get:jest.fn(async()=>({docs:[{id:ID,ref:refs.payment}]}))};
  const transaction={get:jest.fn(async ref=>ref===refs.registration?{id:registration.id,exists:true,data:()=>reg}:{id:ID,exists:true,data:()=>pay}),
    update:jest.fn((ref,values)=>changes.push({ref,values})),set:jest.fn((ref,values)=>changes.push({ref,values}))};
  const db={collection:jest.fn(name=>name==='payments'?query:{doc:()=>name==='registrations'?refs.registration:refs.audit}),runTransaction:jest.fn(work=>work(transaction))};
  getFirebaseFirestore.mockReturnValue(db);
  return{reg,pay,refs,transaction,query,db,changes};
}
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date('2026-10-31T16:00:00Z'));window.firebase={firestore:{FieldValue:{serverTimestamp:()=> 'SERVER-TIME'}}};});
afterEach(()=>{jest.useRealTimers();jest.clearAllMocks();delete window.firebase;});
test('completed refund updates the original production payment, registration and audit in one transaction',async()=>{
  const f=setup();await recordRegistrationRefund(user,registration,input);
  expect(f.query.where.mock.calls).toEqual([['registrationId','==',registration.id],['environment','==','production']]);
  expect(f.db.runTransaction).toHaveBeenCalledTimes(1);expect(f.changes).toHaveLength(3);
  expect(f.changes[0]).toMatchObject({ref:f.refs.payment,values:{status:'refunded',refund:{completedExternally:true,amountCents:9500,fiscalReviewRequired:true,reference:input.reference,reason:input.reason}}});
  expect(f.changes[1]).toMatchObject({ref:f.refs.registration,values:{status:'cancelled','payment.status':'refunded',updatedBy:{uid:'admin'}}});
  expect(f.changes[2]).toMatchObject({ref:f.refs.audit,values:{action:'payment.refund.recorded',paymentId:ID,before:{payment:'paid'},after:{payment:'refunded'}}});
  expect(f.changes[0].values.fiscalStatus).toBeUndefined();expect(f.changes[1].values.selection).toBeUndefined();
  expect(f.db.collection).not.toHaveBeenCalledWith('documents');
});
test('pending, test, zero-value and supplementary registrations never offer a refund',()=>{
  expect(canRecordRegistrationRefund(registration)).toBe(true);
  for(const changes of [{status:'submitted'},{isTest:true},{addOnOrderCount:1},{payment:{...registration.payment,amountCents:0}},
    {payment:{...registration.payment,status:'pending'}},{entitlements:{morningCourse:true}}])expect(canRecordRegistrationRefund({...registration,...changes})).toBe(false);
});
test('confirmation, details and admin verification are required before reading the database',async()=>{
  const f=setup();
  await expect(recordRegistrationRefund({...user,email:'other@example.test'},registration,input)).rejects.toThrow('admin-required');
  for(const patch of [{completed:false},{reason:''},{reason:'Motivo\nprivado'},{reference:''},{date:'2026-11-01'},{date:'2026-02-30'}])await expect(recordRegistrationRefund(user,registration,{...input,...patch})).rejects.toThrow('details-required');
  expect(f.query.get).not.toHaveBeenCalled();expect(f.changes).toEqual([]);
});
test('source must be one production order and fresh reads must still agree before any write',async()=>{
  const f=setup();f.query.get.mockResolvedValueOnce({docs:[]});
  await expect(recordRegistrationRefund(user,registration,input)).rejects.toThrow('source-not-unique');
  for(const patch of [{status:'refunded'},{status:'pending'},{userId:'someone-else'},{amountCents:9600},{reference:'987654321'},
    {environment:'sandbox'},{fiscalStatus:'pending'}]){
    Object.assign(f.pay,payment,patch);await expect(recordRegistrationRefund(user,registration,input)).rejects.toThrow('state-changed');
  }
  Object.assign(f.pay,payment);f.reg.status='cancelled';
  await expect(recordRegistrationRefund(user,registration,input)).rejects.toThrow('state-changed');
  expect(f.changes).toEqual([]);
});
