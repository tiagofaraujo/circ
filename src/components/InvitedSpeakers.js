import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { speakers2027 } from '../data/speakers2027';
import './css/InvitedSpeakers.css';

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
