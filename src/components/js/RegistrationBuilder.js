import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const en = language === 'en';
  const [profile, setProfile] = useState('');
  const [courseAffiliation, setCourseAffiliation] = useState('');
  const [congressMode, setCongressMode] = useState('');
  const [morningCourse, setMorningCourse] = useState(false);
  const [afternoonCourse, setAfternoonCourse] = useState(false);
  const [dinner, setDinner] = useState(false);
  const period = getRegistrationPeriod();

  useEffect(() => {
    if (congressMode !== 'onsite') setDinner(false);
  }, [congressMode]);

  useEffect(() => {
    if (profile === 'uls') setCourseAffiliation('uls');
    else if (profile === 'external') setCourseAffiliation('external');
    else setCourseAffiliation('');
  }, [profile]);

  const totals = useMemo(() => calculateRegistrationTotal({
    profile,
    courseAffiliation,
    congressMode,
    morningCourse,
    afternoonCourse,
    dinner,
    period,
  }), [afternoonCourse, congressMode, courseAffiliation, dinner, morningCourse, period, profile]);

  const profileLabels = {
    uls: en ? 'ULS Coimbra delegate' : 'Congressista ULS Coimbra',
    external: en ? 'External delegate' : 'Congressista externo',
    student: en ? 'IMR student' : 'Estudante IMR',
  };
  const hasSelection = Boolean(congressMode || morningCourse || afternoonCourse);
  const completeExperience = congressMode === 'onsite' && morningCourse && afternoonCourse;
  const coursesReady = Boolean(profile && courseAffiliation);

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
            <div className="registration-choice-grid registration-choice-grid--three">
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
            </div>
          </section>

          <section className={`registration-step${!coursesReady ? ' is-locked' : ''}`} aria-labelledby="registration-courses-title">
            <div className="registration-step__heading">
              <span>03</span>
              <div>
                <p>{en ? '8 April · Optional' : '8 abril · Opcional'}</p>
                <h2 id="registration-courses-title">{en ? 'Add one or both courses' : 'Acrescente um ou os dois cursos'}</h2>
              </div>
            </div>
            {profile === 'student' && (
              <div className="registration-course-affiliation">
                <div>
                  <strong>{en ? 'Course rate' : 'Tarifa dos cursos'}</strong>
                  <p>{en ? 'Choose the institutional link that applies to the Pre-Congress Courses.' : 'Indique a ligação institucional aplicável aos Cursos Pré-Congresso.'}</p>
                </div>
                <div className="registration-course-affiliation__options">
                  <button
                    type="button"
                    className={courseAffiliation === 'uls' ? 'is-selected' : ''}
                    aria-pressed={courseAffiliation === 'uls'}
                    onClick={() => setCourseAffiliation('uls')}
                  >
                    <span>ULS Coimbra</span>
                    <b>{formatEuro(20)}</b>
                  </button>
                  <button
                    type="button"
                    className={courseAffiliation === 'external' ? 'is-selected' : ''}
                    aria-pressed={courseAffiliation === 'external'}
                    onClick={() => setCourseAffiliation('external')}
                  >
                    <span>{en ? 'Other institution' : 'Outra instituição'}</span>
                    <b>{formatEuro(35)}</b>
                  </button>
                </div>
              </div>
            )}
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
          </section>

          <section className={`registration-step registration-step--compact${congressMode !== 'onsite' ? ' is-locked' : ''}`} aria-labelledby="registration-dinner-title">
            <div className="registration-step__heading">
              <span>04</span>
              <div>
                <p>{en ? 'Social programme · Optional' : 'Programa social · Opcional'}</p>
                <h2 id="registration-dinner-title">{en ? 'Congress dinner' : 'Jantar do congresso'}</h2>
              </div>
            </div>
            <label className={`registration-dinner${dinner ? ' is-selected' : ''}${congressMode !== 'onsite' ? ' is-disabled' : ''}`}>
              <input type="checkbox" checked={dinner} disabled={congressMode !== 'onsite'} onChange={(event) => setDinner(event.target.checked)} />
              <span><strong>{en ? 'Add dinner' : 'Adicionar jantar'}</strong><small>{en ? 'Available with in-person congress registration.' : 'Disponível com a inscrição presencial no congresso.'}</small></span>
              <b>+ {formatEuro(30)}</b>
              <i aria-hidden="true" />
            </label>
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
            {totals.dinner > 0 && <SummaryLine label={en ? 'Congress dinner' : 'Jantar do congresso'} amount={totals.dinner} />}
          </ul>

          {!hasSelection && <p className="registration-summary__empty">{en ? 'Choose your participation options to calculate the total.' : 'Escolha as opções de participação para calcular o total.'}</p>}

          <div className="registration-summary__total">
            <span>{en ? 'Estimated total' : 'Total estimado'}</span>
            <strong>{formatEuro(totals.total)}</strong>
          </div>
          <small className="registration-summary__tax">{en ? 'Final price confirmed before payment.' : 'Preço final confirmado antes do pagamento.'}</small>

          <button type="button" disabled>{en ? 'Registration opens 15 November' : 'Inscrições abrem a 15 de novembro'}</button>
          <Link to="/conta/perfil">{en ? 'Review profile details' : 'Rever dados do perfil'} <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </div>
  );
}

export default RegistrationBuilder;
