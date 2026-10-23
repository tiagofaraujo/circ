# FR bank-associated preview (not saved and no fiscal issuance)

The organiser requested continuation after company-bank-account read-only discovery. This step generates a server-side FR proposal with the account identifier returned by that discovery; it does not assume generic bank_accounts ID 2.

## Scope
- New verified-administrator-only GET /api/fiscal/sandbox/bank-preview/sessions/:sessionId/orders/:orderId.
- Requires a confirmed sandbox bank-transfer order, an existing FR rehearsal, matching source/policy versions and positively verified payment-date pricing.
- Rebuilds the proposal from the saved paid order, not from browser prices, tax data or bank identifiers.
- Reuses the existing authenticated OAuth read-only resource handler. Only a unique complete-IBAN company_bank_accounts match can populate bank_account_id. Missing, ambiguous or failed reads stop without a fallback account.
- Rechecks the saved version after the provider read. All responses are private/no-store. Refreshed encrypted HttpOnly session cookies are propagated; access tokens and the complete IBAN are not returned in this proposal.
- Adds bank_account_id to a transient copy only. FR TESTE/A261038C3B, historical simulated identifiers, orders, payments, fiscal numbering and TOConline records remain unchanged.
- No sales/receipt API POST, bank movement, email, AT communication or enablement of real issuance. OAuth token exchanges remain part of the existing authentication process, not commercial writes.

## UI
The diagnostic has “Pré-visualizar FR com conta validada”. It performs the fresh read and displays the returned ID, masked suffix, preserved amount and candidate JSON. A successful preview does not validate TOConline issuance or save a bank association into the original simulation. There is no need to reset the rehearsal or repeat payment.

## Validation
Backend tests cover a returned ID other than 2, original-record preservation, tax totals for 225 EUR, permissions, invalid/multiple/unavailable accounts, late tariffs, concurrent changes, OAuth expiry and no browser overrides. Frontend tests cover explicit-click GET only, errors, PT/EN and no reset/write operation.

The organiser's live browser must still complete the authenticated read; development tests use synthetic data. A release or passing test is not confirmation of the real account ID or the acceptance of a real fiscal document.

Official payload contract: https://api-docs.toconline.pt/apis/vendas/documentos-de-venda — bank_account_id and Note 4. Checked 23 October 2026.
