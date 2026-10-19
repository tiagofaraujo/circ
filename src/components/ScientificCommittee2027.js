import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import names from '../data/scientificCommittee2027.json';
import './ScientificCommittee2027.css';

// Public display names only. No source workbook, contacts or moderator data.
export default function ScientificCommittee2027() {
  const { language } = useLanguage();
  const en = language === 'en';
  const title = en ? 'Scientific Committee' : 'Comissão Científica';

  return (
    <section
      id="comissao-cientifica"
      className="recovered-section scientific-committee2027"
      aria-labelledby="scientific-committee2027-title"
    >
      <header className="recovered-section__header scientific-committee2027__header">
        <p className="eyebrow">CIRC 2027</p>
        <h2 id="scientific-committee2027-title">{title}</h2>
      </header>
      <ul className="scientific-committee2027__names" role="list" aria-label={`${title} CIRC 2027`}>
        {names.map(name => <li key={name}>{name}</li>)}
      </ul>
    </section>
  );
}
