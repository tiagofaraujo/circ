// IBAN and exact holder supplied by the organiser on 10/10/2026. This records
// their instructions, not independent bank verification. Supplying the holder
// does not approve a production rollout or enable real payment instructions.
export const proposedBankAccount = Object.freeze({
  iban: 'PT50003300004567422451905',
  beneficiary: 'Associação Hemisfério Disciplinado',
  status: 'awaiting_activation',
  enabled: false,
});

// The rehearsal can identify the association, but never returns its real IBAN.
// No browser/query parameter can change this environment boundary.
export function sandboxBankAccount() {
  return { environment: 'sandbox', enabled: false, iban: null,
    beneficiary: proposedBankAccount.beneficiary, setupStatus: proposedBankAccount.status };
}
