import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import CompanyVoucher, { CompanyRegistrationGate } from '../CompanyVoucher';
import RegistrationInvoice from '../RegistrationInvoice';
import PublicLiveCheckout from '../PublicLiveCheckout';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUlsEligibility } from '../../auth/ulsEligibilityStore';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import UlsVerification from './UlsVerification';
import StudentVerification from './StudentVerification';
import { CONGRESS_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE, getCourseRate, calculateRegistrationTotal, formatEuro, getRegistrationPeriod } from '../../data/registration2027';
import '../css/RegistrationBuilder.css';
import { mriCourseTitle } from '../MriCourseDescription';
import { strokeCourseTitle } from '../StrokeCourseDescription';

const selectionItems = selection => ({ morningCourse: Boolean(selection?.morningCourse), afternoonCourse: Boolean(selection?.afternoonCourse), dinnerQuantity: Number(selection?.dinnerQuantity) || 0 });
const modeLabel = (mode, en) => mode === 'virtual' ? (en ? 'Virtual congress' : 'Congresso virtual') : mode === 'onsite' ? (en ? 'Onsite congress' : 'Congresso presencial') : (en ? 'Pre-congress courses' : 'Cursos pré-congresso');

function SupplementChoices({ value, onChange, profile, en, locked = false, owned = {} }) {
  const coursePrice = getCourseRate(profile, profile === 'uls' ? 'uls' : 'external');
  function quantity(raw) {
    const number = Number(raw);
    if (Number.isSafeInteger(number) && number >= 0) onChange({ ...value, dinnerQuantity: number });
  }
  return <fieldset disabled={locked} className="registration-purchase-options">
    <legend>{en ? 'Courses and dinner' : 'Cursos e jantar'}</legend>
    {[['morningCourse', mriCourseTitle], ['afternoonCourse', strokeCourseTitle]].map(([key, title]) => <label className="registration-purchase-option" key={key}>
      <input type="checkbox" checked={Boolean(owned[key] || value[key])} disabled={Boolean(owned[key])} onChange={event => onChange({ ...value, [key]: event.target.checked })} />
      <span><strong>{title[en ? 'en' : 'pt']}</strong><small>{owned[key] ? (en ? 'Already included in your registration' : 'Já incluído na inscrição') : `${formatEuro(coursePrice)} / ${en ? 'course' : 'curso'}`}</small></span>
    </label>)}
    <label className="registration-purchase-option registration-purchase-option--quantity">
      <span><strong>{en ? 'Dinner tickets' : 'Bilhetes de jantar'}</strong><small>{formatEuro(DINNER_RATE)} / {en ? 'person' : 'pessoa'}{Number(owned.dinnerQuantity) > 0 ? ` · ${owned.dinnerQuantity} ${en ? 'already included' : 'já incluído(s)'}` : ''}</small></span>
      <input type="number" inputMode="numeric" min="0" step="1" value={value.dinnerQuantity} onChange={event => quantity(event.target.value)} aria-label={en ? 'Additional dinner tickets' : 'Quantidade de bilhetes de jantar'} />
    </label>
  </fieldset>;
}

