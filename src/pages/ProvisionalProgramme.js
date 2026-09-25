import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './ProvisionalProgramme.css';

// Times and pending confirmations transcribed from the supplied provisional programme.
const days = [
  { day: '08', pt: 'Pré-Congresso', en: 'Pre-Congress', rows: [
    ['09:00–13:00', 'Pós-processamento em RM', 'MRI post-processing', 'Daniel Leitão (Siemens)'],
    ['14:00–18:00', 'Via Verde AVC', 'Stroke fast-track pathway'],
  ] },
  { day: '09', pt: 'Congresso · Dia 1', en: 'Congress · Day 1', rows: [
    ['08:10', 'Check-in', 'Check-in'],
    ['08:50', 'Abertura da sala da Igreja', 'Church hall opens'],
    ['09:00', 'Boas-vindas', 'Welcome'],
    ['09:15', 'Imagem Médica e o Futuro', 'Medical Imaging and the Future'],
    ['10:00', 'Intensificador de imagem e o contributo de imagens em 3D no Bloco Operatório', 'Image intensifier and the contribution of 3D imaging in the operating theatre', 'Técnica Rita Vaz'],
    ['10:20', 'Radiografias em 3D em situação de trauma', '3D radiographs in trauma', 'Técnico a designar', 'Speaker to be announced'],
    ['10:40', 'Technique Breathing', 'Technique Breathing', 'Michael Fuller (Austrália) · por videoconferência', 'Michael Fuller (Australia) · via videoconference'],
    ['11:15', 'Abertura oficial do CIRC 2027', 'Official opening of CIRC 2027'],
    ['11:45', 'Visita guiada à Medical Radiology Exhibition', 'Guided tour of the Medical Radiology Exhibition'],
    ['12:15–14:00', 'Brunch', 'Brunch'],
    ['14:00–15:00', 'Painel de RM', 'MRI panel', null, null, [
      ['14:00', 'RM Fetal · a confirmar', 'Fetal MRI · to be confirmed', 'Dr. Rui Pedro Faria Pais + Técnica Paula Marques'],
      ['14:20', 'RM em Biópsia Mamária', 'MRI in breast biopsy', 'Dra. Amélia Estêvão + Técnica Diana Carvalho'],
      ['14:40', 'RM Pélvica · a confirmar', 'Pelvic MRI · to be confirmed', 'Dra. Célia Antunes + Técnico Bruno Esteves'],
    ]],
    ['15:05–16:05', 'Painel Internacional de TC por Contagem de Fotões (online)', 'International Photon-Counting CT panel (online)', null, null, [
      ['', 'Fides R. Schwartz, MD', 'Fides R. Schwartz, MD', 'Investigadora Principal, Center for Advanced CT Translation and Innovation (CACTI), Brigham and Women’s Hospital. Professora Assistente na Harvard Medical School.', 'Principal Investigator, Center for Advanced CT Translation and Innovation (CACTI), Brigham and Women’s Hospital. Assistant Professor at Harvard Medical School.'],
      ['', 'Giuseppe V. Toia, MD, MS', 'Giuseppe V. Toia, MD, MS', 'Professor Associado (CHS), Radiologia e Física Médica. Chefe de Imagem e Intervenção Abdominal e Chefe da Modalidade de Tomografia Computorizada. Escola de Medicina e Saúde Pública da Universidade de Wisconsin.', 'Associate Professor (CHS), Radiology and Medical Physics. Chief of Abdominal Imaging and Intervention and CT Modality Chief. University of Wisconsin School of Medicine and Public Health.'],
    ]],
  ] },
  { day: '10', pt: 'Congresso · Dia 2', en: 'Congress · Day 2', rows: [
    ['09:15–10:00', 'Brunch', 'Brunch'],
    ['10:00–12:00', 'Comunicações Livres', 'Oral communications'],
    ['12:00–13:00', 'Painel ainda a designar', 'Panel to be announced'],
    ['13:05–14:00', 'Almoço', 'Lunch'],
    ['14:00–15:00', 'Radiologia de Intervenção / Mamografia', 'Interventional Radiology / Mammography'],
    ['15:05–16:05', 'Painel de RM', 'MRI panel', null, null, [
      ['15:10–15:30', 'Tobias Gilk', 'Tobias Gilk'],
      ['15:30–15:50', 'F. Faulkner', 'F. Faulkner'],
      ['16:00–16:20', 'Kirsten (confirmada)', 'Kirsten (confirmed)'],
    ]],
    ['16:10–16:40', 'Digital twinning in MRI', 'Digital twinning in MRI', 'Julien Greggio'],
  ] },
];

