import policy from '../data/circ2027FiscalPolicy.json';

// Read-only diagnostics; matching the catalogue never authorises real issuance.
export const CIRC27_SERIES = Object.freeze({ id: String(policy.series.id), prefix: policy.series.prefix });
export const CIRC27_SERVICES = Object.freeze(Object.fromEntries(Object.entries(policy.services).map(([code, rule]) => [code, String(rule.id)])));
export const CIRC27_FISCAL_POLICY_VERSION = policy.version;
const items = resource => resource?.ok && Array.isArray(resource.items) ? resource.items : [];

export function inspectCIRC27Rehearsal(rehearsal, resources) {
  if (!rehearsal?.salesDocument) return null;
  const { series, services, exemptions, taxes } = resources?.resources || {};
  const found = items(series).find(s => String(s.id) === CIRC27_SERIES.id
    && s.prefix === CIRC27_SERIES.prefix && s.documentType === 'FR' && s.active !== false);
  const exemptionFound = items(exemptions).some(e => String(e.id) === String(policy.exemption.id) && e.code === policy.exemption.code);
  const normalRateFound = items(taxes).some(t => t.code === 'NOR' && t.region === 'PT'
    && t.percentage !== null && t.percentage !== undefined && Number(t.percentage) === 23
    && (!t.expiresAt || String(t.expiresAt).slice(0, 10) >= rehearsal.date));
  const lines = Array.isArray(rehearsal.salesDocument.lines) ? rehearsal.salesDocument.lines : [];
  const hasExempt = lines.some(line => policy.services[line.item_code]?.taxCode === 'ISE');
  const exemptionHeaderMatches = hasExempt
    ? String(rehearsal.salesDocument.tax_exemption_reason_id) === String(policy.exemption.id)
    : rehearsal.salesDocument.tax_exemption_reason_id == null;
  const serviceChecks = lines.map(line => {
    const rule = policy.services[line.item_code];
    const actual = items(services).find(s => s.code === line.item_code);
    const issues = [];
    if (!rule) issues.push('unknown-service');
    else {
      if (!actual || String(actual.id) !== String(rule.id)) issues.push('service-not-found');
      else {
        if (actual.active !== true) issues.push('inactive-service');
        if (String(actual.unitOfMeasureId) !== '2') issues.push('unit-mismatch');
        if (rule.taxCode !== null && (actual.taxCode !== rule.taxCode || actual.appliedTaxCode !== rule.taxCode)) issues.push('catalogue-tax-mismatch');
        if (rule.taxCode === 'ISE' && String(actual.exemptionReasonId) !== String(rule.exemptionReasonId)) issues.push('exemption-mismatch');
        if (rule.taxCode === 'NOR' && actual.exemptionReasonId != null) issues.push('unexpected-exemption');
        if (rule.taxCode === 'NOR' && actual.priceIncludesVat !== true) issues.push('vat-inclusive-required');
      }
      if (rule.taxCode === null) issues.push('tax-treatment-pending');
      else {
        if (String(line.item_id) !== String(rule.id) || line.tax_code !== rule.taxCode
          || line.tax_percentage !== rule.percentage || line.tax_country_region !== 'PT') issues.push('payload-tax-mismatch');
        if (rule.taxCode === 'ISE' && (!exemptionFound || !exemptionHeaderMatches)) issues.push('m07-not-confirmed');
        if (rule.taxCode === 'NOR' && !normalRateFound) issues.push('normal-rate-not-confirmed');
      }
    }
    return { code: line.item_code, id: rule ? String(rule.id) : null, taxCode: rule?.taxCode || null,
      percentage: rule?.percentage ?? null, review: rule?.review || null, issues, ok: issues.length === 0 };
  });
  let validAmounts = lines.length > 0 && Number.isSafeInteger(rehearsal.amountCents) && rehearsal.amountCents > 0;
  const sumCents = lines.reduce((sum, line) => {
    const cents = Math.round(line.unit_price * 100);
    const lineCents = cents * line.quantity;
    if (typeof line.unit_price !== 'number' || !Number.isFinite(line.unit_price) || line.unit_price <= 0
      || Math.abs(line.unit_price * 100 - cents) > 0.000001
      || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(lineCents)) validAmounts = false;
    return sum + lineCents;
  }, 0);
  return {
    seriesFound: Boolean(found), seriesRead: Boolean(series?.ok),
    seriesInPayload: String(rehearsal.salesDocument.document_series_id) === CIRC27_SERIES.id,
    serviceChecks, servicesRead: Boolean(services?.ok), exemptionFound,
    exemptionHeaderMatches,
    policyCurrent: rehearsal.fiscalPolicyVersion === policy.version,
    exactTotal: validAmounts && Number.isSafeInteger(sumCents) && sumCents === rehearsal.amountCents,
    expectedCents: rehearsal.amountCents, calculatedCents: sumCents,
    fiscalReleaseAllowed: false,
  };
}