function RegistrationSupplements({ registration, user, en }) {
  const profile = registration.selection?.profile;
  const owned = registration.entitlements || registration.selection || {};
  const [chosen, setChosen] = useState({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  const [locked, setLocked] = useState(false);
  const uls = useUlsEligibility(user);
  const student = useStudentVerification(user, profile === 'student');
  const selection = { morningCourse: chosen.morningCourse && !owned.morningCourse, afternoonCourse: chosen.afternoonCourse && !owned.afternoonCourse, dinnerQuantity: chosen.dinnerQuantity };
  const hasItems = selection.morningCourse || selection.afternoonCourse || selection.dinnerQuantity > 0;
  const eligible = user.emailVerified === true && hasItems && !registration.fiscalPendingOrderId
    && (profile === 'external' || (profile === 'uls' && uls.verified) || (profile === 'student' && student.approved));
  const total = calculateRegistrationTotal({ ...selection, profile, courseAffiliation: profile === 'uls' ? 'uls' : 'external', congressMode: '', period: getRegistrationPeriod() });
  return <section className="registration-step" aria-labelledby="registration-additions-title">
    <h2 id="registration-additions-title">{en ? 'Add courses or dinner tickets' : 'Adicionar cursos ou bilhetes de jantar'}</h2>
    <p>{en ? 'Each new purchase has a separate payment and invoice-receipt. Your original registration and its invoice remain unchanged.' : 'Cada compra adicional tem pagamento e fatura-recibo próprios. A inscrição original e a sua fatura mantêm-se.'}</p>
    <SupplementChoices value={chosen} onChange={setChosen} profile={profile} en={en} locked={locked} owned={owned} />
    {profile === 'uls' && !uls.verified && <UlsVerification user={user} eligibility={uls} en={en} />}
    {profile === 'student' && !student.approved && <StudentVerification user={user} verification={student} en={en} />}
    {!locked && <p>{en ? 'Estimated new purchase total' : 'Total estimado da nova compra'}: <strong>{formatEuro(total.total)}</strong></p>}
    {!hasItems && !locked && <p>{en ? 'Select a course or the number of dinner tickets you want to add.' : 'Selecione um curso ou a quantidade de bilhetes de jantar que pretende acrescentar.'}</p>}
    {registration.fiscalPendingOrderId && <p role="status">{en ? 'Wait for the previous order invoice to be issued before preparing another payment.' : 'Aguarde a emissão da fatura do pedido anterior antes de preparar outro pagamento.'}</p>}
    <PublicLiveCheckout key={`${user.uid}:supplementary`} user={user} selection={selection} eligible={eligible} registration={registration} kind="supplementary" en={en} onLock={setLocked} onNewPurchase={() => setChosen({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 })} />
  </section>;
}

export function ExistingRegistrationAddOns({ registration, user, en = false }) {
  const selection = registration.selection || {};
  const entitlements = registration.entitlements || selection;
  const paid = registration.payment?.status === 'paid';
  const status = paid ? (en ? 'Paid' : 'Paga') : registration.payment?.status === 'refunded' ? (en ? 'Refund recorded' : 'Reembolso registado') : (en ? 'Under review' : 'Em conferência');
  const canAdd = registration.status === 'confirmed' && paid && registration.isTest === false && registration.testMode !== true;
  return <div className="registration-builder registration-builder--addons">
    <section className="registration-summary registration-paid-summary" aria-labelledby="registration-existing-title">
      <div className="registration-summary__rate"><span>{en ? 'Your registration' : 'A sua inscrição'}</span><strong>{status}</strong></div>
      <h2 id="registration-existing-title">{en ? 'Registration summary' : 'Resumo da inscrição'}</h2>
      <p><strong>{registration.participantName}</strong></p>
      <ul><li><span><strong>CIRC 2027 · {modeLabel(selection.congressMode, en)}</strong><small>{selection.congressMode === 'courses-only' ? '8' : '9–10'} {en ? 'April' : 'de abril'} 2027</small></span></li>
        {entitlements.morningCourse && <li>{en ? 'Morning course included' : 'Curso da manhã incluído'}</li>}
        {entitlements.afternoonCourse && <li>{en ? 'Afternoon course included' : 'Curso da tarde incluído'}</li>}
        {entitlements.dinnerQuantity > 0 && <li>{en ? 'Dinner tickets' : 'Bilhetes de jantar'}: {entitlements.dinnerQuantity}</li>}</ul>
      <div className="registration-summary__total"><span>{en ? 'Original registration amount' : 'Valor da inscrição original'}</span><strong>{formatEuro(Number(registration.voucherId ? registration.payment?.coveredAmountCents || 0 : registration.payment?.amountCents || 0) / 100)}</strong></div>
      {Number.isSafeInteger(registration.supplementaryPaidAmountCents) && registration.supplementaryPaidAmountCents > 0 && <p>{en ? 'Paid additional purchases' : 'Compras adicionais pagas'}: <strong>{formatEuro(registration.supplementaryPaidAmountCents / 100)}</strong></p>}
      {registration.voucherId && <p>{en ? 'Paid by' : 'Pago por'}: <strong>{registration.payment?.payer}</strong>. {en ? 'The original invoice belongs to the company purchase.' : 'O documento de faturação original pertence à compra da empresa.'}</p>}
      <p className="registration-paid-reference">{en ? 'Registration reference' : 'Referência da inscrição'}: {registration.id}</p>
      {(!registration.voucherId || Number(registration.documentCount) > 0 || Number(registration.addOnOrderCount) > 0) && <>
        {registration.voucherId && <p><strong>{en ? 'Documents for your additional purchases' : 'Documentos das suas compras adicionais'}</strong></p>}
        <RegistrationInvoice user={user} registration={registration} en={en} />
      </>}
      <Link to="/conta">{en ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
    </section>
    {canAdd ? <RegistrationSupplements registration={registration} user={user} en={en} /> : <p>{en ? 'Contact the organisers before creating another purchase for this registration.' : 'Contacte a organização antes de criar outra compra para esta inscrição.'}</p>}
  </div>;
}

function ProductionRegistrationBuilder({ registration }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [chosenProfile, setProfile] = useState('external');
  const [chosenMode, setMode] = useState('onsite');
  const [chosenItems, setItems] = useState({ morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const profile = registration?.selection?.profile || chosenProfile;
  const congressMode = registration?.selection?.congressMode || chosenMode;
  const items = registration ? selectionItems(registration.selection) : chosenItems;
  const uls = useUlsEligibility(user);
  const student = useStudentVerification(user, profile === 'student');
  const period = getRegistrationPeriod();
  const categoryReady = user.emailVerified === true && (profile === 'external' || (profile === 'uls' && uls.verified) || (profile === 'student' && student.approved));
  const ready = categoryReady && (congressMode !== 'courses-only' || items.morningCourse || items.afternoonCourse);
  const selection = { profile, congressMode, ...items };
  const total = calculateRegistrationTotal({ ...selection, courseAffiliation: profile === 'uls' ? 'uls' : 'external', period });
  const locked = Boolean(registration) || checkoutLocked;
  if (registration?.isTest === true || registration?.testMode === true) return <p role="alert">{en ? 'An existing registration needs organiser review before another payment can be created.' : 'Existe uma inscrição que necessita de conferência pela organização antes de criar outro pagamento.'}</p>;
  if (registration && (registration.payment?.status === 'paid' || ['cancelled', 'refunded'].includes(registration.payment?.status) || registration.status === 'cancelled')) return <ExistingRegistrationAddOns registration={registration} user={user} en={en} />;
  return <div className="registration-builder">
    <div className="registration-builder__layout">
      <div className="registration-builder__main">
        <section className="registration-step" aria-labelledby="registration-profile-title">
          <h2 id="registration-profile-title">{en ? 'Your registration profile' : 'O seu perfil de inscrição'}</h2>
          <fieldset disabled={locked}><legend>{en ? 'Attendee category' : 'Categoria de participante'}</legend><div className="registration-choice-grid registration-choice-grid--three">
            {[['external', en ? 'External attendee' : 'Congressista externo'], ['uls', 'ULS Coimbra'], ['student', en ? 'IMR student' : 'Estudante de IMR']].map(([value, label]) => <label className={`registration-choice${profile === value ? ' is-selected' : ''}${locked ? ' is-disabled' : ''}`} key={value}>
              <input type="radio" name="registration-profile" value={value} checked={profile === value} onChange={() => setProfile(value)} />
              <span className="registration-choice__check" aria-hidden="true">✓</span><strong>{label}</strong><span>{formatEuro(CONGRESS_RATES[value][period])}</span>
            </label>)}
          </div></fieldset>
          {!registration && profile === 'uls' && <UlsVerification user={user} eligibility={uls} en={en} />}
          {!registration && profile === 'student' && <StudentVerification user={user} verification={student} en={en} />}
        </section>
        <section className="registration-step" aria-labelledby="registration-mode-title"><h2 id="registration-mode-title">{en ? 'Participation format' : 'Modalidade de participação'}</h2>
          <fieldset disabled={locked}><legend>{en ? 'Choose your participation' : 'Escolha a sua participação'}</legend><div className="registration-choice-grid registration-choice-grid--three">
            {[['onsite', CONGRESS_RATES[profile]?.[period]], ['virtual', VIRTUAL_CONGRESS_RATE], ['courses-only', null]].map(([mode, price]) => <label className={`registration-choice${congressMode === mode ? ' is-selected' : ''}`} key={mode}>
              <input type="radio" name="registration-mode" value={mode} checked={congressMode === mode} onChange={() => setMode(mode)} />
              <strong>{modeLabel(mode, en)}</strong><span>{price === null ? (en ? 'Choose the courses below' : 'Selecione os cursos abaixo') : formatEuro(price)}</span>
            </label>)}
          </div></fieldset>
          <p>{congressMode === 'onsite' ? (en ? '9–10 April 2027 · Convento São Francisco · Coimbra' : '9–10 de abril de 2027 · Convento São Francisco · Coimbra') : congressMode === 'virtual' ? (en ? '9–10 April 2027 · Online attendance' : '9–10 de abril de 2027 · Participação online') : (en ? '8 April 2027 · Morning and afternoon courses' : '8 de abril de 2027 · Cursos da manhã e da tarde')}</p>
          <SupplementChoices value={items} onChange={setItems} profile={profile} en={en} locked={locked} />
          {congressMode === 'courses-only' && !items.morningCourse && !items.afternoonCourse && <p role="status">{en ? 'Choose at least one pre-congress course to continue.' : 'Selecione pelo menos um curso pré-congresso para continuar.'}</p>}
        </section>
      </div>
      <aside className="registration-summary">
        <div className="registration-summary__rate"><span>{en ? 'Current tariff' : 'Tarifa atual'}</span><strong>{period === 'early' ? (en ? 'Until 31 January 2027' : 'Até 31 de janeiro de 2027') : (en ? 'From 1 February 2027' : 'Desde 1 de fevereiro de 2027')}</strong></div>
        <h2>{registration ? (en ? 'Your pending registration' : 'A sua inscrição pendente') : (en ? 'Registration summary' : 'Resumo da inscrição')}</h2>
        <p>CIRC 2027 · {modeLabel(congressMode, en)}</p>
        <div className="registration-summary__total"><span>{en ? 'Estimated amount' : 'Valor estimado'}</span><strong>{formatEuro(total.total)}</strong></div>
        <p>{en ? 'The server confirms the amount and billing details before a reference is created. The applicable congress tariff is based on the payment date.' : 'O servidor confirma o valor e os dados de faturação antes de criar a referência. A tarifa do congresso depende da data de pagamento.'}</p>
        {!user.emailVerified && <p role="alert">{en ? 'Verify your account email before creating a payment.' : 'Confirme o email da sua conta antes de criar um pagamento.'}</p>}
        {!categoryReady && user.emailVerified && <p role="status">{en ? 'Complete the eligibility check for this category before continuing.' : 'Conclua a validação da categoria selecionada antes de continuar.'}</p>}
        {!registration && !checkoutLocked && <CompanyVoucher eligible={profile === 'external' && congressMode === 'onsite' && !items.morningCourse && !items.afternoonCourse && items.dinnerQuantity === 0} />}
        <PublicLiveCheckout key={`${user.uid}:primary`} user={user} selection={selection} eligible={ready} registration={registration} en={en} onLock={setCheckoutLocked} />
      </aside>
    </div>
  </div>;
}

export default function RegistrationBuilder() {
  return <CompanyRegistrationGate>{registration => <ProductionRegistrationBuilder registration={registration} />}</CompanyRegistrationGate>;
}
