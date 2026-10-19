import { inspectCIRC27Rehearsal } from './circ2027FiscalDiagnostics';
const services = Object.entries({ 'CIRC27-CONG-P': '55', 'CIRC27-CONG-O': '56', 'CIRC27-CURSO-M': '57', 'CIRC27-CURSO-T': '58', 'CIRC27-JANTAR': '59' }).map(([code,id]) => ({code,id,active:true,priceIncludesVat:true,taxCode:'NOR'}));
const resources = {resources:{series:{ok:true,items:[{id:'244',prefix:'CIRC2027',documentType:'FR'}]},services:{ok:true,items:services}}};
const rehearsal = {amountCents:22500,salesDocument:{lines:[{item_code:'CIRC27-CONG-P',quantity:1,unit_price:95},{item_code:'CIRC27-CURSO-M',quantity:1,unit_price:35},{item_code:'CIRC27-CURSO-T',quantity:1,unit_price:35},{item_code:'CIRC27-JANTAR',quantity:2,unit_price:30}]}};
test('validates the five configured services and 225 EUR exact total without enabling issuance',()=>{
  const result=inspectCIRC27Rehearsal(rehearsal,resources);
  expect(result.seriesFound).toBe(true);
  expect(result.serviceChecks.every(item=>item.ok)).toBe(true);
  expect(result.exactTotal).toBe(true);
  expect(result.fiscalReleaseAllowed).toBe(false);
});
test('detects missing VAT-inclusive flag, series mismatch and amount mismatch',()=>{
  const modified=JSON.parse(JSON.stringify(resources));
  modified.resources.services.items[3].priceIncludesVat=false;
  modified.resources.series.items[0].id='999';
  const result=inspectCIRC27Rehearsal({...rehearsal,amountCents:22499},modified);
  expect(result.seriesFound).toBe(false);
  expect(result.serviceChecks[2].ok).toBe(false);
  expect(result.exactTotal).toBe(false);
  expect(result.fiscalReleaseAllowed).toBe(false);
});
