import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import { moderators2027 } from '../data/moderators2027';
import './ProvisionalProgramme.css';
import { flushSync } from 'react-dom';
import PortraitImage from '../components/PortraitImage';
import { matchesSearch, programmeSearchText, readPreference, savePreference, sessionId } from '../utils/discovery';
import { downloadCalendar } from '../utils/programmeCalendar';
import '../discovery.css';
import MriCourseDescription, { mriCourseInstructor, mriCourseTitle } from '../components/MriCourseDescription';
import StrokeCourseDescription, { strokeCourseInstructor, strokeCourseTitle } from '../components/StrokeCourseDescription';

const profiles = new Map(speakers2027.map(speaker => [speaker.id, speaker]));

function ProgrammeSpeaker({ speaker, en, day }) {
  const { pathname } = useLocation();
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
    state: { programmeReturn: `${pathname === '/conta/programa' ? pathname : '/programa'}#dia-${day}` },
    'aria-label': `${name} — ${en ? 'view biography' : 'ver biografia'}`,
  } : {};

  return <li><Card className="schedule-speaker" {...linkProps}>
    <PortraitImage image={profile?.image} name={name} initials={initials} compact />
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
        { id: 'filipa-martins' }, { id: 'diana-santos' }, { id: 'adriana-marques' }, { id: 'marcia-amaral' },
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
      ['', null, null, { speakers: [{ id: 'kristen-burke', showInstitution: true }] }],
    ] }],
    ['16:15–17:00', 'Painel de Mamografia — Inteligência Artificial, Intervenção e Diagnóstico Avançado', 'Mammography panel — Artificial intelligence, intervention and advanced diagnosis', { children: [
      ['16:15–16:25', 'IA na Mamografia — Da Investigação à Prática Clínica', 'AI in mammography — From research to clinical practice', { speakers: [{ id: 'rita-santiago', affiliation: { pt: 'Fundação Champalimaud', en: 'Champalimaud Foundation' } }] }],
      ['16:25–16:45', 'Estereotaxia Mamária — Da Técnica Convencional à Biópsia Guiada por Tomossíntese', 'Breast stereotaxis — From conventional technique to tomosynthesis-guided biopsy', { speakers: [
        { id: 'sandra-rodrigues', showInstitution: true }, { id: 'francisca-rodrigues', showInstitution: true }, { id: 'filipa-oliveira', showInstitution: true },
      ] }],
      ['16:45–16:55', 'Mamografia com Contraste — Novas Perspetivas no Diagnóstico Mamário', 'Contrast-enhanced mammography — New perspectives in breast diagnosis', { speakers: [{ id: 'rita-baptista', showInstitution: true }] }],
    ] }],
    ['17:00–17:45', 'Coffee break', 'Coffee break'],
    ['17:45–18:30', 'Radiologia de Intervenção', 'Interventional Radiology'],
    ['18:30–19:00', 'Momento cultural e de animação', 'Cultural programme and entertainment'],
    ['20:00', 'Jantar de convívio', 'Congress dinner'],
  ] },
  { day: '10', pt: 'Congresso · Dia 2', en: 'Congress · Day 2', rows: [
    ['09:15–10:00', 'Brunch', 'Brunch'],
    ['10:00–12:00', 'Comunicações Livres', 'Oral communications'],
    ['12:00–13:00', 'Moldando um futuro sustentável para a Radiologia', 'Shaping a sustainable future for Radiology', { moderators: ['luis-semedo'], speakers: [
      { id: 'andrea-rockall' }, { id: 'rui-lopes', showInstitution: true },
    ] }],
    ['13:05–14:00', 'Almoço', 'Lunch'],
    ['14:15–15:00', 'Inteligência Artificial em Radiologia', 'Artificial Intelligence in Radiology', { moderators: ['nuno-pereira-da-silva'] }],
    ['15:05–16:10', 'Atualização em Proteção e Segurança em RM', 'Update on MRI Protection and Safety', { moderators: ['samuel-oliveira', 'julien-greggio'], children: [
      ['15:10–15:30', null, null, { speakers: [{ id: 'tobias-gilk' }] }],
      ['15:30–15:50', null, null, { speakers: [{ id: 'bill-faulkner' }] }],
      ['15:50–16:10', null, null, { speakers: [{ id: 'kris-seitz' }] }],
    ] }],
    ['16:20–16:50', 'Digital twinning in MRI', 'Digital twinning in MRI', { speakers: [{ id: 'julien-greggio' }], moderators: ['ricardo-grunho', 'paula-marques'] }],
    ['17:00', 'Coffee break', 'Coffee break'],
    ['17:30–18:10', 'Quo Vadis Radiologia', 'Quo Vadis Radiologia', { children: [
      ['17:30–17:50', 'Identidade e Futuro da Profissão: O Que Falta Construir', 'Identity and the Future of the Profession: What Still Needs to Be Built', { speakers: [{ id: 'joana-madureira', name: 'Joana Madureira', showInstitution: true }] }],
      ['17:50–18:10', 'Comunicação e Ética na Radiologia', 'Communication and Ethics in Radiology', { speakers: [{ id: 'graciano-paulo', affiliation: { pt: 'Presidente da ESTeSC', en: 'President of ESTeSC' } }] }],
    ] }],
    ['18:20', 'Entrega de Prémios', 'Awards Ceremony'],
    ['18:30', 'Sessão de Encerramento', 'Closing Ceremony'],
  ] },
];

