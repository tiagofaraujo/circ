import React from 'react';

// This is evidence from the protected server rehearsal, never a browser price calculator.
export default function CircRehearsalPaymentCheck({ check, en = false }) {
  const t = (pt, english) => en ? english : pt;
  const money = cents => Number.isSafeInteger(cents)
    ? new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100) : '—';
  const profileLabels = { uls: 'ULS Coimbra', external: t('Congressista externo', 'External delegate'), student: t('Estudante de IMR', 'Medical imaging student') };
  const reasonLabels = {
    'saved-profile-unavailable': t('O pedido antigo não contém o perfil tarifário necessário para esta verificação.', 'This legacy order does not contain the tariff profile needed for this check.'),
    'provider-payment-date-not-mapped': t('A data efetiva do pagamento deste meio ainda não está mapeada. A data da notificação não será usada como substituto.', 'The effective payment date for this method is not yet mapped. Notification arrival time will not be used as a substitute.'),
    'bank-credit-date-unavailable': t('Falta a data do crédito bancário no pagamento de teste guardado.', 'The saved test payment has no bank-credit date.'),
    'invalid-bank-credit-evidence': t('Os dados do crédito bancário não são consistentes com este pagamento de teste.', 'Bank-credit evidence is inconsistent with this test payment.'),
  };
  return <section aria-label={t('Conferência da tarifa pela data do pagamento', 'Payment-date tariff check')}>
    <h4>{t('Tarifa pela data do pagamento', 'Tariff by payment date')}</h4>
    <p>{t('A criação do pedido não reserva a tarifa. O pagamento até 31/01/2027 beneficia da primeira fase; a partir de 01/02/2027 aplica-se a segunda fase, hora de Portugal continental.', 'Creating an order does not reserve a tariff. Payments through 31 January 2027 use the early phase; from 1 February 2027 the regular phase applies, mainland Portugal time.')}</p>
    {!check ? <p><strong>{t('Verificação ainda não disponível neste ensaio.', 'This rehearsal does not yet include this check.')}</strong> {t('Atualize a pré-visualização. Se já foi simulada, reponha apenas o ensaio, sem repetir o pagamento.', 'Refresh the preview. If already simulated, reset only the rehearsal, without repeating payment.')}</p> : <>
      <p>{t('Perfil guardado no pedido', 'Profile saved with the order')}: <strong>{profileLabels[check.profile] || '—'}</strong></p>
      {check.paymentDate && <p>{t('Data do crédito bancário de teste', 'Test bank-credit date')}: <strong>{check.paymentDate}</strong> · {check.paymentPeriod === 'early' ? t('Primeira fase', 'Early phase') : t('Segunda fase', 'Regular phase')}</p>}
      {check.expectedCents !== null && check.expectedCents !== undefined && <p>{t('Valor recebido', 'Amount received')}: <strong>{money(check.paidCents)}</strong> · {t('Tarifa aplicável ao pedido', 'Applicable order tariff')}: <strong>{money(check.expectedCents)}</strong> · {t('Diferença', 'Difference')}: <strong>{money(check.differenceCents)}</strong></p>}
      {check.status === 'matches' && <p><strong>{t('Tarifa confere com a data do crédito de teste.', 'Tariff matches the test credit date.')}</strong></p>}
      {check.simulationBlocked && <p role="alert"><strong>{t('Emissão simulada bloqueada: pagamento a rever.', 'Simulated issue blocked: payment requires review.')}</strong> {check.status === 'mismatch'
        ? t('Não será emitido um documento por um valor não recebido nem mantida automaticamente a tarifa anterior. Resolva a divergência no circuito de pagamento.', 'No document will be issued for money not received, and the previous tariff is not automatically retained. Resolve the discrepancy in the payment workflow.')
        : reasonLabels[check.reason] || t('Dados do pedido ou do pagamento inconsistentes.', 'Inconsistent order or payment data.')}</p>}
      {check.status === 'unverified' && <p><strong>{t('Tarifa por verificar.', 'Tariff not verified.')}</strong> {reasonLabels[check.reason] || t('Falta evidência suficiente.', 'There is insufficient evidence.')} {t('É possível ensaiar o cálculo fiscal, mas isso não valida a tarifa nem autoriza emissão real.', 'Tax calculation may still be rehearsed; that does not validate the tariff or authorize real issuance.')}</p>}
    </>}
    <p>{t('Esta conferência não altera a inscrição, o pagamento nem o valor das linhas. A data editável do documento não determina a tarifa. A expiração de referências e a validação de datas nos outros meios de pagamento continuam a exigir implementação própria.', 'This check does not change registration, payment or line amounts. The editable document date does not determine the tariff. Reference expiry and date validation for other payment methods still require their own implementation.')}</p>
  </section>;
}
