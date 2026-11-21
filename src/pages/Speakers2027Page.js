import React from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import { moderators2027 } from '../data/moderators2027';
import { SpeakerCard, SpeakerPortrait, LinkedInIcon } from '../components/InvitedSpeakers';
import { matchesSearch } from '../utils/discovery';
import '../discovery.css';
import { NotFoundPage } from './InfoPages';

const moderatorProfiles = Object.entries(moderators2027).map(([id, moderator]) => {
  const speaker = speakers2027.find(item => item.id === moderator.speakerId);
  if (speaker) return speaker;
  const names = moderator.name.split(' ');
  return {
    ...moderator,
    id,
    initials: names[0][0] + names.at(-1)[0],
  };
});

export default function Speakers2027Page() {
  const { language } = useLanguage();
  const en = language === 'en';
  const { speakerId } = useParams();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const role = ['speakers', 'moderators'].includes(params.get('role')) ? params.get('role') : 'all';
  const alphabetical = params.get('sort') === 'name';
  const updateFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const filterProfiles = items => {
    const result = items.filter(item => matchesSearch([item.name, item.institution, item.pt?.field, item.en?.field].filter(Boolean).join(' '), query));
    return alphabetical ? result.sort((a, b) => a.name.localeCompare(b.name, language)) : result;
  };
  const listedSpeakers = role === 'moderators' ? [] : filterProfiles(speakers2027);
  const listedModerators = role === 'speakers' ? [] : filterProfiles(moderatorProfiles);
  const resultCount = new Set([...listedSpeakers, ...listedModerators].map(item => item.id)).size;
  const programmeReturn = /^\/(?:conta\/)?programa#dia-(08|09|10)$/.test(state?.programmeReturn || '') ? state.programmeReturn : '/programa';
  const directoryReturn = /^\/oradores(?:\?[^#]*)?(?:#moderadores)?$/.test(state?.directoryReturn || '') ? state.directoryReturn : null;
  if (speakerId === 'rita-batista') return <Navigate to="/oradores/rita-baptista" replace />;
  const invited = speakers2027.find(item => item.id === speakerId && item[language]?.bio?.length);
  const moderator = moderatorProfiles.find(item => item.id === speakerId && item[language]?.bio?.length);
  const speaker = invited || moderator;
  const fromModerators = moderator && (!invited || state?.fromModerators === true);
  if (speakerId && !speaker) return <NotFoundPage />;
  if (speaker) {
    const text = speaker[language];
    return <main className="guest-profile">
      <Link className="guest-back" to={directoryReturn || (fromModerators ? '/oradores#moderadores' : '/oradores')}>
        ← {fromModerators ? (en ? 'All moderators' : 'Todos os moderadores') : (en ? 'All invited speakers' : 'Todos os oradores convidados')}
      </Link>
      <div className="guest-profile__layout">
        <aside><SpeakerPortrait speaker={speaker} />{text.field && <p className="guest-field">{text.field}</p>}<p className="guest-institution">{speaker.institution}</p>
          {speaker.linkedin && <a className="guest-linkedin" href={speaker.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${speaker.name} — LinkedIn (${en ? 'opens in a new tab' : 'abre num novo separador'})`}>
            <LinkedInIcon /> LinkedIn <span aria-hidden="true">↗</span>
          </a>}
        </aside>
        <article><p className="eyebrow">CIRC 2027 · {fromModerators ? (en ? 'Moderation' : 'Moderação') : (en ? 'Invited speaker' : 'Orador convidado')}</p><h1>{speaker.name}</h1>{text.role && <p className="guest-role">{text.role}</p>}
          <div className="guest-bio">{text.bio.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {speaker.profileUrl && <p><a className="text-link" href={speaker.profileUrl} target="_blank" rel="noopener noreferrer">{en ? 'Official university profile' : 'Perfil oficial na universidade'} <span aria-hidden="true">↗</span></a></p>}
          <Link className="button button--outline" to={programmeReturn}>{state?.programmeReturn ? (en ? 'Back to the selected programme day' : 'Voltar ao dia do programa') : (en ? 'Explore the programme' : 'Consultar o programa')} <span aria-hidden="true">→</span></Link>
        </article>
      </div>
    </main>;
  }
  return <main className="guest-directory">
    <header className="guest-heading"><div><p className="eyebrow">CIRC 2027 · Coimbra</p><h1>{en ? 'Invited speakers' : 'Oradores convidados'}</h1></div><p>{en ? 'Different perspectives. A shared commitment to medical imaging. Discover the people and the experience they bring to this edition.' : 'Diferentes perspetivas. Um compromisso comum com a imagem médica. Conheça os percursos e a experiência dos convidados desta edição.'} <Link className="text-link" to="/oradores#moderadores">{en ? 'Meet the moderators' : 'Conhecer os moderadores'} <span aria-hidden="true">↓</span></Link></p></header>
    <div className="discovery-controls">
      <label htmlFor="speaker-search">{en ? 'Search people' : 'Pesquisar pessoas'}<input id="speaker-search" type="search" value={query} onChange={event => updateFilter('q', event.target.value)} placeholder={en ? 'Name, institution or field' : 'Nome, instituição ou área'} /></label>
      <label htmlFor="speaker-role">{en ? 'Participation' : 'Participação'}<select id="speaker-role" value={role} onChange={event => updateFilter('role', event.target.value === 'all' ? '' : event.target.value)}>
        <option value="all">{en ? 'Everyone' : 'Todos'}</option><option value="speakers">{en ? 'Speakers' : 'Oradores'}</option><option value="moderators">{en ? 'Moderators' : 'Moderadores'}</option>
      </select></label>
      <label htmlFor="speaker-sort">{en ? 'Sort by' : 'Ordenar por'}<select id="speaker-sort" value={alphabetical ? 'name' : 'programme'} onChange={event => updateFilter('sort', event.target.value === 'name' ? 'name' : '')}>
        <option value="programme">{en ? 'Default order' : 'Ordem original'}</option><option value="name">{en ? 'Name (A–Z)' : 'Nome (A–Z)'}</option>
      </select></label>
      <p role="status">{resultCount} {en ? (resultCount === 1 ? 'person found' : 'people found') : (resultCount === 1 ? 'pessoa encontrada' : 'pessoas encontradas')}</p>
      {(query || role !== 'all' || alphabetical) && <button type="button" onClick={() => setParams({}, { replace: true })}>{en ? 'Clear filters' : 'Limpar filtros'}</button>}
      {resultCount === 0 && <p>{en ? 'No matches. Try another name or institution.' : 'Sem resultados. Experimente outro nome ou instituição.'}</p>}
    </div>
    <div className="guest-grid">{listedSpeakers.map((item) => <SpeakerCard key={item.id} speaker={item} language={language} />)}</div>
    <section hidden={role === 'speakers'} className="guest-directory__moderators" id="moderadores" aria-labelledby="guest-moderators-title">
      <div className="guest-heading"><h2 id="guest-moderators-title">{en ? 'Moderators' : 'Moderadores'}</h2></div>
      <div className="guest-grid">{listedModerators.map(item => <SpeakerCard key={item.id} speaker={item} language={language} fromModerators />)}</div>
    </section>
    <div className="guest-directory__note"><p>{en ? 'See the programme for session topics, times and updates.' : 'Consulte no programa os temas, horários e atualizações das sessões.'}</p><Link className="text-link" to="/programa">{en ? 'View programme' : 'Consultar programa'} →</Link></div>
  </main>;
}
