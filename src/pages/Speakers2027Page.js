import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import { moderators2027 } from '../data/moderators2027';
import { SpeakerCard, SpeakerPortrait, LinkedInIcon } from '../components/InvitedSpeakers';
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
  const invited = speakers2027.find(item => item.id === speakerId);
  const moderator = moderatorProfiles.find(item => item.id === speakerId && item[language]?.bio?.length);
  const speaker = invited || moderator;
  const fromModerators = moderator && (!invited || state?.fromModerators === true);
  if (speakerId && !speaker) return <NotFoundPage />;
  if (speaker) {
    const text = speaker[language];
    return <main className="guest-profile">
      <Link className="guest-back" to={fromModerators ? '/oradores#moderadores' : '/oradores'}>
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
          <Link className="button button--outline" to="/programa">{en ? 'Explore the programme' : 'Consultar o programa'} <span aria-hidden="true">→</span></Link>
        </article>
      </div>
    </main>;
  }
  return <main className="guest-directory">
    <header className="guest-heading"><div><p className="eyebrow">CIRC 2027 · Coimbra</p><h1>{en ? 'Invited speakers' : 'Oradores convidados'}</h1></div><p>{en ? 'Different perspectives. A shared commitment to medical imaging. Discover the people and the experience they bring to this edition.' : 'Diferentes perspetivas. Um compromisso comum com a imagem médica. Conheça os percursos e a experiência dos convidados desta edição.'} <Link className="text-link" to="/oradores#moderadores">{en ? 'Meet the moderators' : 'Conhecer os moderadores'} <span aria-hidden="true">↓</span></Link></p></header>
    <div className="guest-grid">{speakers2027.map((item) => <SpeakerCard key={item.id} speaker={item} language={language} />)}</div>
    <section className="guest-directory__moderators" id="moderadores" aria-labelledby="guest-moderators-title">
      <div className="guest-heading"><h2 id="guest-moderators-title">{en ? 'Moderators' : 'Moderadores'}</h2></div>
      <div className="guest-grid">{moderatorProfiles.map(item => <SpeakerCard key={item.id} speaker={item} language={language} fromModerators />)}</div>
    </section>
    <div className="guest-directory__note"><p>{en ? 'Session topics and schedules will be published as the scientific programme is finalised.' : 'Os temas e horários das intervenções serão divulgados à medida que o programa científico for finalizado.'}</p><Link className="text-link" to="/programa">{en ? 'View programme' : 'Consultar programa'} →</Link></div>
  </main>;
}
