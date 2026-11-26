import React, { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CompanyRegistrationGate } from '../CompanyVoucher';
import OrganizerVoucher from '../OrganizerVoucher';
import RegistrationInvoice from '../RegistrationInvoice';
import PublicLiveCheckout from '../PublicLiveCheckout';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUlsEligibility } from '../../auth/ulsEligibilityStore';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import { useRegistrationCapacity } from '../../auth/registrationCapacity';
import UlsVerification from './UlsVerification';
import StudentVerification from './StudentVerification';
import { CONGRESS_RATES, DINNER_RATE, REGISTRATION_CAPACITY_ENABLED, VIRTUAL_CONGRESS_RATE, getCourseRate, calculateRegistrationTotal, formatEuro, getRegistrationPeriod } from '../../data/registration2027';
import '../css/RegistrationBuilder.css';
import { mriCourseTitle } from '../MriCourseDescription';
import { strokeCourseTitle } from '../StrokeCourseDescription';

const selectionItems = selection => ({ morningCourse: Boolean(selection?.morningCourse), afternoonCourse: Boolean(selection?.afternoonCourse), dinnerQuantity: Number(selection?.dinnerQuantity) || 0 });
const modeLabel = (mode, en) => mode === 'virtual' ? (en ? 'Virtual congress' : 'Congresso virtual') : mode === 'onsite' ? (en ? 'Onsite congress' : 'Congresso presencial') : (en ? 'Pre-congress courses' : 'Cursos pré-congresso');
const hasCapacity = (capacity, key) => !REGISTRATION_CAPACITY_ENABLED || (capacity.status === 'ready' && capacity.remaining[key] > 0);
const capacityPermits = (capacity, selection) => (selection.congressMode !== 'onsite' || hasCapacity(capacity, 'onsite'))
  && (!selection.morningCourse || hasCapacity(capacity, 'morningCourse'))
  && (!selection.afternoonCourse || hasCapacity(capacity, 'afternoonCourse'));
const capacityReviewPending = registration => Boolean(registration.capacityReviewOrderId
  || registration.payment?.capacityStatus === 'review_required' || registration.capacityStatus === 'review_required');
const formatQuoteAmount = (cents, en) => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', {
  style: 'currency', currency: 'EUR',
}).format(cents / 100);

function CapacityNotice({ capacity, en }) {
  if (!REGISTRATION_CAPACITY_ENABLED) return null;
  return <section className="registration-capacity" aria-label={en ? 'Available places' : 'Lugares disponíveis'}>
    <h3>{en ? 'Available places' : 'Lugares disponíveis'}</h3>
    {capacity.status === 'ready' ? <dl>{[
      ['onsite', en ? 'Onsite congress' : 'Congresso presencial'],
      ['morningCourse', en ? 'Morning course' : 'Curso da manhã'],
      ['afternoonCourse', en ? 'Afternoon course' : 'Curso da tarde'],
    ].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{capacity.remaining[key]} / {capacity.limits[key]} {en ? 'places available' : 'lugares disponíveis'}</dd></div>)}</dl>
      : capacity.status === 'error' ? <p role="alert">{en ? 'Available places could not be confirmed. Refresh before choosing onsite attendance or courses. Virtual attendance and dinner tickets remain available.' : 'Não foi possível confirmar os lugares disponíveis. Atualize antes de escolher o congresso presencial ou os cursos. A participação virtual e os bilhetes de jantar continuam disponíveis.'}</p>
        : <p role="status">{en ? 'Checking available places…' : 'A consultar lugares disponíveis…'}</p>}
    <p>{en ? 'Places are confirmed by payment. Pending orders do not reserve places. Capacity is checked again when payment is confirmed. Virtual attendance and dinner tickets have no capacity limit.' : 'Os lugares são confirmados pelo pagamento. Os pedidos pendentes não reservam lugares. A lotação é revista quando o pagamento é confirmado. A participação virtual e os bilhetes de jantar não têm limite de lotação.'}</p>
    <button type="button" disabled={capacity.status === 'loading'} onClick={capacity.refresh}>{en ? 'Refresh available places' : 'Atualizar lugares disponíveis'}</button>
  </section>;
}

