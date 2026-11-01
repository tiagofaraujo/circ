import { proposedBankAccount } from './bank-transfer-account.mjs';

// TOConline's documented codes are API-specific (TR, for example, differs
// from SAF-T TB). MB WAY has no confirmed mapping in the official TOConline
// sales API. Keep it closed rather than guessing MB or OU.
const TOCONLINE_PAYMENT_SOURCE = 'https://api-docs.toconline.pt/apis/vendas/recibos-de-venda';
export const LIVE_PAYMENT_MAPPING_REGISTRY = Object.freeze({
  version: 'circ2027-payment-mappings-20261101',
  mappings: Object.freeze({
    multibanco: Object.freeze({ status: 'confirmed', code: 'MB', source: TOCONLINE_PAYMENT_SOURCE }),
    bank_transfer: Object.freeze({ status: 'confirmed', code: 'TR', source: TOCONLINE_PAYMENT_SOURCE }),
    // A later reviewed registry version can confirm MB WAY with its official
    // code and source. An activation flag alone cannot supply fiscal evidence.
    mbway: Object.freeze({ status: 'unconfirmed', code: null, source: TOCONLINE_PAYMENT_SOURCE }),
  }),
});
export const LIVE_FISCAL_PAYMENT_MECHANISMS = Object.freeze(Object.fromEntries(
  Object.entries(LIVE_PAYMENT_MAPPING_REGISTRY.mappings).map(([method,record]) => [method,record.status === 'confirmed' ? record.code : null]),
));
export const LIVE_EUPAGO_METHODS = Object.freeze(['multibanco', 'mbway']);
export const MBWAY_APPROVAL_WINDOW_MS = 4 * 60 * 1000;

function validPortugueseIban(iban) {
  if (typeof iban !== 'string' || !/^PT50\d{21}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}2529${iban.slice(2,4)}`;
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

// Production instructions are a separate explicit activation. The sandbox
// configuration continues to hide the IBAN and remains disabled.
export function liveBankTransferAccount(env) {
  if (env.LIVE_BANK_TRANSFER_ENABLED !== 'true' || !validPortugueseIban(proposedBankAccount.iban)
    || typeof proposedBankAccount.beneficiary !== 'string' || !proposedBankAccount.beneficiary.trim()) return null;
  return { iban: proposedBankAccount.iban, payee: proposedBankAccount.beneficiary };
}

export function livePaymentMethods(env) {
  return ['multibanco',
    ...(env.LIVE_MBWAY_ENABLED === 'true' && LIVE_FISCAL_PAYMENT_MECHANISMS.mbway ? ['mbway'] : []),
    ...(liveBankTransferAccount(env) ? ['bank_transfer'] : []),
  ];
}
