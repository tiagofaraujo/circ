# CIRC2027 — separate dinner exemption and public price wording

## Authority and scope

The organiser explicitly instructed that the dinner is also VAT exempt, including participant and accompanying-guest tickets, and that no separate “registration including dinner” product is wanted. This is an implementation of that instruction, not independent confirmation of statutory eligibility. The earlier accountant email remains the basis for FR at receipt, the single CIRC2027 series, congress exemption and courses at 23%.

Domestic working matrix:
- Service 55 CIRC27-CONG-P: ISE / M07 / reason ID 9.
- Service 56 CIRC27-CONG-O: ISE / M07 / reason ID 9. Foreign-customer virtual sales still require separate validation before any real issuance.
- Services 57 and 58: NOR / 23%, included in the final price; no exemption reason.
- Service 59 CIRC27-JANTAR: ISE / M07 / reason ID 9; 30 EUR per person; a separate line with variable quantity, including a supplementary order. No bundle, new service ID or altered admission entitlement.

## Changes

Policy version circ2027-m07-dinner-20261022 invalidates older prepared simulations. Existing simulated documents are not silently rewritten. Resetting a rehearsal does not change the saved payment.
The current course and dinner pending-review flags are removed; uncertainty about real provider acceptance, series/ATCUD, real billing data, receipt-method mapping and foreign customers is not removed.
Local calculations now separate exempt value and taxable base, rather than calling their sum a taxable base. Prices and phase boundaries remain untouched.
A bilingual public prices note explains the matrix and the international virtual-attendance limitation. No claim of real issuance readiness is made.

## Expected local calculations

95 EUR congress + 35 EUR morning course + 35 EUR afternoon course + two 30 EUR dinners:
- Exempt: 155.00 EUR.
- Taxable base: 56.92 EUR.
- VAT: 13.08 EUR.
- Total excluding VAT including exempt value: 211.92 EUR.
- Total paid: 225.00 EUR.

Dinner-only 60 EUR: exempt 60 EUR, VAT 0 EUR. Courses-only 70 EUR: net 56.92 EUR, VAT 13.08 EUR, no exemption header. Calculations use half-up per line and remain unvalidated by TOConline.

## TOConline follow-up — not performed by this code

Confirm/edit the existing service records 55, 56 and 59 as ISE with exemption reason 9/M07, preserving their prices and identifiers. Confirm 57/58 as NOR 23% with VAT-inclusive prices. Refresh the read-only catalogue; an old NOR dinner must fail diagnostics, not be accepted as correct. The website update does not edit the TOConline catalogue.

OAuth remains read-only. No commercial provider POST/PATCH/DELETE, fiscal document, email, real payment, permission change or historic-document edit is introduced. A successful internal test is not a test of the real issuance endpoint.

References checked: https://api-docs.toconline.pt/apis/vendas/documentos-de-venda and https://manual.toconline.pt/support/solutions/articles/3000110904-criac%C3%A3o-de-fichas-de-servicos .
