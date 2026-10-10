// Supplied by the organiser on 10/10/2026. Account ownership is NOT verified by
// a checksum. Do not publish payment instructions until the exact bank holder
// and a separate production rollout have been approved.
export const proposedBankAccount = Object.freeze({
  iban: 'PT50003300004567422451905',
  beneficiary: null,
  status: 'awaiting_holder',
  enabled: false,
});

// The rehearsal never returns a usable real destination, even after the holder
// is supplied. No browser/query parameter can change this environment boundary.
export function sandboxBankAccount() {
  return { environment: 'sandbox', enabled: false, iban: null, beneficiary: null,
    setupStatus: proposedBankAccount.status };
}
