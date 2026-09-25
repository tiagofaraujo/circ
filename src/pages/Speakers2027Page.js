import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import { SpeakerCard, SpeakerPortrait } from '../components/InvitedSpeakers';
import { NotFoundPage } from './InfoPages';

export default function Speakers2027Page() {
  const { language } = useLanguage();
  const en = language === 'en';
  const { speakerId } = useParams();
  const speaker = speakers2027.find((item) => item.id === speakerId);
  if (speakerId && !speaker) return <NotFoundPage />;
  if (speaker) {
    const text = speaker[language];
    return <main className="guest-profile">
      <Link className="guest-back" to="/oradores">← {en ? 'All invited speakers' : 'Todos os oradores convidados'}</Link>
      <div className="guest-profile__layout">
        <aside><SpeakerPortrait speaker={speaker} /><p className="guest-field">{text.field}</p><p className="guest-institution">{speaker.institution}</p>
          {speaker.linkedin && <a className="guest-linkedin" href={speaker.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${speaker.name} — LinkedIn (${en ? 'opens in a new tab' : 'abre num novo separador'})`}>
            <span className="guest-linkedin__icon" aria-hidden="true">in</span> LinkedIn <span aria-hidden="true">↗</span>
          </a>}
        </aside>
        <article><p className="eyebrow">CIRC 2027 · {en ? 'Invited speaker' : 'Orador convidado'}</p><h1>{speaker.name}</h1><p className="guest-role">{text.role}</p>
          <div className="guest-bio">{text.bio.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          <Link className="button button--outline" to="/programa">{en ? 'Explore the programme' : 'Consultar o programa'} <span aria-hidden="true">→</span></Link>
        </article>
      </div>
    </main>;
  }
  return <main className="guest-directory">
    <header className="guest-heading"><div><p className="eyebrow">CIRC 2027 · Coimbra</p><h1>{en ? 'Invited speakers' : 'Oradores convidados'}</h1></div><p>{en ? 'Different perspectives. A shared commitment to medical imaging. Discover the people and the experience they bring to this edition.' : 'Diferentes perspetivas. Um compromisso comum com a Imagem Médica. Conheça os percursos e a experiência dos convidados desta edição.'}</p></header>
    <div className="guest-grid">{speakers2027.map((item) => <SpeakerCard key={item.id} speaker={item} language={language} />)}</div>
    <div className="guest-directory__note"><p>{en ? 'Session topics and schedules will be published as the scientific programme is finalised.' : 'Os temas e horários das intervenções serão divulgados à medida que o programa científico for finalizado.'}</p><Link className="text-link" to="/programa">{en ? 'View programme' : 'Consultar programa'} →</Link></div>
  </main>;
}