function ProgrammeRow({ row, en, day, nested = false, favourite = false, onFavourite, panelCommand, printing }) {
  const { pathname } = useLocation();
  const panel = useRef(null);
  useEffect(() => { if (panel.current) panel.current.open = printing || panelCommand.open; }, [panelCommand, printing]);
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
        {speakers.map(speaker => <ProgrammeSpeaker key={speaker.id || speaker.name} speaker={speaker} en={en} day={day} />)}
      </ul>}
      {pt === mriCourseTitle.pt && <MriCourseDescription en={en} showInstructor={false} />}
      {pt === strokeCourseTitle.pt && <StrokeCourseDescription en={en} showInstructor={false} />}
      {detail && <p>{detail[en ? 'en' : 'pt']}</p>}
      {moderators && <p className="schedule-moderators"><strong>{en ? 'Moderation: ' : 'Moderação: '}</strong>
        {moderators.map((id, index) => {
          const item = moderators2027[id];
          const profile = profiles.get(item.speakerId) || item;
          const label = item.institution ? `${item.name} (${item.institution})` : item.name;
          return <React.Fragment key={id}>{index > 0 && (en ? ' and ' : ' e ')}
            {profile[en ? 'en' : 'pt']?.bio?.length
              ? <Link to={`/oradores/${profile.id || id}`} state={{ fromModerators: true, programmeReturn: `${pathname === '/conta/programa' ? pathname : '/programa'}#dia-${day}` }}>{label}</Link>
              : label}
          </React.Fragment>;
        })}
      </p>}
      {children && <details ref={panel} className="schedule-panel" open><summary>{en ? 'Panel presentations' : 'Intervenções do painel'} <span>{children.length}</span></summary><ol className="schedule-sublist">{children.map((child, i) => <ProgrammeRow key={i} row={child} en={en} day={day} nested panelCommand={panelCommand} printing={printing} />)}</ol></details>}
    </div>
    {!nested && <button type="button" className="schedule-favourite" aria-pressed={favourite}
      aria-label={`${favourite ? (en ? 'Remove from favourites' : 'Remover dos favoritos') : (en ? 'Add to favourites' : 'Adicionar aos favoritos')}: ${en ? english : pt}`}
      onClick={onFavourite}><span aria-hidden="true">{favourite ? '★' : '☆'}</span></button>}
  </li>;
}

function dayFromHash() {
  const id = window.location.hash.replace('#dia-', '');
  return days.some(day => day.day === id) ? id : '08';
}

