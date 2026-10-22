import policy from '../../src/data/circ2027FiscalPolicy.json' with { type: 'json' };

// Internal simulation only: no provider client, credentials or network access.
// Registrations and courses follow the accountant's instruction supplied by the organiser.
// Dinner exemption follows the organiser's subsequent explicit instruction, including guests.
// This domestic PT policy is not independent tax advice or approval for international sales.
export const FISCAL_POLICY_VERSION = policy.version;

export function prepareRehearsalTaxes(salesDocument, sourceLines) {
  if (salesDocument.lines.length !== sourceLines.length) throw new Error('fiscal/source-mismatch');
  const reviews = new Set();
  const breakdown = [];
  const lines = salesDocument.lines.map((line, index) => {
    const rule = policy.services[line.item_code];
    const grossCents = sourceLines[index].amountCents;
    if (!rule || !Number.isSafeInteger(grossCents) || grossCents <= 0) throw new Error('fiscal/source-mismatch');
    if (rule.review) reviews.add(rule.review);
    const pending = rule.taxCode === null;
    // Integer half-up rounding per line. TOConline acceptance/calculation remains untested.
    const denominator = pending ? null : BigInt(100 + rule.percentage);
    const netCents = pending ? null : Number((BigInt(grossCents) * 100n + denominator / 2n) / denominator);
    breakdown.push({
      itemCode: line.item_code,
      taxCode: rule.taxCode,
      percentage: rule.percentage,
      exemptionCode: rule.exemptionReasonId ? policy.exemption.code : null,
      grossCents,
      netCents,
      vatCents: pending ? null : grossCents - netCents,
      pending,
      review: rule.review,
    });
    return {
      ...line,
      item_id: rule.id,
      ...(!pending ? { tax_code: rule.taxCode, tax_percentage: rule.percentage, tax_country_region: 'PT' } : {}),
    };
  });
  const complete = breakdown.every(line => !line.pending);
  const hasExempt = breakdown.some(line => line.taxCode === 'ISE');
  const sum = (predicate, field) => complete
    ? breakdown.filter(predicate).reduce((total, line) => total + line[field], 0) : null;
  return {
    fiscalPolicyVersion: policy.version,
    salesDocument: {
      ...salesDocument,
      ...(salesDocument.document_type === 'FR' ? { document_series_id: policy.series.id } : {}),
      ...(hasExempt ? { tax_exemption_reason_id: policy.exemption.id } : {}),
      lines,
    },
    taxPreview: {
      calculation: 'local-per-line-half-up',
      providerValidated: false,
      complete,
      grossCents: breakdown.reduce((total, line) => total + line.grossCents, 0),
      netCents: sum(() => true, 'netCents'),
      vatCents: sum(() => true, 'vatCents'),
      exemptCents: sum(line => line.taxCode === 'ISE', 'netCents'),
      taxableNetCents: sum(line => line.taxCode !== 'ISE', 'netCents'),
      lines: breakdown,
    },
    reviews: [...reviews],
  };
}
