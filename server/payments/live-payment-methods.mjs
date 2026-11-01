import { proposedBankAccount } from './bank-transfer-account.mjs';
import { stripeLiveConfiguration } from './stripe-live.mjs';

// TOConline's documented codes are API-specific (TR, for example, differs
// from SAF-T TB). MB WAY has no confirmed mapping in the official TOConline
// sales API. OU below is a documented generic category, not a dedicated MB WAY
// code or a claim that the sales API has accepted this integration's payload.
const TOCONLINE_PAYMENT_SOURCE = 'https://api-docs.toconline.pt/apis/vendas/recibos-de-venda';
export const LIVE_PAYMENT_MAPPING_REGISTRY = Object.freeze({
  version: 'circ2027-payment-mappings-20261101-stripe-card',
  mappings: Object.freeze({
    multibanco: Object.freeze({ status: 'confirmed', code: 'MB', source: TOCONLINE_PAYMENT_SOURCE }),
    bank_transfer: Object.freeze({ status: 'confirmed', code: 'TR', source: TOCONLINE_PAYMENT_SOURCE }),
    stripe_card:Object.freeze({status:'by-instrument',codes:Object.freeze({credit:'CC',debit:'DC'}),source:TOCONLINE_PAYMENT_SOURCE}),
    // A later reviewed registry version can confirm MB WAY with its official
    // code and source. An activation flag alone cannot supply fiscal evidence.
    mbway: Object.freeze({ status: 'documented-generic', code: 'OU', salesApiValidated:false,
      sources:Object.freeze(['https://api-docs.toconline.pt/apis/versoes-anteriores/compras/pagamentos',
        'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/legislacao/diplomas_legislativos/Documents/Portaria_302_2016.pdf']) }),
  }),
});
export const LIVE_FISCAL_PAYMENT_MECHANISMS = Object.freeze(Object.fromEntries(
  Object.entries(LIVE_PAYMENT_MAPPING_REGISTRY.mappings).map(([method,record]) => [method,record.status === 'confirmed'
    || method==='mbway'&&record.status==='documented-generic'&&record.code==='OU' ? record.code : null]),
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

export function livePaymentMethods(env,{isAdmin=false,emailVerified=false,email=''}={}) {
  const normalizedEmail=typeof email==='string'?email.trim().toLowerCase():'';
  const validationEmails=typeof env.LIVE_MBWAY_VALIDATION_EMAILS==='string'
    ?env.LIVE_MBWAY_VALIDATION_EMAILS.split(',').map(value=>value.trim().toLowerCase()).filter(value=>/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value)):[];
  const validationParticipant=emailVerified===true&&normalizedEmail.length>0&&validationEmails.includes(normalizedEmail);
  const stripeEmails=typeof env.LIVE_STRIPE_VALIDATION_EMAILS==='string'?env.LIVE_STRIPE_VALIDATION_EMAILS.split(',').map(value=>value.trim().toLowerCase()):[];
  const stripeParticipant=emailVerified===true&&normalizedEmail.length>0&&stripeEmails.includes(normalizedEmail);
  return ['multibanco',
    ...(env.LIVE_MBWAY_ENABLED === 'true' && LIVE_FISCAL_PAYMENT_MECHANISMS.mbway
      &&(env.LIVE_MBWAY_VALIDATION_ONLY==='false'||isAdmin||validationParticipant) ? ['mbway'] : []),
    ...(liveBankTransferAccount(env) ? ['bank_transfer'] : []),
    ...(env.LIVE_STRIPE_ENABLED==='true'&&stripeLiveConfiguration(env).ready
      &&(env.LIVE_STRIPE_VALIDATION_ONLY==='false'||isAdmin||stripeParticipant)?['stripe_card']:[]),
  ];
}
