import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { saveAdminTestRegistration } from '../../auth/registrationStore';
import { useLanguage } from '../../context/LanguageContext';
import {
  calculateRegistrationTotal,
  formatEuro,
  getRegistrationPeriod,
} from '../../data/registration2027';
import '../css/RegistrationBuilder.css';

function ChoiceCard({ selected, disabled, name, value, onChange, eyebrow, title, text }) {
  return (
    <label className={`registration-choice${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span className="registration-choice__check" aria-hidden="true">✓</span>
      <small>{eyebrow}</small>
      <strong>{title}</strong>
      <p>{text}</p>
    </label>
  );
}

function ToggleCard({ checked, disabled, onChange, date, period, title, price, text }) {
  return (
    <label className={`registration-toggle${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="registration-toggle__date">{date}<small>{period}</small></span>
      <span className="registration-toggle__content">
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <span className="registration-toggle__price">{price}</span>
      <span className="registration-toggle__control" aria-hidden="true"><i /></span>
    </label>
  );
}

function SummaryLine({ label, detail, amount }) {
  return (
    <li>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <b>{formatEuro(amount)}</b>
    </li>
  );
}

function RegistrationBuilder() {
  const { language } = useLanguage();
  const { user, isAdmin } = useAuth();
  const en = language === 'en';
  const [profile, setProfile] = useState('');
  const [courseAffiliation, setCourseAffiliation] = useState('');
  const [congressMode, setCongressMode] = useState('');
  const [morningCourse, setMorningCourse] = useState(false);
  const [afternoonCourse, setAfternoonCourse] = useState(false);
  const [dinnerQuantity, setDinnerQuantity] = useState(0);
  const [submissionState, setSubmissionState] = useState('idle');
  const [submissionError, setSubmissionError] = useState('');
  const period = getRegistrationPeriod();

  useEffect(() => {
    if (profile === 'uls') {
      setCourseAffiliation('uls');
    } else if (profile === 'external') {
      setCourseAffiliation('external');
    } else {
      setCourseAffiliation('');
    }

    if (profile === 'student') {
      setMorningCourse(false);
      setAfternoonCourse(false);
      setCongressMode((currentMode) => currentMode === 'courses-only' ? '' : currentMode);
    }
  }, [profile]);

  const totals = useMemo(() => calculateRegistrationTotal({
    profile,
    courseAffiliation,
    congressMode,
    morningCourse,
    afternoonCourse,
    dinnerQuantity,
    period,
  }), [afternoonCourse, congressMode, courseAffiliation, dinnerQuantity, morningCourse, period, profile]);

  const profileLabels = {
    uls: en ? 'ULS Coimbra delegate' : 'Congressista ULS Coimbra',
    external: en ? 'External delegate' : 'Congressista externo',
    student: en ? 'IMR student' : 'Estudante IMR',
  };
  const hasSelection = Boolean(congressMode || morningCourse || afternoonCourse || dinnerQuantity);
  const completeExperience = congressMode === 'onsite' && morningCourse && afternoonCourse;
  const coursesReady = Boolean(profile && profile !== 'student' && courseAffiliation);
  const hasCourse = profile !== 'student' && (morningCourse || afternoonCourse);
  const testSelectionReady = Boolean(
    profile
    && congressMode
    && (congressMode !== 'courses-only' || hasCourse)
    && (!hasCourse || courseAffiliation)
  );

  const submitTestRegistration = async () => {
    if (!isAdmin || !testSelectionReady || submissionState === 'saving') return;

    setSubmissionState('saving');
    setSubmissionError('');
    try {
      await saveAdminTestRegistration(user, {
        profile,
        courseAffiliation,
        congressMode,
        morningCourse,
        afternoonCourse,
        dinnerQuantity,
        period,
        total: totals.total,
      });
      setSubmissionState('saved');
    } catch (error) {
      setSubmissionState('error');
      setSubmissionError(en
        ? 'The test registration could not be saved. Check the Firebase rules.'
        : 'Não foi possível guardar a inscrição de teste. Confirme as regras do Firebase.');
    }
  };

  return (
    <div className="registration-builder">
      <div className="registration-builder__progress" aria-label={en ? 'Registration structure' : 'Estrutura da inscrição'}>
        <span className={profile ? 'is-complete' : 'is-current'}><b>1</b>{en ? 'Profile' : 'Perfil'}</span>
        <span className={congressMode ? 'is-complete' : profile ? 'is-current' : ''}><b>2</b>{en ? 'Congress' : 'Congresso'}</span>
        <span className={hasSelection ? 'is-complete' : ''}><b>3</b>{en ? 'Extras' : 'Complementos'}</span>
        <span><b>4</b>{en ? 'Summary' : 'Resumo'}</span>
      </div>

      <div className="registration-builder__layout">
        <div className="registration-builder__main">
          <section className="registration-step" aria-labelledby="registration-profile-title">
            <div className="registration-step__heading">
              <span>01</span>
              <div>
                <p>{en ? 'Participant profile' : 'Perfil do participante'}</p>
                <h2 id="registration-profile-title">{en ? 'Which rate applies to you?' : 'Que tarifa se aplica a si?'}</h2>
              </div>
            </div>
            <div className={`registration-choice-grid ${profile === 'student' ? 'registration-choice-grid--two' : 'registration-choice-grid--three'}`}>
              <ChoiceCard
                name="participant-profile"
                value="uls"
                selected={profile === 'uls'}
                onChange={setProfile}
                eyebrow="ULS Coimbra"
                title={en ? 'Delegate' : 'Congressista'}
                text={en ? 'ULS Coimbra professionals.' : 'Profissionais da ULS Coimbra.'}
              />
              <ChoiceCard
                name="participant-profile"
                value="external"
                selected={profile === 'external'}
                onChange={setProfile}
                eyebrow={en ? 'Other institutions' : 'Outras instituições'}
                title={en ? 'External delegate' : 'Congressista externo'}
                text={en ? 'Professionals from other organisations.' : 'Profissionais de outras entidades.'}
              />
              <ChoiceCard
                name="participant-profile"
                value="student"
                selected={profile === 'student'}
                onChange={setProfile}
                eyebrow={en ? 'Student rate' : 'Tarifa estudante'}
                title={en ? 'IMR student' : 'Estudante IMR'}
                text={en ? 'Valid proof will be required.' : 'Será necessário comprovativo válido.'}
              />
            </div>
          </section>

          <section className={`registration-step${!profile ? ' is-locked' : ''}`} aria-labelledby="registration-congress-title">
            <div className="registration-step__heading">
              <span>02</span>
              <div>
                <p>{en ? '9–10 April' : '9–10 abril'}</p>
                <h2 id="registration-congress-title">{en ? 'How will you attend the congress?' : 'Como pretende participar no congresso?'}</h2>
              </div>
            </div>
            {!profile && <p className="registration-step__lock-note">{en ? 'Select your profile first.' : 'Selecione primeiro o seu perfil.'}</p>}
            <div className="registration-choice-grid registration-choice-grid--three">
              <ChoiceCard
                name="congress-mode"
                value="onsite"
                selected={congressMode === 'onsite'}
                disabled={!profile}
                onChange={setCongressMode}
                eyebrow={en ? 'Coimbra · In person' : 'Coimbra · Presencial'}
                title="CIRC 2027"
                text={en ? 'Two days at Convento São Francisco.' : 'Dois dias no Convento São Francisco.'}
              />
              <ChoiceCard
                name="congress-mode"
                value="virtual"
                selected={congressMode === 'virtual'}
                disabled={!profile}
                onChange={setCongressMode}
                eyebrow={en ? 'Online access' : 'Acesso online'}
                title={en ? 'Virtual congress' : 'Congresso virtual'}
                text={en ? 'Remote participation at a single rate.' : 'Participação à distância com preço único.'}
              />
              {profile !== 'student' && (
                <ChoiceCard
                  name="congress-mode"
                  value="courses-only"
                  selected={congressMode === 'courses-only'}
                  disabled={!profile}
                  onChange={setCongressMode}
                  eyebrow={en ? '8 April only' : 'Apenas 8 de abril'}
                  title={en ? 'Courses only' : 'Apenas cursos'}
                  text={en ? 'Without registration for the congress.' : 'Sem inscrição no Congresso Internacional.'}
                />
              )}
            </div>
          </section>

          <section className={`registration-step${profile === 'student' ? ' registration-step--restricted' : !coursesReady ? ' is-locked' : ''}`} aria-labelledby="registration-courses-title">
            <div className="registration-step__heading">
              <span>03</span>
              <div>
                <p>{profile === 'student' ? (en ? '8 April · Professional access' : '8 abril · Acesso profissional') : (en ? '8 April · Optional' : '8 abril · Opcional')}</p>
                <h2 id="registration-courses-title">
                  {profile === 'student'
                    ? (en ? 'Courses are not available for students' : 'Cursos não disponíveis para estudantes')
                    : (en ? 'Add one or both courses' : 'Acrescente um ou os dois cursos')}
                </h2>
              </div>
            </div>
            {profile === 'student' ? (
              <div className="registration-course-restriction" role="note">
                <span aria-hidden="true">—</span>
                <div>
                  <strong>{en ? 'Reserved for professionals' : 'Reservado a profissionais'}</strong>
                  <p>{en ? 'The IMR student category allows registration for the in-person or virtual congress, but not for the Pre-Congress Courses.' : 'A categoria Estudante IMR permite a inscrição no congresso presencial ou virtual, mas não nos Cursos Pré-Congresso.'}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="registration-course-note">
                  <span>{en ? 'Price per course' : 'Preço por curso'}</span>
                  <strong>{coursesReady ? formatEuro(totals.courseUnit) : '—'}</strong>
                  <p>{en ? 'Morning and afternoon are charged independently.' : 'Manhã e tarde são cobradas de forma independente.'}</p>
                </div>
                <div className="registration-toggle-list">
                  <ToggleCard
                    checked={morningCourse}
                    disabled={!coursesReady}
                    onChange={setMorningCourse}
                    date="08"
                    period={en ? 'AM' : 'MANHÃ'}
                    title={en ? 'Pre-Congress Course · Morning' : 'Curso Pré-Congresso · Manhã'}
                    text={en ? 'Programme and capacity to be announced.' : 'Programa e lotação a anunciar.'}
                    price={coursesReady ? `+ ${formatEuro(totals.courseUnit)}` : '—'}
                  />
                  <ToggleCard
                    checked={afternoonCourse}
                    disabled={!coursesReady}
                    onChange={setAfternoonCourse}
                    date="08"
                    period={en ? 'PM' : 'TARDE'}
                    title={en ? 'Pre-Congress Course · Afternoon' : 'Curso Pré-Congresso · Tarde'}
                    text={en ? 'Independent course with separate capacity.' : 'Curso autónomo, com lotação própria.'}
                    price={coursesReady ? `+ ${formatEuro(totals.courseUnit)}` : '—'}
                  />
                </div>
              </>
            )}
          </section>

          <section className="registration-step registration-step--compact" aria-labelledby="registration-dinner-title">
            <div className="registration-step__heading">
              <span>04</span>
              <div>
                <p>{en ? 'Social programme · Optional' : 'Programa social · Opcional'}</p>
                <h2 id="registration-dinner-title">{en ? 'Congress dinner' : 'Jantar do congresso'}</h2>
              </div>
            </div>
            <div className={`registration-dinner-quantity${dinnerQuantity > 0 ? ' is-selected' : ''}`}>
              <span className="registration-dinner-quantity__copy">
                <strong>{en ? 'Dinner tickets' : 'Bilhetes para o jantar'}</strong>
                <small>{en ? 'Available with every registration category · €30 per person.' : 'Disponível em todas as modalidades · 30 € por pessoa.'}</small>
              </span>
              <b>{dinnerQuantity > 0 ? formatEuro(totals.dinner) : `${formatEuro(30)} / ${en ? 'person' : 'pessoa'}`}</b>
              <div className="registration-quantity" role="group" aria-label={en ? 'Number of dinner tickets' : 'Número de bilhetes para o jantar'}>
                <button
                  type="button"
                  onClick={() => setDinnerQuantity((current) => Math.max(0, current - 1))}
                  disabled={dinnerQuantity === 0}
                  aria-label={en ? 'Remove one dinner ticket' : 'Remover um bilhete de jantar'}
                >−</button>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={dinnerQuantity}
                  onChange={(event) => setDinnerQuantity(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  aria-label={en ? 'Dinner ticket quantity' : 'Quantidade de bilhetes para o jantar'}
                />
                <button
                  type="button"
                  onClick={() => setDinnerQuantity((current) => current + 1)}
                  aria-label={en ? 'Add one dinner ticket' : 'Adicionar um bilhete de jantar'}
                >+</button>
              </div>
            </div>
          </section>
        </div>

        <aside className="registration-summary" aria-live="polite">
          <div className="registration-summary__rate">
            <span>{period === 'early' ? (en ? 'Early rate' : 'Tarifa antecipada') : (en ? 'Standard rate' : 'Tarifa regular')}</span>
            <strong>{period === 'early' ? (en ? 'Until 31 Jan 2027' : 'Até 31 jan. 2027') : (en ? 'From 1 Feb 2027' : 'Desde 1 fev. 2027')}</strong>
          </div>
          <p className="registration-summary__eyebrow">{en ? 'Your selection' : 'A sua seleção'}</p>
          <h2>{completeExperience ? (en ? 'Complete experience' : 'Experiência completa') : (en ? 'Registration summary' : 'Resumo da inscrição')}</h2>
          {profile && <p className="registration-summary__profile">{profileLabels[profile]}</p>}

          <ul>
            {totals.congress > 0 && (
              <SummaryLine
                label={congressMode === 'virtual' ? (en ? 'Virtual congress' : 'Congresso virtual') : 'CIRC 2027'}
                detail={congressMode === 'onsite' ? (en ? '9–10 April · In person' : '9–10 abril · Presencial') : (en ? '9–10 April · Online' : '9–10 abril · Online')}
                amount={totals.congress}
              />
            )}
            {morningCourse && <SummaryLine label={en ? 'Morning course' : 'Curso da manhã'} detail={en ? '8 April' : '8 abril'} amount={totals.courseUnit} />}
            {afternoonCourse && <SummaryLine label={en ? 'Afternoon course' : 'Curso da tarde'} detail={en ? '8 April' : '8 abril'} amount={totals.courseUnit} />}
            {totals.dinner > 0 && (
              <SummaryLine
                label={`${en ? 'Congress dinner' : 'Jantar do congresso'} × ${totals.dinnerQuantity}`}
                detail={`${formatEuro(30)} / ${en ? 'person' : 'pessoa'}`}
                amount={totals.dinner}
              />
            )}
          </ul>

          {!hasSelection && <p className="registration-summary__empty">{en ? 'Choose your participation options to calculate the total.' : 'Escolha as opções de participação para calcular o total.'}</p>}

          <div className="registration-summary__total">
            <span>{en ? 'Estimated total' : 'Total estimado'}</span>
            <strong>{formatEuro(totals.total)}</strong>
          </div>
          <small className="registration-summary__tax">{en ? 'Final price confirmed before payment.' : 'Preço final confirmado antes do pagamento.'}</small>

          {isAdmin ? (
            <div className="registration-summary__test-mode">
              <span>{en ? 'Administrator test mode' : 'Modo de teste administrativo'}</span>
              <small>{en ? 'Creates a test record. No payment will be requested.' : 'Cria um registo identificado como teste. Não será solicitado qualquer pagamento.'}</small>
              <button type="button" onClick={submitTestRegistration} disabled={!testSelectionReady || submissionState === 'saving'}>
                {submissionState === 'saving'
                  ? (en ? 'Saving test…' : 'A guardar teste…')
                  : (en ? 'Create test registration' : 'Criar inscrição de teste')}
              </button>
              {!testSelectionReady && <small className="registration-summary__test-hint">{en ? 'Complete the required choices above.' : 'Complete as escolhas obrigatórias acima.'}</small>}
              {submissionState === 'saved' && (
                <div className="registration-summary__success" role="status">
                  <strong>{en ? 'Test registration saved.' : 'Inscrição de teste guardada.'}</strong>
                  <Link to="/admin">{en ? 'View in admin panel' : 'Ver no painel de administração'} →</Link>
                </div>
              )}
              {submissionError && <p className="registration-summary__error" role="alert">{submissionError}</p>}
            </div>
          ) : (
            <button type="button" disabled>{en ? 'Registration opens 15 November' : 'Inscrições abrem a 15 de novembro'}</button>
          )}
          <Link to="/conta/perfil">{en ? 'Review profile details' : 'Rever dados do perfil'} <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </div>
  );
}

export default RegistrationBuilder;
