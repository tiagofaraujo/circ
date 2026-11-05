import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { SUBMISSION_DEADLINES, SUBMISSION_OPEN_DATE } from '../data/submissions2027';
import { scientificRegulation2027, scientificRegulationOriginal2027 } from '../data/scientificRegulation2027';
import '../scientificRegulation2027.css';

const copy = {
  pt: {
    back: 'Participar',
    title: 'Regulamento de trabalhos científicos',
    lead: 'Consulte os prazos, prepare o resumo e saiba como são avaliadas e apresentadas as comunicações orais e os pósteres.',
    version: 'Versão de trabalho v1.0 · 9 de setembro de 2026',
    myCirc: 'Trabalhos no My CIRC',
    fullText: 'Texto integral',
    deadlines: 'Datas de submissão',
    dateLabels: ['Abertura', 'Prazo para comunicações orais', 'Prazo para pósteres'],
    openingTime: '00h00 · hora de Lisboa',
    index: 'Nesta página',
    checklist: 'Antes de submeter',
    pointsTitle: 'Pontos por confirmar',
    languageNote: 'O requisito final de idioma do resumo está por confirmar. Consulte as duas indicações do documento em «Autores e resumo».',
    formNote: 'O formulário do My CIRC recebe atualmente um resumo estruturado em texto. O segundo idioma, o carregamento de ficheiros e os restantes campos previstos no documento ainda não estão disponíveis como opções próprias do formulário.',
    proposedTable: 'Grelha proposta no documento de trabalho',
    topics: 'Consultar todas as áreas temáticas',
    originalLabel: 'Ler o documento completo e os três anexos',
    originalNote: 'Texto em português da versão de trabalho de 9 de setembro de 2026.',
    help: 'Contactar a organização',
    goUp: 'Voltar ao início do regulamento',
  },
  en: {
    back: 'Attend',
    title: 'Scientific submissions regulations',
    lead: 'Check the deadlines, prepare your abstract and learn how oral presentations and scientific posters are reviewed and presented.',
    version: 'Working draft v1.0 · 9 September 2026',
    myCirc: 'Scientific work in My CIRC',
    fullText: 'Full text',
    deadlines: 'Submission dates',
    dateLabels: ['Opening', 'Oral presentation deadline', 'Poster deadline'],
    openingTime: '00:00 · Lisbon time',
    index: 'On this page',
    checklist: 'Before you submit',
    pointsTitle: 'Details to be confirmed',
    languageNote: 'The final language requirement for the abstract is still to be confirmed. See both instructions from the draft in “Authors and abstract”.',
    formNote: 'The My CIRC form currently accepts one structured text abstract. A second language, file uploads and the other fields proposed in the document do not yet have dedicated form controls.',
    proposedTable: 'Proposed scoring criteria in the working draft',
    topics: 'See all thematic areas',
    originalLabel: 'Read the complete document and all three appendices',
    originalNote: 'Original Portuguese text of the working draft dated 9 September 2026.',
    help: 'Contact the organisers',
    goUp: 'Back to the top of the regulations',
  },
};

function RegulationTable({ label, columns, rows }) {
  return (
    <div className="science-regulation__table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead><tr>{columns.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OriginalText({ t }) {
  return (
    <details className="science-regulation__original">
      <summary>{t.originalLabel}</summary>
      <div className="science-regulation__original-body" lang="pt-PT">
        {scientificRegulationOriginal2027.map((block, index) => {
          if (block.type === 'heading') {
            return block.level === 2 ? <h4 key={index}>{block.text}</h4> : <h3 key={index}>{block.text}</h3>;
          }
          if (block.type === 'table') {
            const [columns, ...rows] = block.rows;
            return <RegulationTable key={index} label="Tabela do regulamento" columns={columns} rows={rows} />;
          }
          if (block.type === 'list') {
            return <ul key={index}>{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
          }
          return <p key={index}>{block.text}</p>;
        })}
      </div>
    </details>
  );
}

export default function ScientificRegulationPage2027() {
  const { language } = useLanguage();
  const lang = language === 'en' ? 'en' : 'pt';
  const t = copy[lang];
  const { checklist, sections } = scientificRegulation2027[lang];
  const dates = [SUBMISSION_OPEN_DATE, SUBMISSION_DEADLINES.oral, SUBMISSION_DEADLINES.poster];
  const dateFormat = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { dateStyle: 'long', timeZone: 'UTC' });

  return (
    <main className="page science-regulation" id="inicio-regulamento">
      <Link className="science-regulation__back" to="/participar"><span aria-hidden="true">←</span> {t.back}</Link>
      <header className="science-regulation__hero">
        <p className="eyebrow">CIRC 2027 · {lang === 'en' ? 'Scientific programme' : 'Programa científico'}</p>
        <h1>{t.title}</h1>
        <p className="science-regulation__lead">{t.lead}</p>
        <p className="science-regulation__version">{t.version}</p>
        <div className="science-regulation__actions">
          <Link className="button button--dark" to="/conta/submissoes">{t.myCirc}</Link>
          <a className="button button--outline" href="#texto-integral">{t.fullText} <span aria-hidden="true">↓</span></a>
        </div>
      </header>

      <dl className="science-regulation__dates" aria-label={t.deadlines}>
        {dates.map((date, index) => (
          <div key={date}>
            <dt>{t.dateLabels[index]}</dt>
            <dd><time dateTime={date}>{dateFormat.format(new Date(`${date}T00:00:00Z`))}</time></dd>
            {index === 0 && <dd className="science-regulation__date-note">{t.openingTime}</dd>}
          </div>
        ))}
      </dl>

      <div className="science-regulation__layout">
        <nav className="science-regulation__index" aria-label={t.index}>
          <p>{t.index}</p>
          <ul>
            <li><a href="#antes-de-submeter">{t.checklist}</a></li>
            {sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}
            <li><a href="#texto-integral">{t.fullText}</a></li>
          </ul>
        </nav>

        <div className="science-regulation__content">
          <aside className="science-regulation__notice" aria-labelledby="science-notice-title">
            <h2 id="science-notice-title">{t.pointsTitle}</h2>
            <p>{t.languageNote}</p>
            <p>{t.formNote}</p>
          </aside>

          <section id="antes-de-submeter" className="science-regulation__section science-regulation__checklist" aria-labelledby="science-checklist-title">
            <h2 id="science-checklist-title">{t.checklist}</h2>
            <ul>{checklist.map(item => <li key={item}>{item}</li>)}</ul>
          </section>

          {sections.map(section => (
            <section key={section.id} id={section.id} className="science-regulation__section" aria-labelledby={`${section.id}-title`}>
              <p className="science-regulation__reference">{section.reference}</p>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {section.items && (section.id === 'areas-tematicas' ? (
                <details className="science-regulation__disclosure">
                  <summary>{t.topics}</summary>
                  <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>
                </details>
              ) : <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>)}
              {section.table && <RegulationTable label={t.proposedTable} {...section.table} />}
            </section>
          ))}

          <section id="texto-integral" className="science-regulation__section" aria-labelledby="science-full-text-title">
            <h2 id="science-full-text-title">{t.fullText}</h2>
            <p>{t.originalNote}</p>
            <OriginalText t={t} />
          </section>

          <footer className="science-regulation__foot">
            <Link className="text-link" to="/contactos">{t.help}</Link>
            <a className="text-link" href="#inicio-regulamento">{t.goUp} <span aria-hidden="true">↑</span></a>
          </footer>
        </div>
      </div>
    </main>
  );
}
