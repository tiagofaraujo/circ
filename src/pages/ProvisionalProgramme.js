import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import './ProvisionalProgramme.css';
import MriCourseDescription, { mriCourseTitle } from '../components/MriCourseDescription';
import StrokeCourseDescription, { strokeCourseTitle } from '../components/StrokeCourseDescription';

// Temporarily hide moderator credits while retaining programme data.
const SHOW_MODERATORS = true;

// Times and pending confirmations transcribed from the supplied provisional programme.
const days = [
  { day: '08', pt: 'Pré-Congresso', en: 'Pre-Congress', rows: [
    ['09:00–13:00', mriCourseTitle.pt, mriCourseTitle.en],
    ['14:00–18:00', strokeCourseTitle.pt, strokeCourseTitle.en],
  ] },
  { day: '09', pt: 'Congresso · Dia 1', en: 'Congress · Day 1', rows: [
    ['08:10', 'Check-in', 'Check-in'],
    ['08:50', 'Abertura da sala da Igreja', 'Church hall opens'],
    ['09:00', 'Boas-vindas', 'Welcome'],
    ['09:10', 'CIRC TALKS — Industry Edition: Beyond the Image — No Products. Just Ideas.', 'CIRC TALKS — Industry Edition: Beyond the Image — No Products. Just Ideas.'],
    ['10:00', 'Painel de Radiologia', 'Radiography panel', null, null, [
      ['10:00', 'Loop-X®: Imagem Intraoperatória 2D e 3D — Contributo no Bloco Operatório', 'Loop-X®: Intraoperative 2D and 3D Imaging — Contribution to the Operating Theatre', 'Rita Vaz (ULS Coimbra)'],
      ['10:20', 'Imagem 3D em trauma ortopédico: o papel do técnico de radiologia', '3D imaging in orthopaedic trauma: the role of the radiographer', 'A designar', 'Speaker to be announced'],
      ['10:40', 'The Art of Spine Radiography: Novel and Creative Techniques', 'The Art of Spine Radiography: Novel and Creative Techniques', 'Michael Fuller (Flinders Medical Centre)', 'Michael Fuller (Flinders Medical Centre)'],
    ], {pt: 'Joana Santos (ESTeSC - UPC) e Raquel Reis (ULS Santo António)', en: 'Joana Santos (ESTeSC - UPC) and Raquel Reis (ULS Santo António)'}],
    ['11:15', 'Abertura oficial do CIRC 2027', 'Official opening of CIRC 2027'],
    ['11:45', 'Visita guiada à Medical Radiology Exhibition', 'Guided tour of the Medical Radiology Exhibition'],
    ['12:15–14:00', 'Brunch', 'Brunch'],
    ['14:00–15:00', 'Painel de RM da ULS Coimbra', 'ULS Coimbra MRI panel', null, null, [
      ['14:00', 'RM Fetal', 'Fetal MRI', 'Rui Pedro Faria Pais e Paula Marques (ULS Coimbra)', 'Rui Pedro Faria Pais and Paula Marques (ULS Coimbra)'],
      ['14:20', 'Biópsia mamária guiada por RM', 'MRI-guided breast biopsy', 'Amélia Estêvão e Diana Carvalho (ULS Coimbra)', 'Amélia Estêvão and Diana Carvalho (ULS Coimbra)'],
      ['14:40', 'RM Pélvica', 'Pelvic MRI', 'Célia Antunes e Bruno Esteves (ULS Coimbra)', 'Célia Antunes and Bruno Esteves (ULS Coimbra)'],
    ], {pt: 'Sofia Brandão (CESPU)', en: 'Sofia Brandão (CESPU)'}],
    ['15:05–16:05', 'Painel Internacional de TC por Contagem de Fotões', 'International Photon-Counting CT panel', null, null, [
      ['', 'Fides R. Schwartz', 'Fides R. Schwartz'],
      ['', 'Giuseppe V. Toia', 'Giuseppe V. Toia'],
      ['', 'Kirsten Burke', 'Kirsten Burke', 'Biografia pendente', 'Biography pending'],
    ], {pt: 'Mário Monteiro (ESTeSC - UPC) e Ana Isabel Machado (ULS Coimbra)', en: 'Mário Monteiro (ESTeSC - UPC) and Ana Isabel Machado (ULS Coimbra)'}],
    ['16:15–17:00', 'Comunicações', 'Presentations'],
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
    ['15:05–16:10', 'Atualização em Proteção e Segurança em RM', 'Update on MRI Protection and Safety', null, null, [
      ['15:10–15:30', 'Toby Gilk', 'Toby Gilk'],
      ['15:30–15:50', 'Bill Faulkner', 'Bill Faulkner'],
      ['15:50–16:10', 'Kris Seitz', 'Kris Seitz'],
    ], {pt: 'Samuel Oliveira (CEO, Everything MRI) e Vitor Silva (ULS São João)', en: 'Samuel Oliveira (CEO, Everything MRI) and Vitor Silva (ULS São João)'}],
    ['16:20–16:50', 'Digital twinning in MRI', 'Digital twinning in MRI', 'Julien Greggio', null, null, {pt: 'Samuel Oliveira (CEO, Everything MRI) e Vitor Silva (ULS São João)', en: 'Samuel Oliveira (CEO, Everything MRI) and Vitor Silva (ULS São João)'}],
    ['17:00', 'Coffee break', 'Coffee break'],
    ['17:30–18:10', 'Quo Vadis Radiologia', 'Quo Vadis Radiologia', null, null, [
      ['17:30–17:50', 'Identidade e Futuro da Profissão: O Que Falta Construir', 'Identity and the Future of the Profession: What Still Needs to Be Built', 'Joana Madureira (ATARP)'],
      ['17:50–18:10', 'Comunicação e Ética na Radiologia', 'Communication and Ethics in Radiology'],
    ]],
  ] },
];

