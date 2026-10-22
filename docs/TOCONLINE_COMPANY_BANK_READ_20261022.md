# Company billing account: read-only discovery

This is a separate read-only verification step, not the previously attempted invoice-account assignment. It adds no bank_account_id to any document, changes no saved rehearsal and issues no real invoice.

The organiser supplied a generic bank_accounts record with ID 2. The sales-document documentation instead identifies the company account through GET company_bank_accounts filtered by the IBAN. These namespaces must not be equated without a live read.

Implementation:
- Existing verified-admin OAuth resource reading adds one fixed company_bank_accounts GET, using the already configured server-side association IBAN. It does not accept an IBAN, ID or resource URL from a request.
- The full IBAN is compared after normalising spaces/case. Only one well-formed returned account can be reported as matched. Empty, multiple, mismatched, inactive or inaccessible responses remain unconfirmed; no fallback to generic bank_accounts.
- Only the returned ID and IBAN suffix are added to the new diagnostic, not the full IBAN or arbitrary account data. Open Banking connectivity is not a matching condition.
- The current diagnostic shows this read separately from historical simulated documents. Refreshing the configuration is sufficient; do not reset FR TESTE/A261038C3B or repeat the test payment for this discovery step.
- FR payload association, other payment methods and real issuance remain out of scope. Nothing is automatically activated by a successful match.

Validation: isolated resolver tests cover differing IDs, complete-IBAN matching, ambiguity, unavailable resources, missing configuration and no error-detail leakage. Existing OAuth/resource tests continue to require GET-only commercial traffic. React tests cover PT/EN, no false confirmation from generic accounts and preservation of the existing rehearsal.

Official reference: https://api-docs.toconline.pt/apis/vendas/documentos-de-venda (Note 4 and bank_account_id field), checked 22 October 2026.
