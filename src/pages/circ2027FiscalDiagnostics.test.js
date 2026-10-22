import { inspectCIRC27Rehearsal, CIRC27_FISCAL_POLICY_VERSION } from './circ2027FiscalDiagnostics';
const service = (id, code, taxCode, exemptionReasonId = null) => ({ id, code, taxCode, appliedTaxCode: taxCode, exemptionReasonId, active: true, priceIncludesVat: true, unitOfMeasureId: '2' });
const resources = { resources: {
  series: { ok: true, items: [{ id: '244', prefix: 'CIRC2027', documentType: 'FR', active: null }] },
  services: { ok: true, items: [service('55', 'CIRC27-CONG-P', 'ISE', 9), service('56', 'CIRC27-CONG-O', 'ISE', 9), service('57', 'CIRC27-CURSO-M', 'NOR'), service('59', 'CIRC27-JANTAR', 'ISE', 9)] },
  exemptions: { ok: true, items: [{ id: '9', code: 'M07', description: null }] },
  taxes: { ok: true, items: [{ code: 'NOR', region: 'PT', percentage: 23, expiresAt: null }] },
} };
const r = { fiscalPolicyVersion: CIRC27_FISCAL_POLICY_VERSION, date: '2026-10-22', amountCents: 9500, salesDocument: {
  document_type: 'FR', document_series_id: 244, tax_exemption_reason_id: 9, vat_included_prices: true,
  lines: [{ item_id: 55, item_code: 'CIRC27-CONG-P', quantity: 1, unit_price: 95, tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT' }],
} };
const clone = value => JSON.parse(JSON.stringify(value));

test('confirms the exact M07 mapping and variable 95 EUR exempt price without enabling real issuance', () => {
  const check = inspectCIRC27Rehearsal(r, resources);
  expect(check.seriesFound).toBe(true);
  expect(check.seriesInPayload).toBe(true);
  expect(check.exemptionFound).toBe(true);
  expect(check.policyCurrent).toBe(true);
  expect(check.serviceChecks[0].ok).toBe(true);
  expect(check.exactTotal).toBe(true);
  expect(check.fiscalReleaseAllowed).toBe(false);
});
test('old NOR registrations, missing M07, wrong reason and inactive services fail closed', () => {
  for (const mutate of [
    c => { c.resources.services.items[0].taxCode = 'NOR'; },
    c => { c.resources.services.items[0].appliedTaxCode = 'NOR'; },
    c => { c.resources.services.items[0].exemptionReasonId = 18; },
    c => { c.resources.exemptions.items[0].code = 'M10'; },
    c => { c.resources.exemptions.ok = false; },
    c => { c.resources.services.items[0].active = false; },
  ]) {
    const c = clone(resources); mutate(c);
    expect(inspectCIRC27Rehearsal(r, c).serviceChecks[0].ok).toBe(false);
  }
});
test('does not infer a tax mismatch from the irrelevant VAT-inclusive flag on an exempt price', () => {
  const c = clone(resources); c.resources.services.items[0].priceIncludesVat = false;
  expect(inspectCIRC27Rehearsal(r, c).serviceChecks[0].ok).toBe(true);
});
test('checks taxable courses at 23% without the obsolete accounting-pending flag', () => {
  const mixed = clone(r); mixed.amountCents = 13000;
  mixed.salesDocument.lines.push({ item_id: 57, item_code: 'CIRC27-CURSO-M', quantity: 1, unit_price: 35, tax_code: 'NOR', tax_percentage: 23, tax_country_region: 'PT' });
  const check = inspectCIRC27Rehearsal(mixed, resources);
  expect(check.exactTotal).toBe(true);
  expect(check.serviceChecks.every(c => c.ok)).toBe(true);
  expect(check.serviceChecks[1].review).toBeNull();
  const c = clone(resources); c.resources.taxes.items[0].percentage = 22;
  expect(inspectCIRC27Rehearsal(mixed, c).serviceChecks[1].ok).toBe(false);
  c.resources.taxes.items[0].percentage = 23; c.resources.services.items[2].priceIncludesVat = false;
  expect(inspectCIRC27Rehearsal(mixed, c).serviceChecks[1].ok).toBe(false);
});
function dinnerRehearsal() {
  const dinner = clone(r); dinner.amountCents = 6000;
  dinner.salesDocument.lines = [{ item_id: 59, item_code: 'CIRC27-JANTAR', quantity: 2, unit_price: 30, tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT' }];
  return dinner;
}
test('standalone dinner uses the same verified M07 mapping without a registration bundle', () => {
  const check = inspectCIRC27Rehearsal(dinnerRehearsal(), resources);
  expect(check.exactTotal).toBe(true);
  expect(check.serviceChecks[0].ok).toBe(true);
  expect(check.serviceChecks[0].review).toBeNull();
  expect(check.fiscalReleaseAllowed).toBe(false);
});
test('old NOR dinner, missing reason, wrong ID and missing exemption header cannot pass', () => {
  for (const mutate of [
    c => { c.resources.services.items[3].taxCode = 'NOR'; },
    c => { c.resources.services.items[3].appliedTaxCode = 'NOR'; },
    c => { c.resources.services.items[3].exemptionReasonId = null; },
    c => { c.resources.services.items[3].id = '999'; },
    c => { c.resources.exemptions.items[0].code = 'M10'; },
  ]) {
    const c = clone(resources); mutate(c);
    expect(inspectCIRC27Rehearsal(dinnerRehearsal(), c).serviceChecks[0].ok).toBe(false);
  }
  const missing = dinnerRehearsal(); delete missing.salesDocument.tax_exemption_reason_id;
  expect(inspectCIRC27Rehearsal(missing, resources).serviceChecks[0].issues).toContain('m07-not-confirmed');
});
test('the previous M07 version is stale after dinner treatment changes', () => {
  expect(inspectCIRC27Rehearsal({ ...r, fiscalPolicyVersion: 'circ2027-m07-20261020' }, resources).policyCurrent).toBe(false);
});
test('rejects missing or inconsistent payloads and invalid totals without throwing', () => {
  expect(inspectCIRC27Rehearsal(null, null)).toBeNull();
  expect(inspectCIRC27Rehearsal(r, null).serviceChecks[0].ok).toBe(false);
  expect(inspectCIRC27Rehearsal({ ...r, fiscalPolicyVersion: undefined }, resources).policyCurrent).toBe(false);
  expect(inspectCIRC27Rehearsal({ ...r, amountCents: 9499 }, resources).exactTotal).toBe(false);
  for (const change of [
    d => { d.tax_exemption_reason_id = 18; },
    d => { d.lines[0].tax_code = 'NOR'; },
    d => { d.lines[0].item_id = 999; },
  ]) { const a = clone(r); change(a.salesDocument); expect(inspectCIRC27Rehearsal(a, resources).serviceChecks[0].ok).toBe(false); }
  const empty = clone(r); empty.salesDocument.lines = []; empty.amountCents = 0;
  expect(inspectCIRC27Rehearsal(empty, resources).exactTotal).toBe(false);
});
