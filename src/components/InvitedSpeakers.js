import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import './css/InvitedSpeakers.css';

export function LinkedInIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.74 1.36-1.52 2.79-1.52 2.98 0 3.58 1.96 3.58 4.51v5.26Z" /></svg>;
}

export function SpeakerPortrait({ speaker }) {
  return <div className={`guest-portrait guest-portrait--${speaker.id}`}>
    {speaker.image
      ? <img src={`/speakers/${speaker.image}`} alt={speaker.name} width="350" height="350" loading="lazy" />
      : <span className="guest-initials" aria-label={speaker.name}>{speaker.initials}</span>}
  </div>;
}

export function SpeakerCard({ speaker, language }) {
  const text = speaker[language];
  return <article className="guest-card">
    <Link className="guest-card__link" to={`/oradores/${speaker.id}`} aria-label={`${speaker.name} — ${language === 'en' ? 'biography' : 'biografia'}`}>
      <div className="guest-card__top">
        <SpeakerPortrait speaker={speaker} />
        <p className="guest-field">{text.field}</p>
      </div>
      <div className="guest-card__copy">
        <h3>{speaker.name}</h3>
        <p className="guest-institution">{speaker.institution}</p>
        <span className="guest-more">{language === 'en' ? 'View biography' : 'Ver biografia'} <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
    {speaker.linkedin && <a className="guest-card__linkedin" href={speaker.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${speaker.name} — LinkedIn (${language === 'en' ? 'opens in a new tab' : 'abre num novo separador'})`} title={`${speaker.name} · LinkedIn`}>
      <LinkedInIcon />
    </a>}
  </article>;
}

export default function InvitedSpeakers() {
  const { language } = useLanguage();
  const en = language === 'en';
  return <section className="guest-section" aria-labelledby="invited-speakers-title">
    <div className="guest-heading">
      <div><p className="eyebrow">CIRC 2027 · {en ? 'Invited speakers' : 'Oradores convidados'}</p>
        <h2 id="invited-speakers-title">{en ? 'Expertise that connects us.' : 'Conhecimento que nos aproxima.'}</h2></div>
      <p>{en ? 'Meet the specialists joining us in Coimbra to share experience, research and new perspectives in medical imaging.' : 'Conheça os especialistas que se juntam a nós em Coimbra para partilhar experiência, investigação e novas perspetivas na Imagem Médica.'}</p>
    </div>
    <div className="guest-grid">{speakers2027.slice(0, 3).map((speaker) => <SpeakerCard key={speaker.id} speaker={speaker} language={language} />)}</div>
    <div className="guest-section__footer"><div><span className="eyebrow">{en ? 'Also joining us' : 'Também connosco'}</span>
      <p>{speakers2027.slice(3).map((speaker, index) => <React.Fragment key={speaker.id}>{index > 0 && <span aria-hidden="true"> · </span>}<Link to={`/oradores/${speaker.id}`}>{speaker.name}</Link></React.Fragment>)}</p></div>
      <Link className="button button--outline" to="/oradores">{en ? 'Meet all speakers' : 'Conhecer todos os oradores'} <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
