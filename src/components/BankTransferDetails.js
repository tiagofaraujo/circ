import React, { useEffect, useRef, useState } from 'react';

export function normalizePortugueseIban(value) {
  if (typeof value !== 'string') return null;
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^PT50\d{21}$/.test(iban)) return null;
  // PT -> 25 29. This validates structure/checksum, never ownership.
  const rearranged = `${iban.slice(4)}2529${iban.slice(2, 4)}`;
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1 ? iban : null;
}

export function CopyTransferField({ label, value, copyValue = value, disabled = false, en = false }) {
  const input = useRef(null);
  const alive = useRef(true);
  const currentValue = useRef(copyValue); currentValue.current = copyValue;
  const [state, setState] = useState('idle');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setState('idle'); }, [copyValue]);
  const buttonLabel = en ? `Copy ${label}` : `Copiar ${label}`;
  async function copy() {
    if (disabled || typeof copyValue !== 'string' || !copyValue || state === 'copying') return;
    setState('copying');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(copyValue);
      if (alive.current && currentValue.current === copyValue) setState('copied');
    } catch {
      if (!alive.current || currentValue.current !== copyValue) return;
      // Do not claim success on permission denial. Offer selectable exact text,
      // including an IBAN without grouping spaces, rather than deprecated APIs.
      setState('manual');
    }
  }
  useEffect(() => { if (state === 'manual') { input.current?.focus(); input.current?.select(); } }, [state]);
  return <div className="transfer-copy-field">
    <label><span>{label}</span><input ref={input} readOnly value={state === 'manual' ? copyValue : value}
      aria-label={label} spellCheck="false" autoComplete="off" /></label>
    <button type="button" className="secondary" onClick={copy} disabled={disabled || state === 'copying'} aria-label={buttonLabel}>
      {state === 'copied' ? (en ? 'Copied ✓' : 'Copiado ✓') : (en ? 'Copy' : 'Copiar')}
    </button>
    <span className="transfer-copy-field__feedback" role="status">
      {state === 'copied' ? (en ? `${label} copied.` : `${label} copiado.`) : state === 'manual'
        ? (en ? 'Automatic copying is unavailable. Copy the selected text, or press and hold it on your phone.' : 'Cópia automática indisponível. Copie o texto selecionado ou mantenha-o premido no telemóvel.') : ''}
    </span>
  </div>;
}

export default function BankTransferDetails({ amountCents, memo, account, environment = 'sandbox', en = false }) {
  const t = (pt, english) => en ? english : pt;
  const sandbox = environment !== 'production';
  const iban = normalizePortugueseIban(account?.iban);
  const actionable = !sandbox && account?.environment === 'production' && account.enabled === true
    && account.status === 'approved' && iban && typeof account.beneficiary === 'string' && account.beneficiary.trim();
  // Showing the organiser-supplied name is independent of enabling a bank
  // destination. The sandbox API supplies the name, but never a real IBAN.
  const holderVisible = Boolean(actionable || (sandbox && account?.environment === 'sandbox'
    && account.setupStatus === 'awaiting_activation' && typeof account.beneficiary === 'string' && account.beneficiary.trim()));
  const amount = (amountCents / 100).toFixed(2).replace('.', en ? '.' : ',');
  return <section className="transfer-details" aria-label={t('Dados da transferência', 'Transfer details')}>
    <h4>{t('Dados para a transferência', 'Bank transfer details')}</h4>
    <CopyTransferField label={t('Beneficiário', 'Beneficiary')} value={holderVisible ? account.beneficiary : t('Nome do titular por confirmar', 'Account holder not yet confirmed')} disabled={!holderVisible} en={en} />
    <CopyTransferField label="IBAN" value={actionable ? iban.match(/.{1,4}/g).join(' ') : t('Oculto no ambiente de teste', 'Hidden in the test environment')}
      copyValue={actionable ? iban : ''} disabled={!actionable} en={en} />
    <CopyTransferField label={t('Valor (EUR)', 'Amount (EUR)')} value={amount} en={en} />
    <CopyTransferField label={t('Descrição para o beneficiário', 'Description for the beneficiary')} value={memo} en={en} />
    <p>{t('Inclua esta descrição para identificarmos o pedido. Não use apenas o nome ou o valor.', 'Include this description to identify the request. Do not rely on the name or amount alone.')}</p>
    {sandbox && <p className="transfer-details__warning"><strong>{t('Simulação: não transfira dinheiro.', 'Simulation: do not transfer money.')}</strong> {t('Pode testar a cópia do beneficiário, do valor e da descrição. O IBAN real não está disponível neste ensaio.', 'You can test copying the beneficiary, amount and description. The real IBAN is unavailable in this rehearsal.')}</p>}
    {!sandbox && !actionable && <p role="alert">{t('Dados bancários ainda não aprovados. Não efetue a transferência.', 'Bank details are not approved. Do not make a transfer.')}</p>}
  </section>;
}