function CourseChoices({ value, onChange, profile, en, locked = false, owned = {}, organizerBenefit = false, capacity }) {
  const coursePrice = getCourseRate(profile, profile === 'uls' ? 'uls' : 'external');
  return <fieldset disabled={locked} className="registration-purchase-options">
    <legend>{en ? 'Choose one or both courses' : 'Escolha um ou ambos os cursos'}</legend>
    {[['morningCourse', mriCourseTitle], ['afternoonCourse', strokeCourseTitle]].map(([key, title]) => {
      const included = owned[key] || organizerBenefit;
      const unavailable = !value[key] && !included && !hasCapacity(capacity, key);
      const priceLabel = owned[key] ? (en ? 'Already included in your registration' : 'Já incluído na inscrição')
        : organizerBenefit ? (en ? 'Included with the voucher' : 'Incluído no voucher')
          : `${formatEuro(coursePrice)} / ${en ? 'course' : 'curso'}`;
      return <label className={`registration-purchase-option${unavailable ? ' is-unavailable' : ''}`} key={key}>
        <input type="checkbox" checked={Boolean(included || value[key])} disabled={Boolean(included || unavailable)} onChange={event => onChange({ ...value, [key]: event.target.checked })} />
        <span><strong>{title[en ? 'en' : 'pt']}</strong><small>{priceLabel}</small>
          {!included && !hasCapacity(capacity, key) && <small>{capacity.status === 'ready' ? (en ? 'Full' : 'Esgotado') : (en ? 'Availability unconfirmed' : 'Disponibilidade por confirmar')}</small>}
        </span>
      </label>;
    })}
  </fieldset>;
}

function DinnerChoices({ value, onChange, en, locked = false, owned = {}, organizerBenefit = false }) {
  const dinnerLabelId = useId();
  const minimumDinner = organizerBenefit ? 1 : 0;
  const dinnerQuantity = Math.max(minimumDinner, value.dinnerQuantity);
  const dinnerLabel = en ? 'Dinner tickets' : 'Bilhetes de jantar';
  function setDinnerQuantity(raw) {
    const quantity = Number(raw);
    if (Number.isSafeInteger(quantity) && quantity >= minimumDinner) onChange({ ...value, dinnerQuantity: quantity });
  }
  return <fieldset disabled={locked} className="registration-purchase-options">
    <legend>{dinnerLabel}</legend>
    <div className="registration-purchase-option registration-purchase-option--quantity" role="group" aria-labelledby={dinnerLabelId}>
      <span><strong id={dinnerLabelId}>{dinnerLabel}</strong><small>
        {organizerBenefit ? (en ? `One ticket included · ${formatEuro(DINNER_RATE)} per additional ticket` : `Um bilhete incluído · ${formatEuro(DINNER_RATE)} por bilhete adicional`)
          : `${formatEuro(DINNER_RATE)} / ${en ? 'person' : 'pessoa'}${Number(owned.dinnerQuantity) > 0 ? ` · ${owned.dinnerQuantity} ${en ? 'already included' : 'já incluído(s)'}` : ''}`}
      </small></span>
      <div className="registration-dinner-stepper">
        <button type="button" aria-label={en ? 'Remove one dinner ticket' : 'Retirar um bilhete de jantar'}
          disabled={dinnerQuantity === minimumDinner} onClick={() => setDinnerQuantity(dinnerQuantity - 1)}>−</button>
        <input type="number" inputMode="numeric" min={minimumDinner} step="1" placeholder="0"
          value={dinnerQuantity === 0 ? '' : String(dinnerQuantity)} onChange={event => setDinnerQuantity(event.target.value)}
          aria-label={en ? 'Additional dinner tickets' : 'Quantidade de bilhetes de jantar'} />
        <button type="button" aria-label={en ? 'Add one dinner ticket' : 'Adicionar um bilhete de jantar'}
          onClick={() => setDinnerQuantity(dinnerQuantity + 1)}>+</button>
      </div>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {dinnerQuantity} {en ? (dinnerQuantity === 1 ? 'dinner ticket selected' : 'dinner tickets selected')
          : (dinnerQuantity === 1 ? 'bilhete de jantar selecionado' : 'bilhetes de jantar selecionados')}
      </span>
    </div>
  </fieldset>;
}