export default function ProvisionalProgramme() {
  const { language } = useLanguage();
  const en = language === 'en';
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [favourites, setFavourites] = useState(() => {
    try {
      const value = JSON.parse(readPreference('circ-programme-favourites-2027', '[]'));
      return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
    } catch { return []; }
  });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [panelCommand, setPanelCommand] = useState({ open: true });
  const [printing, setPrinting] = useState(false);
  const [exportError, setExportError] = useState('');
  const toggleFavourite = id => {
    const next = favourites.includes(id) ? favourites.filter(value => value !== id) : [...favourites, id];
    setFavourites(next);
    setStorageAvailable(savePreference('circ-programme-favourites-2027', JSON.stringify(next)));
  };
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  const [selectedDay, setSelectedDay] = useState(() => /^#dia-(08|09|10)$/.test(hash) ? hash.slice(-2) : dayFromHash());
  useEffect(() => { if (/^#dia-(08|09|10)$/.test(hash)) setSelectedDay(hash.slice(-2)); }, [hash]);
  const visibleRows = day => printing ? day.rows : day.rows.filter(row => matchesSearch(programmeSearchText(row, profiles, moderators2027), query)
    && (!onlyFavourites || favourites.includes(sessionId(day.day, row))));
  const activeDay = days.find(day => day.day === selectedDay);
  const selectedRows = visibleRows(activeDay);
  const resetFilters = () => { setQuery(''); setOnlyFavourites(false); };
  const exportDay = () => {
    try { downloadCalendar(selectedDay, selectedRows, en); setExportError(''); }
    catch { setExportError(en ? 'Could not download the calendar. Please try again.' : 'Não foi possível descarregar o calendário. Tente novamente.'); }
  };
  const changeDayWithKeyboard = event => {
    const index = days.findIndex(day => day.day === selectedDay);
    const target = { ArrowRight: (index + 1) % 3, ArrowLeft: (index + 2) % 3, Home: 0, End: 2 }[event.key];
    if (target === undefined) return;
    event.preventDefault(); chooseDay(days[target].day);
    event.currentTarget.parentElement.querySelectorAll('button')[target]?.focus();
  };
  useEffect(() => {
    const sync = () => setSelectedDay(dayFromHash());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  const chooseDay = (day) => {
    setSelectedDay(day);
    navigate({ pathname, search, hash: `#dia-${day}` }, { replace: true });
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
    <nav className="schedule-nav" aria-label={en ? 'Choose programme day' : 'Escolher dia do programa'}>{days.map(day => <button type="button" key={day.day} aria-pressed={selectedDay === day.day} aria-controls={`dia-${day.day}`} onClick={() => chooseDay(day.day)} onKeyDown={changeDayWithKeyboard}><strong>{day.day} <small>{en ? 'APR' : 'ABR'}</small></strong><span>{day.day === '08' ? (en ? 'Pre-Congress' : 'Pré-Congresso') : (en ? `Day ${day.day === '09' ? '1' : '2'}` : `Dia ${day.day === '09' ? '1' : '2'}`)}</span></button>)}</nav>
    <div className="discovery-controls schedule-tools">
      <label htmlFor="programme-search">{en ? 'Search this day' : 'Pesquisar neste dia'}
        <input id="programme-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPanelCommand({ open: true }); }} placeholder={en ? 'Topic, speaker or institution' : 'Tema, orador ou instituição'} />
      </label>
      <label className="discovery-check"><input type="checkbox" checked={onlyFavourites} onChange={event => setOnlyFavourites(event.target.checked)} />{en ? 'My favourites' : 'Os meus favoritos'}</label>
      <div className="discovery-actions">
        {(query || onlyFavourites) && <button type="button" onClick={resetFilters}>{en ? 'Clear filters' : 'Limpar filtros'}</button>}
        <button type="button" onClick={() => setPanelCommand({ open: true })}>{en ? 'Expand panels' : 'Expandir painéis'}</button>
        <button type="button" onClick={() => setPanelCommand({ open: false })}>{en ? 'Collapse panels' : 'Recolher painéis'}</button>
        <button type="button" onClick={exportDay} disabled={!selectedRows.length}>{en ? 'Export visible sessions (.ics)' : 'Exportar sessões visíveis (.ics)'}</button>
        <button type="button" onClick={() => window.print()}>{en ? 'Print full programme' : 'Imprimir programa completo'}</button>
      </div>
      <p className="discovery-hint">{en ? 'Times are local to Coimbra (Europe/Lisbon). Favourites are saved in this browser; they do not reserve places or register you for courses.' : 'Horários locais de Coimbra (Europe/Lisbon). Os favoritos ficam neste navegador; não reservam vagas nem inscrevem em cursos.'}</p>
      {!storageAvailable && <p role="status">{en ? 'Browser storage is unavailable. Favourites will last only while this page is open.' : 'O armazenamento do navegador está indisponível. Os favoritos mantêm-se apenas enquanto esta página estiver aberta.'}</p>}
      {(query || onlyFavourites) && <p role="status">{selectedRows.length} {en ? 'sessions found in this day' : 'sessões encontradas neste dia'}</p>}
      {selectedRows.length === 0 && <p>{en ? 'No sessions match. Clear the filters or choose another day.' : 'Nenhuma sessão corresponde à pesquisa. Limpe os filtros ou escolha outro dia.'}</p>}
      {exportError && <p role="alert">{exportError}</p>}
    </div>
    {days.map(day => <section hidden={!printing && selectedDay !== day.day} className="schedule-day" id={`dia-${day.day}`} key={day.day} aria-labelledby={`title-${day.day}`}>
      <header className="schedule-day-heading"><div><p className="eyebrow">{day.day} {en ? 'April 2027' : 'de abril de 2027'}</p><h2 id={`title-${day.day}`}>{en ? day.en : day.pt}</h2></div><span>{day.rows.length} {en ? 'sessions' : 'sessões'}</span></header>
      {day.day === '08' && <p className="schedule-day-note">{en ? 'The morning and afternoon courses have separate registrations.' : 'Os cursos da manhã e da tarde têm inscrições autónomas.'}</p>}
      <ol className="schedule-list">{visibleRows(day).map(row => <ProgrammeRow key={sessionId(day.day, row)} row={row} en={en} day={day.day} panelCommand={panelCommand} printing={printing} favourite={favourites.includes(sessionId(day.day, row))} onFavourite={() => toggleFavourite(sessionId(day.day, row))} />)}</ol>
    </section>)}
    <div className="schedule-footer"><Link className="button button--outline" to="/oradores">{en ? 'Meet all speakers' : 'Conhecer todos os oradores'}</Link><Link className="button button--dark" to="/participar">{en ? 'Registration information' : 'Informações sobre inscrições'}</Link></div>
  </main>;
}
