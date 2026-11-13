import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import { moderators2027 } from '../data/moderators2027';
import './ProvisionalProgramme.css';
import MriCourseDescription, { mriCourseInstructor, mriCourseTitle } from '../components/MriCourseDescription';
import StrokeCourseDescription, { strokeCourseInstructor, strokeCourseTitle } from '../components/StrokeCourseDescription';

const profiles = new Map(speakers2027.map(speaker => [speaker.id, speaker]));

function ProgrammeSpeaker({ speaker, en }) {
  const profile = profiles.get(speaker.id);
  const name = speaker.name || profile?.name;
  if (!name) return null;
  const language = en ? 'en' : 'pt';
  const affiliation = speaker.affiliation?.[language] || (speaker.showInstitution && profile?.institution);
  const hasBiography = Boolean(profile?.[language]?.bio?.length);
  const nameParts = name.split(' ');
  const initials = profile?.initials || `${nameParts[0][0]}${nameParts.at(-1)[0]}`;
  const Card = hasBiography ? Link : 'div';
  const linkProps = hasBiography ? {
    to: `/oradores/${profile.id}`,
    'aria-label': `${name} — ${en ? 'view biography' : 'ver biografia'}`,
  } : {};

  return <li><Card className="schedule-speaker" {...linkProps}>
    {profile?.image
      ? <img src={`/speakers/${profile.image}`} alt="" width="52" height="52" loading="lazy" />
      : <span className="schedule-speaker__initials" aria-hidden="true">{initials}</span>}
    <span>
      <strong>{name}</strong>
      {affiliation && <small className="schedule-speaker__affiliation">{affiliation}</small>}
      {hasBiography && <small>{en ? 'View biography' : 'Ver biografia'} <span aria-hidden="true">↗</span></small>}
    </span>
  </Card></li>;
}