const speakerMatches = [
  ['Michael Fuller', 'michael-fuller'],
  ['Fides R. Schwartz', 'fides-schwartz'],
  ['Giuseppe V. Toia', 'giuseppe-toia'],
  ['Toby Gilk', 'tobias-gilk'],
  ['Bill Faulkner', 'bill-faulkner'],
  ['Kris Seitz', 'kris-seitz'],
  ['Julien Greggio', 'julien-greggio'],
];

function ProgrammeRow({ row, en, nested = false }) {
  const [time, pt, english, detail, detailEn, children, moderators] = row;
  const match = speakerMatches.find(([name]) => `${pt} ${detail || ''}`.includes(name));
  const speaker = match && speakers2027.find(person => person.id === match[1]);
  const titleIsSpeaker = speaker && pt.includes(match[0]);
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
      {!titleIsSpeaker && heading}
      {pt === mriCourseTitle.pt && <MriCourseDescription en={en} />}
      {pt === strokeCourseTitle.pt && <StrokeCourseDescription en={en} />}
      {speaker && <Link className="schedule-speaker" to={`/oradores/${speaker.id}`} aria-label={`${speaker.name} — ${en ? 'view biography' : 'ver biografia'}`}>
        <img src={`/speakers/${speaker.image}`} alt="" width="52" height="52" loading="lazy" />
        <span><strong>{titleIsSpeaker ? title : speaker.name}</strong><small>{en ? 'View biography' : 'Ver biografia'} <span aria-hidden="true">↗</span></small></span>
      </Link>}
      {detail && (!speaker || detail !== speaker.name) && <p>{en ? detailEn || detail : detail}</p>}
      {SHOW_MODERATORS && moderators && <p className="schedule-moderators"><strong>{en ? 'Moderation: ' : 'Moderação: '}</strong>{en ? moderators.en : moderators.pt}</p>}
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
  return <main className="page provisional-programme">
    <header className="schedule-hero">
      <p className="eyebrow">CIRC 2027 · Coimbra · 8–10 {en ? 'April' : 'de abril'}</p>
      <span className="schedule-status">{en ? 'Provisional' : 'Provisório'}</span>
      <h1>{en ? 'Scientific programme' : 'Programa científico'}</h1>
      <p className="schedule-lead">{en ? 'International perspectives, advances in medical imaging and practical learning. Explore the programme and meet the speakers at CIRC 2027.' : 'Perspetivas internacionais, inovação em imagem médica e formação prática. Explore o programa e conheça os oradores do CIRC 2027.'}</p>
      <p className="schedule-notice">{en ? 'Programme subject to change. Sessions marked “to be confirmed” are pending confirmation.' : 'Programa sujeito a alterações. As sessões assinaladas «a confirmar» aguardam confirmação.'}</p>
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
