import React, { useState } from 'react';
import './css/CompanyVouchers.css';

const messages = {
  'organizer/auth': ['Volte a iniciar sessão com a sua conta verificada.', 'Sign in again with your verified account.'],
  'organizer/registration-not-open': ['Os vouchers podem ser aplicados após a abertura das inscrições.', 'Vouchers can be applied once registration opens.'],
  'organizer/invalid-code': ['O código é inválido ou já foi utilizado.', 'The code is invalid or has already been used.'],
  'organizer/paid-registration-required': ['É necessária uma inscrição presencial paga à tarifa ULS Coimbra.', 'A paid onsite registration at the ULS Coimbra rate is required.'],
  'organizer/already-redeemed': ['Esta inscrição já tem um voucher de organizador aplicado.', 'This registration already has an organiser voucher.'],
  'organizer/course-already-owned': ['Esta inscrição já inclui pelo menos um dos cursos. Contacte a organização para verificar o voucher.', 'This registration already includes at least one course. Contact the organisers to check your voucher.'],
  'organizer/supplementary-pending': ['Aguarde a conclusão do pedido de complementos antes de aplicar o voucher.', 'Wait for your order for additional items to finish before applying the voucher.'],
  'organizer/capacity-full': ['Um dos cursos está esgotado. Contacte a organização para verificar o voucher.', 'One course is fully booked. Contact the organisers to check your voucher.'],
  'organizer/conflict': ['A inscrição foi atualizada. Tente novamente com o mesmo código.', 'Your registration has been updated. Try again with the same code.'],
  'organizer/unavailable': ['Não foi possível confirmar o voucher. Tente novamente com o mesmo código.', 'The voucher could not be confirmed. Try again with the same code.'],
};

export default function OrganizerVoucher({ user, registration, en, locked, onCapacityRefresh }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const redeemed = registration.organizerVoucherRedeemed === true;
  const normalized = code.replace(/[\s-]/g, '').toLowerCase();
  const valid = /^[a-f0-9]{32}$/.test(normalized);
  const t = (pt, english) => en ? english : pt;

  async function submit(event) {
    event.preventDefault();
    if (busy || locked || submitted || redeemed || !valid) return;
    setBusy(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/checkout/live/organizer-voucher/redeem', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result?.error || 'organizer/unavailable');
        return;
      }
      if (result?.registrationId !== registration.id || typeof result.duplicate !== 'boolean') {
        setError('organizer/unavailable');
        return;
      }
      setCode('');
      setSubmitted(true);
      onCapacityRefresh();
    } catch {
      setError('organizer/unavailable');
    } finally {
      setBusy(false);
    }
  }

  if (redeemed || submitted) return <p role="status">{t('Voucher de organizador aplicado. Inclui os dois cursos e um bilhete de jantar.', 'Organiser voucher applied. Both courses and one dinner ticket are included.')}</p>;

  const formTitle = t('Aplicar voucher de organizador', 'Apply organiser voucher');
  return <details className="company-voucher">
    <summary>{t('Tem um voucher de organizador?', 'Have an organiser voucher?')}</summary>
    <form onSubmit={submit} aria-label={formTitle}>
      <p>{t('O voucher acrescenta o curso da manhã, o curso da tarde e um bilhete de jantar sem custo. Os lugares nos cursos são confirmados ao aplicar o código.', 'The voucher adds the morning course, the afternoon course and one dinner ticket at no cost. Places in both courses are confirmed when you apply the code.')}</p>
      {locked && <p>{t('Conclua o pedido de complementos para aplicar o voucher.', 'Finish your order for additional items to apply the voucher.')}</p>}
      <label>{t('Código do voucher', 'Voucher code')}
        <input value={code} onChange={event => { setCode(event.target.value); setError(''); }}
          autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} disabled={busy || locked} required />
      </label>
      {normalized && !valid && <p>{t('Introduza os 32 caracteres do código.', 'Enter all 32 characters of the code.')}</p>}
      <button type="submit" disabled={busy || locked || !valid}>{busy ? t('A aplicar…', 'Applying…') : formTitle}</button>
      {error && <p role="alert">{(messages[error] ?? messages['organizer/unavailable'])[en ? 1 : 0]}</p>}
    </form>
  </details>;
}
