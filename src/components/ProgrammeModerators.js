import React from 'react';
import { Link } from 'react-router-dom';
import { moderators2027 } from '../data/moderators2027';

export default function ProgrammeModerators({ days, en }) {
  const language = en ? 'en' : 'pt';
  const sessionsByModerator = new Map();

  for (const { day, rows } of days) {
    for (const [time, titlePt, titleEn, , , , moderatorIds] of rows) {
      for (const id of moderatorIds || []) {
        if (!sessionsByModerator.has(id)) sessionsByModerator.set(id, []);
        sessionsByModerator.get(id).push({ day, time, title: en ? titleEn : titlePt });
      }
    }
  }

  return <section className="programme-moderators" id="moderadores" aria-labelledby="programme-moderators-title">
    <h2 id="programme-moderators-title">{en ? 'Moderators' : 'Moderadores'}</h2>
    <ul className="programme-moderators__list">
      {Object.entries(moderators2027).map(([id, moderator]) => {
        const sessions = sessionsByModerator.get(id);
        const bio = moderator[language]?.bio;
        return <li key={id} className="programme-moderator">
          <h3>{moderator.name}</h3>
          <p className="programme-moderator__institution">{moderator.institution}</p>
          {sessions && <ul className="programme-moderator__sessions">
            {sessions.map(({ day, time, title }) => <li key={`${day}-${time}`}>
              <span>{en ? `${Number(day)} April` : `${Number(day)} de abril`} · {time}</span>
              <strong>{title}</strong>
            </li>)}
          </ul>}
          {bio && <details className="programme-moderator__bio">
            <summary>{en ? 'Read biography' : 'Ler biografia'}<span className="visually-hidden"> · {moderator.name}</span></summary>
            {bio.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </details>}
          {moderator.speakerId && <Link className="text-link" to={`/oradores/${moderator.speakerId}`}>
            {en ? 'Read biography' : 'Ler biografia'}<span className="visually-hidden"> · {moderator.name}</span>
          </Link>}
        </li>;
      })}
    </ul>
  </section>;
}