// Times and pending confirmations transcribed from the supplied provisional programme.
const days = [
  { day: '08', pt: 'Pré-Congresso', en: 'Pre-Congress', rows: [
    ['09:00–13:00', mriCourseTitle.pt, mriCourseTitle.en, { speakers: [mriCourseInstructor] }],
    ['14:00–18:00', strokeCourseTitle.pt, strokeCourseTitle.en, { speakers: [strokeCourseInstructor] }],
  ] },
  { day: '09', pt: 'Congresso · Dia 1', en: 'Congress · Day 1', rows: [
    ['08:10', 'Check-in', 'Check-in'],
    ['08:50', 'Abertura da sala da Igreja', 'Church hall opens'],
    ['09:00', 'Boas-vindas', 'Welcome'],
    ['09:10', 'CIRC TALKS — Industry Edition: Beyond the Image — No Products. Just Ideas.', 'CIRC TALKS — Industry Edition: Beyond the Image — No Products. Just Ideas.'],
    ['10:00', 'Painel de Radiologia', 'Radiography panel', { moderators: ['joana-santos', 'raquel-reis'], children: [
      ['10:00', 'Loop-X®: Imagem Intraoperatória 2D e 3D — Contributo no Bloco Operatório', 'Loop-X®: Intraoperative 2D and 3D Imaging — Contribution to the Operating Theatre', { speakers: [{ id: 'ana-rita-vaz', showInstitution: true }] }],
      ['10:20', 'Imagem 3D em trauma ortopédico: o papel do técnico de radiologia', '3D imaging in orthopaedic trauma: the role of the radiographer', { speakers: [
        { id: 'filipa-martins' }, { name: 'Diana Santos' }, { id: 'adriana-marques' }, { id: 'marcia-amaral' },
      ] }],
      ['10:40', 'The Art of Spine Radiography: Novel and Creative Techniques', 'The Art of Spine Radiography: Novel and Creative Techniques', { speakers: [{ id: 'michael-fuller', showInstitution: true }] }],
    ] }],
    ['11:15', 'Abertura oficial do CIRC 2027', 'Official opening of CIRC 2027'],
    ['11:45', 'Visita guiada à Medical Radiology Exhibition', 'Guided tour of the Medical Radiology Exhibition'],
    ['12:15–14:00', 'Brunch', 'Brunch'],
    ['14:00–15:00', 'Painel de RM da ULS Coimbra', 'ULS Coimbra MRI panel', { moderators: ['sofia-brandao'], children: [
      ['14:00', 'RM Fetal', 'Fetal MRI', { speakers: [{ id: 'rui-pedro-faria-pais' }, { id: 'paula-marques' }] }],
      ['14:20', 'Biópsia mamária guiada por RM', 'MRI-guided breast biopsy', { speakers: [{ id: 'amelia-estevao' }, { id: 'diana-carvalho' }] }],
      ['14:40', 'RM Pélvica', 'Pelvic MRI', { speakers: [{ id: 'celia-antunes' }, { id: 'bruno-esteves' }] }],
    ] }],
    ['15:05–16:05', 'Painel Internacional de TC por Contagem de Fotões', 'International Photon-Counting CT panel', { moderators: ['mario-monteiro', 'ana-isabel-machado'], children: [
      ['', null, null, { speakers: [{ id: 'fides-schwartz', name: 'Fides R. Schwartz' }] }],
      ['', null, null, { speakers: [{ id: 'giuseppe-toia' }] }],
      ['', null, null, { speakers: [{ name: 'Kirsten Burke' }], detail: { pt: 'Biografia pendente', en: 'Biography pending' } }],
    ] }],
    ['16:15–17:00', 'Painel de Mamografia — Inteligência Artificial, Intervenção e Diagnóstico Avançado', 'Mammography panel — Artificial intelligence, intervention and advanced diagnosis', { children: [
      ['16:15–16:25', 'IA na Mamografia — Da Investigação à Prática Clínica', 'AI in mammography — From research to clinical practice', { detail: { pt: 'Fundação Champalimaud (a confirmar)', en: 'Champalimaud Foundation (to be confirmed)' } }],
      ['16:25–16:45', 'Estereotaxia Mamária — Da Técnica Convencional à Biópsia Guiada por Tomossíntese', 'Breast stereotaxis — From conventional technique to tomosynthesis-guided biopsy', { speakers: [
        { id: 'sandra-rodrigues', showInstitution: true }, { name: 'Francisca Raimundo', affiliation: { pt: 'ULS Coimbra', en: 'ULS Coimbra' } }, { id: 'filipa-oliveira', showInstitution: true },
      ] }],
      ['16:45–16:55', 'Mamografia com Contraste — Novas Perspetivas no Diagnóstico Mamário', 'Contrast-enhanced mammography — New perspectives in breast diagnosis', { speakers: [{ id: 'rita-batista', showInstitution: true }] }],
    ] }],
    ['17:00–17:45', 'Coffee break', 'Coffee break'],
    ['17:45–18:30', 'Comunicações', 'Presentations'],
    ['18:30–19:00', 'Momento cultural e de animação', 'Cultural programme and entertainment'],
    ['20:00', 'Jantar de convívio', 'Congress dinner'],
  ] },
  { day: '10', pt: 'Congresso · Dia 2', en: 'Congress · Day 2', rows: [
    ['09:15–10:00', 'Brunch', 'Brunch'],
    ['10:00–12:00', 'Comunicações Livres', 'Oral communications'],
    ['12:00–13:00', 'Painel ainda a designar', 'Panel to be announced'],
    ['13:05–14:00', 'Almoço', 'Lunch'],
    ['14:00–15:00', 'Radiologia de Intervenção / Mamografia', 'Interventional Radiology / Mammography'],
    ['15:05–16:10', 'Atualização em Proteção e Segurança em RM', 'Update on MRI Protection and Safety', { moderators: ['samuel-oliveira', 'vitor-silva'], children: [
      ['15:10–15:30', null, null, { speakers: [{ id: 'tobias-gilk' }] }],
      ['15:30–15:50', null, null, { speakers: [{ id: 'bill-faulkner' }] }],
      ['15:50–16:10', null, null, { speakers: [{ id: 'kris-seitz' }] }],
    ] }],
    ['16:20–16:50', 'Digital twinning in MRI', 'Digital twinning in MRI', { speakers: [{ id: 'julien-greggio' }], moderators: ['samuel-oliveira', 'vitor-silva'] }],
    ['17:00', 'Coffee break', 'Coffee break'],
    ['17:30–18:10', 'Quo Vadis Radiologia', 'Quo Vadis Radiologia', { children: [
      ['17:30–17:50', 'Identidade e Futuro da Profissão: O Que Falta Construir', 'Identity and the Future of the Profession: What Still Needs to Be Built', { speakers: [{ id: 'joana-madureira', name: 'Joana Madureira', showInstitution: true }] }],
      ['17:50–18:10', 'Comunicação e Ética na Radiologia', 'Communication and Ethics in Radiology'],
    ] }],
  ] },
];

