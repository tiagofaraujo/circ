# FR rehearsal: tariff determined by effective payment date

Organiser decision: an external delegate who creates a 95 EUR order in January but pays on 2 February 2027 owes 150 EUR. There is no 48-hour early-price reservation. This change is limited to internal fiscal rehearsals; it is NOT the complete checkout deadline implementation.

## Implemented boundary
- Read the saved sandbox order profile and lines, never client-supplied prices or the editable document date.
- For an already-confirmed sandbox bank transfer, use the existing `bankTransfer.confirmation.bookingDate`, amount and currency. This is the recorded test credit date, not independent access to bank records.
- Compare each purchased line against the central existing tariff catalogue for that date. 31 January belongs to early phase in Europe/Lisbon; 1 February onwards to regular phase. No tolerance period.
- Show paid amount, expected amount and difference. Block simulated issue for a demonstrated mismatch or invalid evidence. Do not reprice the fiscal payload, charge a difference, edit a saved order or revoke a registration.
- Bind bank-credit evidence to the prepared-source fingerprint; rechecking on issue catches evidence changed after preview. Older prepared drafts must be refreshed. Previously simulated documents remain historical; duplicate retry does not issue again.
- If a legacy order lacks its saved profile/date, or if provider settlement-date mapping is unavailable, show UNVERIFIED. A purely local fiscal simulation remains possible in this case but explicitly does not validate the tariff. Real fiscal writes remain hard-disabled in all cases.
- Stripe/Eupago notification arrival timestamps and order creation timestamps are deliberately NOT treated as proof of effective payment date.

## Important remaining work
- Expire/reconcile pending payment references and hosted sessions at the phase boundary.
- Map trustworthy effective payment timestamps for Stripe/Eupago and distinguish delayed delivery from late payment.
- Define and implement production credit-date validation and treatment of short/late transfers. This patch does not change the existing bank transfer approval workflow.
- Confirm live TOConline service records (55/56/59 ISE M07/9, 57/58 NOR 23%), series AT code, actual billing data, receipt methods and real issuance in an appropriate environment.

## Acceptance scenarios
- External 95 EUR, bank credit 31 January, reviewed on 2 February: matches 95 EUR.
- External 95 EUR, credit 2 February: expected 150 EUR, difference 55 EUR, simulation blocked.
- External 150 EUR paid in February: matches.
- ULS and student thresholds retain 55→90 and 60→95 EUR.
- Original paid January registration is not repriced when a supplementary February course/dinner order is checked.
- Mixed 225 EUR January order remains 225 EUR, with unchanged tax calculation; the same old lines paid in February require 280 EUR.
- The invoice date cannot override the credit date. Late notification/confirmation does not move a recorded January bank credit into February.

No TOConline commercial API calls, catalogue modifications, AT communication, emails or production payment writes are introduced.