function ProgrammeRow({ row, en, nested = false }) {
  const [time, pt, english, detail, detailEn, children] = row;
  return <li className={`schedule-row${nested ? ' schedule-row--nested' : ''}`}>
    <span className="schedule-time">{time}</span>
    <div className="schedule-content">
      {nested ? <h4>{en ? english : pt}</h4> : <h3>{en ? english : pt}</h3>}
      {detail && <p>{en ? detailEn || detail : detail}</p>}
      {children && <ol className="schedule-sublist">{children.map((child, i) => <ProgrammeRow key={i} row={child} en={en} nested />)}</ol>}
    </div>
  </li>;
}

export default function ProvisionalProgramme() {
  const { language } = useLanguage();
  const en = language === 'en';
  return <main className="page provisional-programme">
    <header className="schedule-hero">
      <p className="eyebrow">CIRC 2027 · Coimbra</p>
      <h1>{en ? 'Provisional programme' : 'Programa provisório'}</h1>
      <p className="schedule-lead">{en ? '8–10 April 2027 · Three days of training, science and exchange in medical imaging.' : '8–10 abril 2027 · Três dias de formação, ciência e partilha em Imagem Médica.'}</p>
      <p className="schedule-notice">{en ? 'Programme subject to change. Sessions marked “to be confirmed” are pending confirmation.' : 'Programa sujeito a alterações. As sessões assinaladas «a confirmar» aguardam confirmação.'}</p>
    </header>
    <nav className="schedule-nav" aria-label={en ? 'Programme days' : 'Dias do programa'}>{days.map(day => <a key={day.day} href={`#dia-${day.day}`}><strong>{day.day} {en ? 'APR' : 'ABR'}</strong><span>{en ? day.en : day.pt}</span><span aria-hidden="true">↓</span></a>)}</nav>
    {days.map(day => <section className="schedule-day" id={`dia-${day.day}`} key={day.day} aria-labelledby={`title-${day.day}`}>
      <header className="schedule-day-heading"><span>{day.day}</span><div><p className="eyebrow">{en ? 'April 2027' : 'Abril 2027'}</p><h2 id={`title-${day.day}`}>{en ? day.en : day.pt}</h2></div></header>
      {day.day === '08' && <p className="schedule-day-note">{en ? 'The morning and afternoon courses have separate registrations.' : 'Os cursos da manhã e da tarde têm inscrições autónomas.'}</p>}
      <ol className="schedule-list">{day.rows.map((row, i) => <ProgrammeRow key={i} row={row} en={en} />)}</ol>
      {day.day === '10' && <p className="schedule-day-note">{en ? 'The afternoon MRI session times are being reviewed due to an overlap in this provisional version.' : 'Os horários das sessões de RM da tarde estão em revisão devido a uma sobreposição nesta versão provisória.'}</p>}
    </section>)}
    <div className="schedule-footer"><Link className="button button--outline" to="/oradores">{en ? 'Meet the speakers' : 'Conhecer os oradores'}</Link><Link className="button button--dark" to="/participar">{en ? 'Registration information' : 'Informações de inscrição'}</Link></div>
  </main>;
}
