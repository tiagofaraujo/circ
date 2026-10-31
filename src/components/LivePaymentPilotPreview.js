import React, { useEffect, useRef, useState } from 'react';
import LivePaymentPilotOrder from './LivePaymentPilotOrder';

const errors = {
  'registration-exists-or-unchecked': ['Esta conta já tem uma inscrição, ou não foi possível confirmar a sua ausência. Não foi preparado outro pedido.', 'This account already has a registration, or its absence could not be confirmed. No additional order was prepared.'],
  'billing-customer-unconfirmed': ['Complete os dados de faturação no Perfil My CIRC antes de preparar o ensaio.', 'Complete billing details in your My CIRC profile before preparing the pilot.'],
  'profile-incomplete': ['Complete o nome do participante no Perfil My CIRC.', 'Complete the participant name in your My CIRC profile.'],
  'checkout/uls-not-verified': ['O perfil ULS Coimbra ainda não está validado para esta conta.', 'ULS Coimbra eligibility is not verified for this account.'],
  'checkout/student-not-approved': ['O perfil de estudante ainda não está aprovado para esta conta.', 'Student eligibility is not approved for this account.'],
  'payments-service-unavailable': ['Não foi possível autenticar a identidade de pagamentos no servidor.', 'The server payments identity could not be authenticated.'],
};

export default function LivePaymentPilotPreview({ user, en = false }) {
  const [profile, setProfile] = useState('external');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  const t = (pt, english) => en ? english : pt;
  useEffect(() => {
    setPreview(null); setError(''); setBusy(false);
    return () => controller.current?.abort();
  }, [user.uid]);

  function changeProfile(value) {
    controller.current?.abort();
    setProfile(value); setPreview(null); setError(''); setBusy(false);
  }
  async function prepare() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setPreview(null); setError('');
    try {
      const token = await user.getIdToken();
      if (current.signal.aborted) return;
      const response = await fetch('/api/checkout/live/pilot-preview', {
        method: 'POST', cache: 'no-store', signal: current.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'preview-unavailable');
      if (data.previewOnly !== true || data.paymentCreated !== false || data.fiscalDocumentIssued !== false
        || !Number.isSafeInteger(data.quote?.amountCents) || data.quote.amountCents <= 0
        || data.quote.currency !== 'EUR' || !data.billing) throw new Error('preview-unavailable');
      if (!current.signal.aborted) setPreview(data);
    } catch (issue) {
      if (!current.signal.aborted) setError(Object.prototype.hasOwnProperty.call(errors, issue.message)
        ? errors[issue.message][en ? 1 : 0]
        : t('Não foi possível preparar a pré-visualização. Não foi criado qualquer pagamento.', 'Could not prepare the preview. No payment was created.'));
    } finally { if (!current.signal.aborted) setBusy(false); }
  }

  const customer = preview?.billing;
  const money = amount => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(amount / 100);
  return <section className="sandbox-checkout__panel" aria-labelledby="live-pilot-preview-title" aria-busy={busy}>
    <h2 id="live-pilot-preview-title">{t('Ensaio privado — pré-visualização', 'Private pilot — preview')}</h2>
    <p>{t('Preparação exclusiva para a conta de administração. Consulte o valor e os dados de faturação antes de qualquer pagamento real. Funciona com os pagamentos reais desativados.',
      'Preparation for the administrator account only. Review the amount and billing details before any real payment. Available while live payments are disabled.')}</p>
    <p><strong>{t('Congresso presencial · Multibanco · sem cursos nem jantar', 'Onsite congress · Multibanco · no courses or dinner')}</strong></p>
    <label htmlFor="live-pilot-profile">{t('Perfil para o ensaio', 'Pilot profile')}</label>
    <select id="live-pilot-profile" value={profile} disabled={busy} onChange={event => changeProfile(event.target.value)}>
      <option value="external">{t('Congressista externo', 'External attendee')}</option>
      <option value="uls">ULS Coimbra</option>
      <option value="student">{t('Estudante', 'Student')}</option>
    </select>
    <p className="sandbox-checkout__muted">{t('A tarifa é calculada no servidor para a data atual. ULS e estudante exigem a validação habitual; esta consulta não reserva tarifa nem inscrição.',
      'The server calculates the current tariff. ULS and student profiles require the usual eligibility checks; this preview reserves neither a tariff nor a registration.')}</p>
    <button type="button" disabled={busy} onClick={prepare}>{busy
      ? t('A preparar pré-visualização…', 'Preparing preview…')
      : t('Pré-visualizar ensaio privado', 'Preview private pilot')}</button>
    {error && <p className="sandbox-checkout__error" role="alert">{error}</p>}
    {preview && <div className="sandbox-checkout__confirmed">
      <h3>{t('Dados para conferência', 'Details for review')}</h3>
      <p><strong>{t('Valor previsto:', 'Expected amount:')} {money(preview.quote.amountCents)}</strong></p>
      <dl>
        <dt>{t('Nome de faturação', 'Billing name')}</dt><dd>{customer.customer_business_name}</dd>
        <dt>{t('NIF', 'Tax number')}</dt><dd>{customer.customer_tax_registration_number}</dd>
        <dt>{t('Morada', 'Address')}</dt><dd>{customer.customer_address_detail}</dd>
        <dt>{t('Código postal e localidade', 'Postcode and city')}</dt><dd>{customer.customer_postcode} · {customer.customer_city}</dd>
        <dt>{t('País', 'Country')}</dt><dd>{customer.customer_country}</dd>
      </dl>
      <p>{t('Dados lidos do Perfil My CIRC apenas para esta consulta. Se estiverem incorretos, corrija o perfil e volte a pré-visualizar.',
        'Details were read from your My CIRC profile for this request only. If incorrect, update your profile and preview again.')}</p>
    </div>}
    <p><strong>{t('A pré-visualização não cria referências, não altera inscrições nem emite faturas-recibo. Só a ação «Gerar referência Multibanco real», após ativação e confirmação, pode criar o pedido.',
      'Previewing creates no references, changes no registrations and issues no invoice-receipts. Only “Generate real Multibanco reference”, after activation and confirmation, can create the order.')}</strong></p>
    <LivePaymentPilotOrder key={user.uid} user={user} preview={preview} en={en} />
  </section>;
}
