// Read-only diagnostics for the internal fiscal rehearsal. Never authorizes real issuance.
export const CIRC27_SERIES = Object.freeze({ id: '244', prefix: 'CIRC2027' });
export const CIRC27_SERVICES = Object.freeze({
  'CIRC27-CONG-P': '55',
  'CIRC27-CONG-O': '56',
  'CIRC27-CURSO-M': '57',
  'CIRC27-CURSO-T': '58',
  'CIRC27-JANTAR': '59',
});
export function inspectCIRC27Rehearsal(rehearsal, resources) {
  if (!rehearsal?.salesDocument) return null;
  const series = resources?.resources?.series;
  const services = resources?.resources?.services;
  const found = series?.ok && series.items?.find(s =>
    String(s.id) === CIRC27_SERIES.id && s.prefix === CIRC27_SERIES.prefix && s.documentType === 'FR');
  const lines = rehearsal.salesDocument.lines || [];
  const serviceChecks = lines.map(line => {
    const wanted = CIRC27_SERVICES[line.item_code];
    const actual = services?.ok && services.items?.find(s => s.code === line.item_code);
    return { code: line.item_code, id: wanted || null, ok: Boolean(wanted && actual
      && String(actual.id) === wanted && actual.active === true
      && actual.priceIncludesVat === true && actual.taxCode === 'NOR') };
  });
  const sumCents = lines.reduce((sum, line) => sum + Math.round(Number(line.unit_price) * 100) * Number(line.quantity), 0);
  return {
    seriesFound: Boolean(found), seriesRead: Boolean(series?.ok),
    serviceChecks, servicesRead: Boolean(services?.ok),
    exactTotal: Number.isSafeInteger(sumCents) && sumCents === rehearsal.amountCents,
    expectedCents: rehearsal.amountCents, calculatedCents: sumCents,
    fiscalReleaseAllowed: false,
  };
}