function SupplementChoices(props) {
  return <><CourseChoices {...props} /><DinnerChoices {...props} /></>;
}

function RegistrationSupplements({ registration, user, en, onActiveOrder }) {
  const profile = registration.selection?.profile;
  const capacityReview = capacityReviewPending(registration);
  const owned = registration.entitlements || (capacityReview ? {} : registration.selection) || {};
  const [chosen, setChosen] = useState({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  const [locked, setLocked] = useState(false);
  const revealedOrder = useRef(false);
  function handleCheckoutLock(next) {
    setLocked(next);
    // Keep recovery mounted inside the disclosure and reveal an existing order
    // once, without reopening the section on every payment status refresh.
    if (next && !revealedOrder.current) onActiveOrder();
    revealedOrder.current = next;
  }
  const uls = useUlsEligibility(user);
  const student = useStudentVerification(user, profile === 'student');
  const capacity = useRegistrationCapacity(user, REGISTRATION_CAPACITY_ENABLED);
  const selection = { morningCourse: chosen.morningCourse && !owned.morningCourse, afternoonCourse: chosen.afternoonCourse && !owned.afternoonCourse, dinnerQuantity: chosen.dinnerQuantity };
  const hasItems = selection.morningCourse || selection.afternoonCourse || selection.dinnerQuantity > 0;
  const eligible = user.emailVerified === true && hasItems && !registration.fiscalPendingOrderId && !capacityReview
    && capacityPermits(capacity, selection)
    && (profile === 'external' || (profile === 'uls' && uls.verified) || (profile === 'student' && student.approved));
  const total = calculateRegistrationTotal({ ...selection, profile, courseAffiliation: profile === 'uls' ? 'uls' : 'external', congressMode: '', period: getRegistrationPeriod() });
  const showOrganizerVoucher = profile === 'uls' && registration.selection?.congressMode === 'onsite'
    && !registration.voucherId && registration.payment?.method !== 'organization_voucher'
    && user.emailVerified === true && (registration.organizerVoucherRedeemed || (!owned.morningCourse && !owned.afternoonCourse));
  return <section className="registration-step" aria-labelledby="registration-additions-title">
    <h2 id="registration-additions-title">{en ? 'Add courses or dinner tickets' : 'Adicionar cursos ou bilhetes de jantar'}</h2>
    <p>{en ? 'Each new purchase has a separate payment and invoice-receipt.' : 'Cada compra adicional tem pagamento e fatura-recibo próprios.'}</p>
    <CapacityNotice capacity={capacity} en={en} />
    {showOrganizerVoucher && <OrganizerVoucher key={registration.id} user={user} registration={registration} en={en} locked={locked} onCapacityRefresh={capacity.refresh} />}
    <SupplementChoices value={chosen} onChange={setChosen} profile={profile} en={en} locked={locked} owned={owned} capacity={capacity} />
    {profile === 'uls' && !uls.verified && <UlsVerification user={user} eligibility={uls} en={en} />}
    {profile === 'student' && !student.approved && <StudentVerification user={user} verification={student} en={en} />}
    {!locked && <p>{en ? 'Estimated new purchase total' : 'Total estimado da nova compra'}: <strong>{formatEuro(total.total)}</strong></p>}
    {!hasItems && !locked && <p>{en ? 'Select a course or the number of dinner tickets you want to add.' : 'Selecione um curso ou a quantidade de bilhetes de jantar que pretende acrescentar.'}</p>}
    {registration.fiscalPendingOrderId && <p role="status">{en ? 'Wait for the previous order invoice to be issued before preparing another payment.' : 'Aguarde a emissão da fatura do pedido anterior antes de preparar outro pagamento.'}</p>}
    <PublicLiveCheckout key={`${user.uid}:supplementary`} user={user} selection={selection} eligible={eligible} registration={registration} kind="supplementary" en={en} onLock={handleCheckoutLock} onCapacityRefresh={capacity.refresh} onNewPurchase={() => setChosen({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 })} />
  </section>;
}

export function ExistingRegistrationAddOns({ registration, user, en = false }) {
  const [showSupplements, setShowSupplements] = useState(false);
  const supplementsId = useId();
  const selection = registration.selection || {};
  const capacityReview = capacityReviewPending(registration);
  const entitlements = registration.entitlements || (capacityReview ? {} : selection);
  const paid = registration.payment?.status === 'paid';
  const organizationVoucher = paid && registration.payment.method === 'organization_voucher';
  const confirmed = registration.status === 'confirmed' && paid && !capacityReview;
  const awaitingConfirmation = paid && !confirmed && registration.status !== 'cancelled';
  const status = capacityReview ? (en ? 'Payment received · Place under review' : 'Pagamento recebido · Vaga em conferência')
    : organizationVoucher && confirmed ? (en ? 'Confirmed with a discount' : 'Confirmada com desconto')
      : paid ? (en ? 'Paid' : 'Paga') : registration.payment?.status === 'refunded' ? (en ? 'Refund recorded' : 'Reembolso registado') : (en ? 'Under review' : 'Em conferência');
  const canAdd = registration.status === 'confirmed' && paid && !capacityReview && registration.isTest === false && registration.testMode !== true;
  return <div className="registration-builder registration-builder--addons">
    {(confirmed || awaitingConfirmation) && <section className={`registration-outcome ${confirmed ? 'is-confirmed' : 'is-waiting'}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="registration-outcome__icon" aria-hidden="true">{confirmed ? '✓' : '…'}</span>
      <div><h2>{confirmed ? (en ? 'Registration confirmed' : 'Inscrição confirmada') : (en ? 'Payment received · Registration under review' : 'Pagamento recebido · Inscrição em conferência')}</h2>
        <p>{confirmed
          ? (en ? 'Your participation is confirmed. No further payment is needed for the items listed below.' : 'A sua participação está confirmada. Não é necessário efetuar outro pagamento para os itens indicados abaixo.')
          : (en ? 'The organisers still need to confirm your registration or place. Do not pay again.' : 'A organização ainda precisa de confirmar a inscrição ou a vaga. Não efetue outro pagamento.')}</p>
        {confirmed && <p>{en ? 'This page confirms your registration, even if you have not received an email.' : 'Esta página confirma a inscrição, mesmo que ainda não tenha recebido um email.'}</p>}
      </div>
    </section>}
    <section className="registration-summary registration-paid-summary" aria-labelledby="registration-existing-title">
      <div className="registration-summary__rate"><span>{en ? 'Your registration' : 'A sua inscrição'}</span><strong>{status}</strong></div>
      <h2 id="registration-existing-title">{en ? 'Registration summary' : 'Resumo da inscrição'}</h2>
      <p><strong>{registration.participantName}</strong></p>
      {capacityReview && <p role="status">{en ? 'Payment has been received, but the place or registration awaits review by the organisers. Do not pay again. The requested places are not yet confirmed.' : 'O pagamento foi recebido, mas a vaga ou inscrição aguarda conferência pela organização. Não efetue outro pagamento. Os lugares solicitados ainda não estão confirmados.'}</p>}
      <ul><li><span><strong>CIRC 2027 · {modeLabel(selection.congressMode, en)}</strong><small>{selection.congressMode === 'courses-only' ? '8' : '9–10'} {en ? 'April' : 'de abril'} 2027</small></span></li>
        {entitlements.morningCourse && <li>{en ? 'Morning course included' : 'Curso da manhã incluído'}</li>}
        {entitlements.afternoonCourse && <li>{en ? 'Afternoon course included' : 'Curso da tarde incluído'}</li>}
        {entitlements.dinnerQuantity > 0 && <li>{en ? 'Dinner tickets' : 'Bilhetes de jantar'}: {entitlements.dinnerQuantity}</li>}</ul>
      <div className="registration-summary__total"><span>{en ? 'Original registration amount' : 'Valor da inscrição original'}</span><strong>{formatEuro(Number(registration.voucherId ? registration.payment?.coveredAmountCents || 0 : registration.payment?.amountCents || 0) / 100)}</strong></div>
      {organizationVoucher && Number.isSafeInteger(registration.payment.coveredAmountCents) && registration.payment.coveredAmountCents > 0
        && <p>{en ? 'Discount applied' : 'Desconto aplicado'} <strong>{formatQuoteAmount(registration.payment.coveredAmountCents, en)}</strong></p>}
      {Number.isSafeInteger(registration.supplementaryPaidAmountCents) && registration.supplementaryPaidAmountCents > 0 && <p>{en ? 'Paid additional purchases' : 'Compras adicionais pagas'}: <strong>{formatEuro(registration.supplementaryPaidAmountCents / 100)}</strong></p>}
      {registration.voucherId && <p>{en ? 'Paid by' : 'Pago por'}: <strong>{registration.payment?.payer}</strong>. {en ? 'The original invoice belongs to the company purchase.' : 'O documento de faturação original pertence à compra da empresa.'}</p>}
      <p className="registration-paid-reference">{en ? 'Registration reference' : 'Referência da inscrição'}: {registration.id}</p>
      {paid && registration.fiscalPendingOrderId && <p role="status">{en ? 'Payment is confirmed. The invoice-receipt awaits completion by the organisers; do not make another payment.' : 'O pagamento está confirmado. A fatura-recibo está pendente de conclusão pela organização; não efetue outro pagamento.'}</p>}
      {((!registration.voucherId && !organizationVoucher) || Number(registration.documentCount) > 0 || Number(registration.addOnOrderCount) > 0) && <>
        {(registration.voucherId || organizationVoucher) && <p><strong>{en ? 'Documents for your additional purchases' : 'Documentos das suas compras adicionais'}</strong></p>}
        <RegistrationInvoice user={user} registration={registration} en={en} />
      </>}
      {confirmed && <Link className="button button--dark" to="/conta/programa">{en ? 'View programme' : 'Consultar programa'}</Link>}
      <Link to="/conta">{en ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
    </section>
    {canAdd ? <section className="registration-optional-purchases" aria-labelledby={`${supplementsId}-title`}>
      <h2 id={`${supplementsId}-title`}>{en ? 'Optional additional purchases' : 'Compras adicionais opcionais'}</h2>
      <p>{en ? 'Add courses or dinner tickets, apply an organiser voucher, or check an additional order. Your confirmed registration is already complete.' : 'Acrescente cursos ou bilhetes de jantar, aplique um voucher de organizador ou consulte uma compra adicional. A inscrição confirmada já está concluída.'}</p>
      <button type="button" className="button button--outline" aria-expanded={showSupplements} aria-controls={supplementsId} onClick={() => setShowSupplements(value => !value)}>{showSupplements ? (en ? 'Hide additional purchases' : 'Ocultar compras adicionais') : (en ? 'View additional options and purchases' : 'Ver opções e compras adicionais')}</button>
      <div id={supplementsId} hidden={!showSupplements}>
        <RegistrationSupplements registration={registration} user={user} en={en} onActiveOrder={() => setShowSupplements(true)} />
      </div>
    </section> : <p>{capacityReview
      ? (en ? 'Contact the organisers to follow up on the place review.' : 'Contacte a organização para acompanhar a conferência da vaga.')
      : (en ? 'Contact the organisers before creating another purchase for this registration.' : 'Contacte a organização antes de criar outra compra para esta inscrição.')}</p>}
  </div>;
}

function ProductionRegistrationBuilder({ registration }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [chosenProfile, setProfile] = useState('external');
  const [chosenMode, setMode] = useState('courses-only');
  const [chosenItems, setItems] = useState({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const [voucherQuote, setVoucherQuote] = useState(null);
  const profile = registration?.selection?.profile || chosenProfile;
  const congressMode = registration?.selection?.congressMode || chosenMode;
  const items = registration ? selectionItems(registration.selection) : chosenItems;
  const uls = useUlsEligibility(user);
  const student = useStudentVerification(user, profile === 'student');
  const period = getRegistrationPeriod();
  const existingAddOns = Boolean(registration && (registration.payment?.status === 'paid'
    || ['cancelled', 'refunded'].includes(registration.payment?.status) || registration.status === 'cancelled'));
  const capacity = useRegistrationCapacity(user, REGISTRATION_CAPACITY_ENABLED && !existingAddOns && registration?.isTest !== true && registration?.testMode !== true);
  const categoryReady = user.emailVerified === true && (profile === 'external' || (profile === 'uls' && uls.verified) || (profile === 'student' && student.approved));
  const selection = { profile, congressMode, ...items };
  const ready = categoryReady && (congressMode !== 'courses-only' || items.morningCourse || items.afternoonCourse)
    && capacityPermits(capacity, selection);
  const total = calculateRegistrationTotal({ ...selection, courseAffiliation: profile === 'uls' ? 'uls' : 'external', period });
  const organizerBenefit = voucherQuote?.organizerBenefit;
  const voucherSavings = (organizerBenefit || voucherQuote?.discount)?.amountCents;
  const companyCovered = voucherQuote?.kind === 'company-voucher';
  const hasVoucherTotal = companyCovered || voucherSavings > 0;
  const locked = Boolean(registration) || checkoutLocked;
  if (registration?.isTest === true || registration?.testMode === true) return <p role="alert">{en ? 'An existing registration needs organiser review before another payment can be created.' : 'Existe uma inscrição que necessita de conferência pela organização antes de criar outro pagamento.'}</p>;
  if (existingAddOns) return <ExistingRegistrationAddOns registration={registration} user={user} en={en} />;
  return <div className="registration-builder">
    <div className="registration-builder__layout">
      <div className="registration-builder__main">
        <section className="registration-step registration-step--profile" aria-labelledby="registration-profile-title">
          <h2 id="registration-profile-title">{en ? 'Your registration profile' : 'O seu perfil de inscrição'}</h2>
          <p>{en ? 'Choose your category. Select congress attendance and courses separately below.' : 'Escolha a sua categoria. A participação no congresso e os cursos são selecionados separadamente abaixo.'}</p>
          <fieldset disabled={locked}><legend>{en ? 'Attendee category' : 'Categoria de participante'}</legend><div className="registration-choice-grid registration-choice-grid--three">
            {[['external', en ? 'External attendee' : 'Congressista externo'], ['uls', 'ULS Coimbra'], ['student', en ? 'IMR student' : 'Estudante de IMR']].map(([value, label]) => <label className={`registration-choice${profile === value ? ' is-selected' : ''}${locked ? ' is-disabled' : ''}`} key={value}>
              <input type="radio" name="registration-profile" value={value} checked={profile === value} onChange={() => setProfile(value)} />
              <span className="registration-choice__check" aria-hidden="true">✓</span><strong>{label}</strong>
            </label>)}
          </div></fieldset>
        </section>
        {!registration && profile !== 'external' && <section className="registration-step" aria-labelledby="registration-eligibility-title">
          <h2 id="registration-eligibility-title">{en ? 'Category validation' : 'Validação da categoria'}</h2>
          {profile === 'uls' ? <>
            <p>{en ? 'Verify your employee number (MEC) to access ULS Coimbra prices, including when buying courses only.' : 'Confirme o seu número mecanográfico (MEC) para beneficiar dos preços ULS Coimbra, incluindo na compra de cursos isolados.'}</p>
            <UlsVerification user={user} eligibility={uls} en={en} />
          </> : <StudentVerification user={user} verification={student} en={en} />}
        </section>}
        <section className="registration-step" aria-labelledby="registration-mode-title"><h2 id="registration-mode-title">{en ? 'Congress participation' : 'Participação no congresso'}</h2>
          <p>{en ? '9–10 April 2027. Congress registration is optional when purchasing pre-congress courses.' : '9–10 de abril de 2027. A inscrição no congresso é opcional para quem pretende frequentar os cursos pré-congresso.'}</p>
          <CapacityNotice capacity={capacity} en={en} />
          <fieldset disabled={locked}><legend>{en ? 'Congress attendance format' : 'Modalidade de participação no congresso'}</legend><div className="registration-choice-grid registration-choice-grid--three">
            {[['onsite', CONGRESS_RATES[profile]?.[period]], ['virtual', VIRTUAL_CONGRESS_RATE], ['courses-only', null]].map(([mode, price]) => <label className={`registration-choice${congressMode === mode ? ' is-selected' : ''}${mode === 'onsite' && !hasCapacity(capacity, 'onsite') ? ' is-disabled' : ''}`} key={mode}>
              <input type="radio" name="registration-mode" value={mode} checked={congressMode === mode} disabled={mode === 'onsite' && !hasCapacity(capacity, 'onsite')} onChange={() => setMode(mode)} />
              <strong>{mode === 'courses-only' ? (en ? 'No congress attendance' : 'Não participar no congresso') : modeLabel(mode, en)}</strong><span>{price === null ? (en ? 'No congress fee' : 'Sem custo de congresso') : formatEuro(price)}</span>
              {mode === 'onsite' && !hasCapacity(capacity, 'onsite') && <small>{capacity.status === 'ready' ? (en ? 'Full' : 'Esgotado') : (en ? 'Availability unconfirmed' : 'Disponibilidade por confirmar')}</small>}
            </label>)}
          </div></fieldset>
          {congressMode !== 'courses-only' && <p>{congressMode === 'onsite' ? 'Convento São Francisco · Coimbra' : (en ? 'Online attendance' : 'Participação online')}</p>}
        </section>
        <section className="registration-step" aria-labelledby="registration-courses-title">
          <h2 id="registration-courses-title">{en ? 'Pre-congress courses' : 'Cursos pré-congresso'}</h2>
          <p>{en ? '8 April 2027. Buy one or both courses, with or without congress registration. Each course is charged separately.' : '8 de abril de 2027. Pode comprar um ou ambos os cursos, com ou sem inscrição no congresso. O preço é por curso.'}</p>
          <CourseChoices value={items} onChange={setItems} profile={profile} en={en} locked={locked} organizerBenefit={Boolean(organizerBenefit)} capacity={capacity} />
          {congressMode === 'courses-only' && !items.morningCourse && !items.afternoonCourse && <p role="status">{en ? 'Without congress attendance, select at least one course to continue.' : 'Sem participação no congresso, selecione pelo menos um curso para continuar.'}</p>}
        </section>
        <section className="registration-step" aria-labelledby="registration-dinner-title">
          <h2 id="registration-dinner-title">{en ? 'Congress dinner' : 'Jantar do congresso'}</h2>
          <p>{en ? 'Optional addition to your congress or course registration.' : 'Complemento opcional à inscrição no congresso ou nos cursos.'}</p>
          <DinnerChoices value={items} onChange={setItems} en={en} locked={locked} organizerBenefit={Boolean(organizerBenefit)} />
        </section>
      </div>
      <aside className="registration-summary">
        <div className="registration-summary__rate"><span>{en ? 'Current tariff' : 'Tarifa atual'}</span><strong>{period === 'early' ? (en ? 'Until 31 January 2027' : 'Até 31 de janeiro de 2027') : (en ? 'From 1 February 2027' : 'Desde 1 de fevereiro de 2027')}</strong></div>
        <h2>{registration ? (en ? 'Your pending registration' : 'A sua inscrição pendente') : (en ? 'Registration summary' : 'Resumo da inscrição')}</h2>
        <p className="registration-summary__profile">CIRC 2027 · {congressMode === 'courses-only' && !items.morningCourse && !items.afternoonCourse
          ? (en ? 'Choose congress attendance or courses' : 'Selecione o congresso ou os cursos') : modeLabel(congressMode, en)}</p>
        {!hasVoucherTotal && <dl className="registration-summary__items">
          <div><dt>{en ? 'Congress' : 'Congresso'}</dt><dd>{congressMode === 'courses-only' ? (en ? 'Not selected' : 'Não selecionado') : formatEuro(total.congress)}</dd></div>
          <div><dt>{en ? 'Courses' : 'Cursos'}{total.courseCount > 0 ? ` (${total.courseCount})` : ''}</dt><dd>{formatEuro(total.courses)}</dd></div>
          {total.dinnerQuantity > 0 && <div><dt>{en ? 'Dinner tickets' : 'Bilhetes de jantar'} ({total.dinnerQuantity})</dt><dd>{formatEuro(total.dinner)}</dd></div>}
        </dl>}
        {voucherSavings > 0 && <div className="registration-summary__voucher">
          <dl>
            <div><dt>Subtotal</dt><dd>{formatQuoteAmount(voucherQuote.amountCents + voucherSavings, en)}</dd></div>
            <div><dt>{organizerBenefit ? (en ? 'Organiser voucher' : 'Voucher de organizador') : (en ? 'Discount code' : 'Código de desconto')}</dt><dd>−{formatQuoteAmount(voucherSavings, en)}</dd></div>
          </dl>
          {organizerBenefit && <p>{en ? 'Both courses and one dinner ticket are included.' : 'Inclui os dois cursos e um bilhete de jantar.'}</p>}
        </div>}
        {companyCovered && <p className="registration-summary__voucher">{en ? 'Registration covered by the company voucher.' : 'Inscrição coberta pelo voucher de empresa.'}</p>}
        <div className="registration-summary__total" aria-live="polite" aria-atomic="true">
          <span>{hasVoucherTotal ? (en ? 'Amount due' : 'Total a pagar') : (en ? 'Estimated amount' : 'Valor estimado')}</span>
          <strong>{hasVoucherTotal ? formatQuoteAmount(voucherQuote.amountCents, en) : formatEuro(total.total)}</strong>
        </div>
        {!companyCovered && congressMode !== 'courses-only' && <p className="registration-summary__tax">{en ? 'The applicable congress tariff is based on the payment date.' : 'A tarifa do congresso depende da data de pagamento.'}</p>}
        {!user.emailVerified && <p role="alert">{en ? 'Verify your account email before creating a payment.' : 'Confirme o email da sua conta antes de criar um pagamento.'}</p>}
        {!categoryReady && user.emailVerified && <p role="status">{en ? 'Complete the eligibility check for this category before continuing.' : 'Conclua a validação da categoria selecionada antes de continuar.'}</p>}
        <PublicLiveCheckout key={`${user.uid}:primary`} user={user} selection={selection} eligible={ready} registration={registration} en={en}
          onVoucherQuote={setVoucherQuote} onLock={setCheckoutLocked} onCapacityRefresh={capacity.refresh} />
      </aside>
    </div>
  </div>;
}

export default function RegistrationBuilder() {
  return <CompanyRegistrationGate>{registration => <ProductionRegistrationBuilder registration={registration} />}</CompanyRegistrationGate>;
}
