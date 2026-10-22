import React from 'react';

// A separate live read: never rewrites a saved simulation or assigns its bank account.
export default function CircBillingBankAccountCheck({ resource, en = false }) {
  const t = (pt, english) => en ? english : pt;
  const knownSource = resource?.source === 'company_bank_accounts';
  const matched = knownSource && resource.ok === true && resource.status === 'matched'
    && typeof resource.account?.id === 'string' && /^[1-9]\d{0,15}$/.test(resource.account.id)
    && /^\d{4}$/.test(resource.account?.ibanLast4 || '');
  const reasons = {
    'not-found': t('A consulta não devolveu uma conta da empresa para o IBAN configurado.', 'The query returned no company account for the configured IBAN.'),
    ambiguous: t('A consulta devolveu mais de uma conta. Não foi escolhido um identificador.', 'The query returned multiple accounts. No identifier was selected.'),
    'iban-mismatch': t('O IBAN devolvido não corresponde integralmente ao configurado no CIRC.', 'The returned IBAN does not fully match the one configured for CIRC.'),
    inactive: t('A conta devolvida está assinalada como inativa.', 'The returned account is marked inactive.'),
    unavailable: t('Não foi possível consultar este recurso. Não é usada uma conta alternativa.', 'This resource could not be read. No alternative account is used.'),
    'invalid-response': t('A resposta não contém os dados necessários para uma confirmação segura.', 'The response lacks the data needed for safe confirmation.'),
    'invalid-configuration': t('O IBAN de referência do servidor necessita de revisão.', 'The server reference IBAN needs review.'),
  };
  return <section aria-label={t('Conta da empresa para faturação — leitura', 'Company billing account — read only')}>
    <h4>{t('Conta da empresa para faturação — leitura', 'Company billing account — read only')}</h4>
    <p>{t('Recurso consultado', 'Resource queried')}: <code>company_bank_accounts</code>. {t('Esta conferência é distinta da lista geral «Contas bancárias».', 'This check is separate from the general bank-account list.')}</p>
    {matched ? <>
      <p><strong>{t('Correspondência do IBAN completo confirmada nesta leitura.', 'Full IBAN match confirmed in this read.')}</strong></p>
      <p>{t('ID devolvido para futura associação à FR', 'ID returned for future FR association')}: <strong>{resource.account.id}</strong> · {t('IBAN terminado em', 'IBAN ending in')}: <strong>{resource.account.ibanLast4}</strong></p>
    </> : <p role={knownSource ? 'status' : undefined}><strong>{t('Conta para faturação por confirmar.', 'Billing account not yet confirmed.')}</strong>{' '}{knownSource
      ? reasons[resource.status] || t('Dados insuficientes para confirmar.', 'Insufficient data to confirm.')
      : t('Use «Atualizar dados de configuração» na ligação TOConline. Não é necessário repor o ensaio.', 'Use “Refresh configuration data” in the TOConline connection. There is no need to reset the rehearsal.')}
      {knownSource && Number.isInteger(resource.httpStatus) && <> · HTTP {resource.httpStatus}</>}
    </p>}
    <p>{t('Esta leitura não acrescenta a conta à FR, não altera os documentos simulados e não emite documentos reais. O ID 2 da lista geral não é assumido como identificador de faturação.', 'This read does not add the account to the FR, change simulated documents or issue real documents. ID 2 from the general list is not assumed to be the billing identifier.')}</p>
  </section>;
}
