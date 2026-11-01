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
import { CONGRESS_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE, getCourseRate, formatEuro, getRegistrationPeriod } from '../../data/registration2027';
import '../css/RegistrationBuilder.css';
import { mriCourseTitle } from '../MriCourseDescription';
import { strokeCourseTitle } from '../StrokeCourseDescription';

export function ExistingRegistrationAddOns({ registration, user, en = false }) {
  const selection = registration.selection || {};
  const entitlements = registration.entitlements || selection;
  const paid = registration.payment?.status === 'paid';
  const status = paid ? (en ? 'Paid' : 'Paga') : registration.payment?.status === 'refunded' ? (en ? 'Refund recorded' : 'Reembolso registado') : (en ? 'Under review' : 'Em conferência');
  const title = selection.congressMode === 'virtual' ? (en ? 'Virtual congress' : 'Congresso virtual') : selection.congressMode === 'onsite' ? 'CIRC 2027 · Presencial' : (en ? 'Pre-congress courses' : 'Cursos pré-congresso');
  return <div className="registration-builder registration-builder--addons">
    <section className="registration-summary registration-paid-summary" aria-labelledby="registration-existing-title">
      <div className="registration-summary__rate"><span>{en ? 'Your registration' : 'A sua inscrição'}</span><strong>{status}</strong></div>
      <h2 id="registration-existing-title">{en ? 'Registration summary' : 'Resumo da inscrição'}</h2>
      <p><strong>{registration.participantName}</strong></p>
      <ul><li><span><strong>{title}</strong><small>9–10 {en ? 'April' : 'de abril'} 2027</small></span></li>
        {entitlements.morningCourse && <li>{en ? 'Morning course included' : 'Curso da manhã incluído'}</li>}
        {entitlements.afternoonCourse && <li>{en ? 'Afternoon course included' : 'Curso da tarde incluído'}</li>}
        {entitlements.dinnerQuantity > 0 && <li>{en ? 'Dinner tickets' : 'Bilhetes de jantar'}: {entitlements.dinnerQuantity}</li>}</ul>
      <div className="registration-summary__total"><span>{en ? 'Registration amount' : 'Valor da inscrição'}</span><strong>{formatEuro(Number(registration.voucherId ? registration.payment?.coveredAmountCents || 0 : registration.payment?.amountCents || 0) / 100)}</strong></div>
      {registration.voucherId && <p>{en ? 'Paid by' : 'Pago por'}: <strong>{registration.payment?.payer}</strong>. {en ? 'The invoice belongs to the company purchase.' : 'O documento de faturação pertence à compra da empresa.'}</p>}
      <p className="registration-paid-reference">{en ? 'Registration reference' : 'Referência da inscrição'}: {registration.id}</p>
      {!registration.voucherId && <RegistrationInvoice user={user} registration={registration} en={en} />}
      <p>{en ? 'Registration supplements are not available for purchase yet. Contact the organisers for assistance.' : 'A compra de complementos ainda não está disponível. Contacte a organização para esclarecimentos.'}</p>
      <Link to="/conta">{en ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
    </section>
  </div>;
}

function ProductionRegistrationBuilder({ registration }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [chosenProfile, setProfile] = useState('external');
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  const profile = registration?.selection?.profile || chosenProfile;
  const uls = useUlsEligibility(user);
  const student = useStudentVerification(user, profile === 'student');
  const period = getRegistrationPeriod();
  const ready = user.emailVerified === true && (profile === 'external' || (profile === 'uls' && uls.verified) || (profile === 'student' && student.approved));
  const selection = { profile, congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
  if (registration?.isTest === true || registration?.testMode === true) return <p role="alert">{en ? 'An existing registration needs organiser review before another payment can be created.' : 'Existe uma inscrição que necessita de conferência pela organização antes de criar outro pagamento.'}</p>;
  if (registration && (registration.payment?.status === 'paid' || ['cancelled', 'refunded'].includes(registration.payment?.status) || registration.status === 'cancelled')) {
    return <ExistingRegistrationAddOns registration={registration} user={user} en={en} />;
  }
  return <div className="registration-builder">
    <div className="registration-builder__layout">
      <div className="registration-builder__main">
        <section className="registration-step" aria-labelledby="registration-profile-title">
          <h2 id="registration-profile-title">{en ? 'Your registration profile' : 'O seu perfil de inscrição'}</h2>
          <fieldset disabled={Boolean(registration) || checkoutLocked}><legend>{en ? 'Attendee category' : 'Categoria de participante'}</legend><div className="registration-choice-grid registration-choice-grid--three">
            {[['external', en ? 'External attendee' : 'Congressista externo'], ['uls', 'ULS Coimbra'], ['student', en ? 'IMR student' : 'Estudante de IMR']].map(([value, label]) => <label className={`registration-choice${profile === value ? ' is-selected' : ''}${registration || checkoutLocked ? ' is-disabled' : ''}`} key={value}>
              <input type="radio" name="registration-profile" value={value} checked={profile === value} onChange={() => setProfile(value)} />
              <span className="registration-choice__check" aria-hidden="true">✓</span><strong>{label}</strong><span>{formatEuro(CONGRESS_RATES[value][period])}</span>
            </label>)}
          </div></fieldset>
          {!registration && profile === 'uls' && <UlsVerification user={user} eligibility={uls} en={en} />}
          {!registration && profile === 'student' && <StudentVerification user={user} verification={student} en={en} />}
        </section>
        <section className="registration-step"><h2>{en ? 'Onsite congress' : 'Congresso presencial'}</h2><p>9–10 {en ? 'April' : 'de abril'} 2027 · Convento São Francisco · Coimbra</p>
          <p>{en ? 'This registration covers the onsite congress. Courses, dinner, virtual participation and other payment methods are not available for purchase yet.' : 'Esta inscrição abrange o congresso presencial. A compra de cursos, jantar, participação virtual e outros meios de pagamento ainda não está disponível.'}</p>
          <fieldset disabled className="registration-unavailable-options"><legend>{en ? 'Other participation options — not available for purchase yet' : 'Outras opções de participação — compra ainda indisponível'}</legend>
            <label><input type="radio" name="unavailable-mode" /> {en ? 'Virtual congress' : 'Congresso virtual'} · {formatEuro(VIRTUAL_CONGRESS_RATE)}</label>
            <label><input type="radio" name="unavailable-mode" /> {en ? 'Pre-congress courses only' : 'Apenas cursos pré-congresso'}</label>
            <label><input type="checkbox" /> {mriCourseTitle[en ? 'en' : 'pt']} · {formatEuro(getCourseRate(profile, profile === 'uls' ? 'uls' : 'external'))}</label>
            <label><input type="checkbox" /> {strokeCourseTitle[en ? 'en' : 'pt']} · {formatEuro(getCourseRate(profile, profile === 'uls' ? 'uls' : 'external'))}</label>
            <label><input type="checkbox" /> {en ? 'Congress dinner' : 'Jantar do congresso'} · {formatEuro(DINNER_RATE)} / {en ? 'person' : 'pessoa'}</label>
          </fieldset>
        </section>
      </div>
      <aside className="registration-summary">
        <div className="registration-summary__rate"><span>{en ? 'Current tariff' : 'Tarifa atual'}</span><strong>{period === 'early' ? (en ? 'Until 31 January 2027' : 'Até 31 de janeiro de 2027') : (en ? 'From 1 February 2027' : 'Desde 1 de fevereiro de 2027')}</strong></div>
        <h2>{registration ? (en ? 'Your pending registration' : 'A sua inscrição pendente') : (en ? 'Registration summary' : 'Resumo da inscrição')}</h2>
        <p>CIRC 2027 · {en ? 'Onsite congress' : 'Congresso presencial'}</p>
        <div className="registration-summary__total"><span>{en ? 'Current amount' : 'Valor atual'}</span><strong>{formatEuro(CONGRESS_RATES[profile]?.[period] || 0)}</strong></div>
        <p>{en ? 'The applicable tariff is based on the payment date. Creating a reference does not reserve the tariff.' : 'A tarifa aplicável depende da data de pagamento. A criação da referência não reserva a tarifa.'}</p>
        {!user.emailVerified && <p role="alert">{en ? 'Verify your account email before creating a payment.' : 'Confirme o email da sua conta antes de criar um pagamento.'}</p>}
        {!ready && user.emailVerified && <p role="status">{en ? 'Complete the eligibility check for this category before continuing.' : 'Conclua a validação da categoria selecionada antes de continuar.'}</p>}
        {!registration && !checkoutLocked && <CompanyVoucher eligible={profile === 'external'} />}
        <PublicLiveCheckout key={user.uid} user={user} selection={selection} eligible={ready} registration={registration} en={en} onLock={setCheckoutLocked} />
      </aside>
    </div>
  </div>;
}

export default function RegistrationBuilder() {
  return <CompanyRegistrationGate>{registration => <ProductionRegistrationBuilder registration={registration} />}</CompanyRegistrationGate>;
}