function ProgrammeRow({ row, en, nested = false }) {
  const [time, pt, english, { speakers, detail, children, moderators } = {}] = row;
  const practical = /^(Check-in|Abertura da sala|Boas-vindas|Brunch|Almoço|Coffee break|Visita guiada|Momento cultural|Jantar de convívio)/.test(pt);
  const title = en ? english : pt;
  const heading = pt === 'Quo Vadis Radiologia'
    ? (nested
      ? <h4 className="schedule-title--quo-vadis"><span className="schedule-title--quo-vadis-italic">Quo Vadis</span> Radiologia</h4>
      : <h3 className="schedule-title--quo-vadis"><span className="schedule-title--quo-vadis-italic">Quo Vadis</span> Radiologia</h3>)
    : (nested ? <h4>{title}</h4> : <h3>{title}</h3>);
  return <li className={`schedule-row${nested ? ' schedule-row--nested' : ''}${practical ? ' schedule-row--practical' : ''}`}>
    {time && <span className="schedule-time">{time}</span>}
    <div className="schedule-content">
      {title && heading}
      {speakers && <ul className="schedule-speakers" aria-label={en ? 'Speakers' : 'Oradores'}>
        {speakers.map(speaker => <ProgrammeSpeaker key={speaker.id || speaker.name} speaker={speaker} en={en} />)}
      </ul>}
      {pt === mriCourseTitle.pt && <MriCourseDescription en={en} showInstructor={false} />}
      {pt === strokeCourseTitle.pt && <StrokeCourseDescription en={en} showInstructor={false} />}
      {detail && <p>{detail[en ? 'en' : 'pt']}</p>}
      {moderators && <p className="schedule-moderators"><strong>{en ? 'Moderation: ' : 'Moderação: '}</strong>
        {moderators.map(id => {
          const { name, institution } = moderators2027[id];
          return `${name} (${institution})`;
        }).join(en ? ' and ' : ' e ')}
      </p>}
      {children && <details className="schedule-panel" open><summary>{en ? 'Panel presentations' : 'Intervenções do painel'} <span>{children.length}</span></summary><ol className="schedule-sublist">{children.map((child, i) => <ProgrammeRow key={i} row={child} en={en} nested />)}</ol></details>}
    </div>
  </li>;
}

function dayFromHash() {
  const id = window.location.hash.replace('#dia-', '');
  return days.some(day => day.day === id) ? id : '08';
}

export default function ProvisionalProgramme() {
  const { language } = useLanguage();
  const en = language === 'en';
  const { hash } = useLocation();
  const [selectedDay, setSelectedDay] = useState(dayFromHash);
  useEffect(() => {
    const sync = () => setSelectedDay(dayFromHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  const chooseDay = (day) => {
    setSelectedDay(day);
    window.history.replaceState(window.history.state, '', `#dia-${day}`);
  };
  if (hash === '#moderadores') return <Navigate to="/oradores#moderadores" replace />;
  return <main className="page provisional-programme">
    <header className="schedule-hero">
      <p className="eyebrow">CIRC 2027 · Coimbra · 8–10 {en ? 'April' : 'de abril'}</p>
      <span className="schedule-status">{en ? 'Provisional' : 'Provisório'}</span>
      <h1>{en ? 'Scientific programme' : 'Programa científico'}</h1>
      <p className="schedule-lead">{en ? 'International perspectives, advances in medical imaging and practical learning. Explore the programme and meet the speakers at CIRC 2027.' : 'Perspetivas internacionais, inovação em imagem médica e formação prática. Explore o programa e conheça os oradores do CIRC 2027.'}</p>
      <p className="schedule-notice">{en ? 'Programme subject to change. Sessions marked “to be confirmed” are pending confirmation.' : 'Programa sujeito a alterações. As sessões assinaladas «a confirmar» aguardam confirmação.'}</p>
      <Link className="text-link schedule-moderators-link" to="/oradores#moderadores">{en ? 'Meet the moderators' : 'Conhecer os moderadores'} <span aria-hidden="true">→</span></Link>
    </header>
    <nav className="schedule-nav" aria-label={en ? 'Choose programme day' : 'Escolher dia do programa'}>{days.map(day => <button type="button" key={day.day} aria-pressed={selectedDay === day.day} aria-controls={`dia-${day.day}`} onClick={() => chooseDay(day.day)}><strong>{day.day} <small>{en ? 'APR' : 'ABR'}</small></strong><span>{day.day === '08' ? (en ? 'Pre-Congress' : 'Pré-Congresso') : (en ? `Day ${day.day === '09' ? '1' : '2'}` : `Dia ${day.day === '09' ? '1' : '2'}`)}</span></button>)}</nav>
    {days.map(day => <section hidden={selectedDay !== day.day} className="schedule-day" id={`dia-${day.day}`} key={day.day} aria-labelledby={`title-${day.day}`}>
      <header className="schedule-day-heading"><div><p className="eyebrow">{day.day} {en ? 'April 2027' : 'de abril de 2027'}</p><h2 id={`title-${day.day}`}>{en ? day.en : day.pt}</h2></div><span>{day.rows.length} {en ? 'sessions' : 'sessões'}</span></header>
      {day.day === '08' && <p className="schedule-day-note">{en ? 'The morning and afternoon courses have separate registrations.' : 'Os cursos da manhã e da tarde têm inscrições autónomas.'}</p>}
      <ol className="schedule-list">{day.rows.map((row, i) => <ProgrammeRow key={i} row={row} en={en} />)}</ol>
    </section>)}
    <div className="schedule-footer"><Link className="button button--outline" to="/oradores">{en ? 'Meet all speakers' : 'Conhecer todos os oradores'}</Link><Link className="button button--dark" to="/participar">{en ? 'Registration information' : 'Informações sobre inscrições'}</Link></div>
  </main>;
}
