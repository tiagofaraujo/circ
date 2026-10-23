import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

// Does not replace/reset the existing simulation. Only displays a server-generated proposal.
function BankPreviewRequest({ rehearsal, en }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const active = useRef(true);
  const controller = useRef(null);
  const t = (pt, english) => en ? english : pt;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); };
  }, []);
  async function load() {
    if (busy || !user) return;
    setBusy(true); setPreview(null); setError('');
    controller.current = new AbortController();
    try {
      const token = await user.getIdToken();
      if (!active.current) return;
      const response = await fetch(`/api/fiscal/sandbox/bank-preview/sessions/${encodeURIComponent(rehearsal.sessionId)}/orders/${encodeURIComponent(rehearsal.orderId)}`, {
        method: 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: { Authorization: `Bearer ${token}` }, signal: controller.current.signal,
      });
      const data = await response.json();
      if (!active.current) return;
      if (!response.ok) {
        const messages = {
          'toconline-not-connected': t('Autorize novamente a ligação TOConline acima e repita esta consulta.', 'Reauthorize the TOConline connection above and repeat this read.'),
          'toconline-reauthorize-required': t('A sessão TOConline expirou. Volte a autorizar a ligação acima.', 'The TOConline session expired. Reauthorize the connection above.'),
          'billing-bank-unconfirmed': t('A conta da empresa não ficou confirmada. Não foi acrescentado nenhum identificador à proposta.', 'The company account was not confirmed. No account identifier was added to the proposal.'),
          'billing-customer-unconfirmed': t('Os dados de faturação do perfil estão incompletos ou inválidos. Corrija o Perfil em My CIRC antes de preparar a FR.', 'The profile billing details are incomplete or invalid. Correct the My CIRC Profile before preparing the FR.'),
          'payment-tariff-review-required': t('A tarifa e a data efetiva do pagamento precisam de estar confirmadas antes desta pré-visualização.', 'The tariff and effective payment date must be confirmed before this preview.'),
          'stale-source': t('O registo mudou durante a consulta. Atualize a página antes de repetir.', 'The record changed during the read. Refresh the page before retrying.'),
          'stale-tax-policy': t('Este ensaio usa uma configuração anterior. Não foi alterado nem substituído.', 'This rehearsal uses an older configuration. It was not changed or replaced.'),
        };
        const suffix = Number.isInteger(data.httpStatus) ? ` (HTTP ${data.httpStatus})` : '';
        const issueLabels = {
          'billing-name-required': t('nome/entidade de faturação', 'billing name/entity'),
          'billing-country-unmapped': t('país de faturação', 'billing country'),
          'billing-tax-number-invalid': t('NIF', 'tax number'),
          'billing-tax-number-is-seller': t('NIF do adquirente igual ao NIF da AHD', 'buyer tax number matches the AHD seller tax number'),
          'billing-address-required': t('morada', 'address'),
          'billing-postcode-invalid': t('código postal', 'postal code'),
          'billing-city-required': t('localidade', 'city'),
        };
        const details = Array.isArray(data.issues) && data.issues.length
          ? ` — ${data.issues.map(item => issueLabels[item] || item).join(', ')}` : '';
        setError((messages[data.error] || t('Não foi possível preparar a proposta bancária. Nenhum documento foi emitido ou alterado.', 'The bank-associated proposal could not be prepared. No document was issued or changed.')) + details + suffix);
        return;
      }
      const result = data.preview;
      if (result?.kind !== 'toconline-bank-associated-preview' || result.persisted !== false
        || result.liveWritesEnabled !== false || result.fiscalEffect !== false || result.providerWriteMade !== false
        || result.sessionId !== rehearsal.sessionId || result.orderId !== rehearsal.orderId
        || result.account?.source !== 'company_bank_accounts'
        || !Number.isSafeInteger(result.salesDocument?.bank_account_id)
        || result.salesDocument.bank_account_id <= 0) throw new Error('invalid-response');
      setPreview(result);
    } catch (issue) {
      if (active.current && issue.name !== 'AbortError') setError(t('A consulta não foi concluída. A simulação guardada e o pagamento mantêm-se intactos.', 'The read did not complete. The saved simulation and payment remain unchanged.'));
    } finally { if (active.current) setBusy(false); }
  }
  return <section aria-label={t('Pré-visualização da FR com conta confirmada', 'FR preview with a verified account')}>
    <h4>{t('Associar a conta à pré-visualização — sem emitir', 'Associate account with the preview — no issuance')}</h4>
    <p>{t('O servidor consulta o TOConline, confirma a conta pelo IBAN e prepara uma cópia da FR com o identificador devolvido. A simulação guardada não é modificada.', 'The server reads TOConline, verifies the account by IBAN and prepares a copy of the FR with the returned identifier. The saved simulation is not modified.')}</p>
    <div className="sandbox-checkout__actions"><button type="button" disabled={busy || !user} onClick={load}>
      {busy ? t('A consultar a conta…', 'Reading account…') : t('Pré-visualizar FR com conta validada', 'Preview FR with verified account')}
    </button></div>
    {error && <p role="alert">{error}</p>}
    {preview && <div role="status">
      <p><strong>{t('Conta associada apenas a esta pré-visualização.', 'Account associated with this preview only.')}</strong></p>
      <p>{t('ID da conta', 'Account ID')}: <strong>{preview.account.id}</strong> · {t('IBAN terminado em', 'IBAN ending in')}: <strong>{preview.account.ibanLast4}</strong></p>
      <p>{t('Total preservado', 'Total preserved')}: <strong>{new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(preview.amountCents / 100)}</strong></p>
      {preview.basedOnSimulatedDocument && <p>{t('Simulação original preservada', 'Original simulation preserved')}: <strong>{preview.basedOnSimulatedDocument}</strong></p>}
      <p>{t('Os dados do adquirente desta proposta são lidos do Perfil My CIRC no momento da consulta e não são guardados nesta simulação.', 'Buyer details in this proposal are read from the My CIRC Profile at query time and are not saved into this simulation.')}</p>
      <p>{t('Não guardada. Nenhuma emissão, movimento bancário ou chamada de escrita ao TOConline. A aceitação do documento pela API de emissão continua por testar.', 'Not saved. No issuance, bank movement or TOConline write call. Document acceptance by the issuance API remains untested.')}</p>
      <details open><summary>{t('Dados da FR com conta — apenas pré-visualização', 'FR data with account — preview only')}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(preview.salesDocument, null, 2)}</pre>
      </details>
    </div>}
  </section>;
}

export default function CircBankAssociatedPreview({ rehearsal, en = false }) {
  if (rehearsal?.source?.method !== 'bank_transfer' || rehearsal.mode !== 'invoice_receipt'
    || !rehearsal.sessionId || !rehearsal.orderId) return null;
  return <BankPreviewRequest key={`${rehearsal.sessionId}:${rehearsal.orderId}:${rehearsal.preparedAt || ''}:${rehearsal.issuedAt || ''}`} rehearsal={rehearsal} en={en} />;
}
