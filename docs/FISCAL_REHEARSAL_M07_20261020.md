# CIRC 2027: M07 internal invoice-receipt rehearsal

Scope: only the existing administrator-only internal rehearsal and read-only diagnostic. No TOConline commercial POST/PATCH/DELETE, real fiscal document, payment, email or public price change.

The organiser supplied the accountant's instruction: FR upon receipt, dedicated CIRC2027 series, registration exemption under article 9, courses at 23%. The organiser also supplied API mapping M07 = exemption reason ID 9. These are configuration inputs, not independent certification of eligibility.

- FR preview uses document_series_id 244. Services retain IDs 55–59 and the exact gross price/quantity from the saved paid sandbox order.
- Onsite/virtual lines use ISE, 0%, region PT. Documents containing these lines set tax_exemption_reason_id 9 in the HEADER, as documented by TOConline, not as an invented per-line field.
- Courses retain the 23% reference from the received instruction and a pending clarification warning. They do not become exempt because an exempt registration appears in the same document.
- Separate dinner/accompanying guests remain unresolved. Dinner lines receive no assumed tax code; their tax calculation and the complete document VAT total remain unavailable. The preview is incomplete and must never be sent to a provider.
- The local per-line half-up estimate is not TOConline fiscal calculation validation.
- Catalogue checks distinguish ISE/M07 from NOR, check exact service IDs, applied tax codes, activity, unit, reason ID/code and the normal PT rate when used. The reference catalogue price is not substituted for the paid amount.
- Tax-policy versioning blocks simulation of stale prepared drafts. Previously simulated-issued records remain historical and idempotent; they are not automatically rewritten or reset. The administrator can explicitly reset a test rehearsal without changing its paid order.
- Real writes remain hard-disabled independently of catalogue matches or accountant validation.

Next manual verification: refresh TOConline resources, confirm services 55 and 56 actually return ISE/M07, then reset/refresh a 95 EUR registration-only rehearsal. Expected local breakdown: base 95 EUR, VAT 0 EUR, total 95 EUR. OAuth stays read-only.

Official payload reference checked: https://api-docs.toconline.pt/apis/vendas/documentos-de-venda (2026-10-20). The current v1 sales POST finalises the document; do not use it as a harmless validation or sandbox endpoint.
