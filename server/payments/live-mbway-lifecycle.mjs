export function isClosedUnpaidMbway(payment) {
  const closure=payment?.providerClosure;
  return payment?.environment==='production'&&payment.provider==='eupago'&&payment.method==='mbway'
    &&['expired','cancelled'].includes(payment.status)&&payment.retryAllowed===true&&!payment.replacementOrderId
    &&!payment.transactionId&&!payment.paidAt&&!payment.fiscalDocumentId
    &&closure?.source==='eupago-reference-info'&&closure.state===payment.status&&Boolean(closure.checkedAt)
    &&closure.reference===payment.reference&&closure.identifier===payment.identifier;
}

export function canReplaceUnpaidPrimary(registration,payment) {
  const ent=registration?.entitlements||{};
  return isClosedUnpaidMbway(payment)&&registration?.status==='submitted'&&registration.payment?.orderId===payment.id
    &&registration.payment.method==='mbway'&&registration.payment.status==='pending'&&registration.payment.closedUnpaidStatus===payment.status
    &&registration.payment.amountCents===payment.amountCents&&registration.payment.currency==='EUR'
    &&Number(registration.documentCount||0)===0&&Number(registration.addOnOrderCount||0)===0
    &&!registration.fiscalPendingOrderId&&!registration.openSupplementaryOrderId
    &&!ent.congressMode&&!ent.morningCourse&&!ent.afternoonCourse&&!Number(ent.dinnerQuantity||0)
    &&(!registration.paidSupplementaryOrderIds||registration.paidSupplementaryOrderIds.length===0);
}

export function holdUnconfirmedMbwayClosure(payment,registration,providerState,updatedAt){
  const next={...registration,updatedAt};
  if((payment.kind||payment.quote?.kind)==='supplementary'&&!next.openSupplementaryOrderId){
    next.openSupplementaryOrderId=payment.id;next.addOnOrderCount=Number(next.addOnOrderCount||0)+1;
  }
  return {payment:{...payment,status:'review_required',retryAllowed:false,providerState,reviewReason:'mbway-closure-no-longer-terminal',updatedAt},registration:next};
}
