import policy from '../../src/data/circ2027FiscalPolicy.json' with { type: 'json' };

const EVENT = 'circ-2027';
export function buildLiveOnsiteMultibancoFR({ orderId, quote, billing, paymentDate }) {
  if (typeof orderId !== 'string' || !/^[a-f0-9-]{36}$/i.test(orderId)
    || quote?.eventId !== EVENT || quote.kind !== 'primary' || quote.currency !== 'EUR'
    || quote.selection?.congressMode !== 'onsite'
    || quote.selection?.morningCourse || quote.selection?.afternoonCourse || quote.selection?.dinnerQuantity
    || quote.lines?.length !== 1 || quote.lines[0]?.code !== 'congress-onsite'
    || !Number.isSafeInteger(quote.amountCents) || quote.amountCents <= 0
    || !billing?.customer || !/^20\d{2}-\d{2}-\d{2}$/.test(paymentDate || '')) {
    throw new Error('live-fiscal/unsupported-order');
  }
  const rule = policy.services['CIRC27-CONG-P'];
  if (!rule || rule.taxCode !== 'ISE' || rule.exemptionReasonId !== policy.exemption.id) throw new Error('live-fiscal/policy-invalid');
  const unitPrice = quote.amountCents / 100;
  return {
    document_type: 'FR',
    document_series_id: policy.series.id,
    date: paymentDate,
    due_date: paymentDate,
    currency_iso_code: 'EUR',
    ...billing.customer,
    external_reference: `CIRC27-${orderId.toUpperCase()}`,
    notes: 'CIRC 2027 — inscrição presencial',
    vat_included_prices: true,
    payment_mechanism: 'MB',
    tax_exemption_reason_id: policy.exemption.id,
    lines: [{
      item_type: 'Service',
      item_id: rule.id,
      item_code: 'CIRC27-CONG-P',
      description: 'Inscrição CIRC 2027 — Congresso presencial',
      quantity: 1,
      unit_price: unitPrice,
      unit_of_measure: 'un',
      tax_code: rule.taxCode,
      tax_percentage: rule.percentage,
      tax_country_region: 'PT',
    }],
  };
}
