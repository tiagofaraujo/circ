import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import '../submissions.css';

const content = {
  pt: {
    eyebrow: 'My CIRC · Submissões científicas',
    title: 'Centro de Submissões',
    lead: 'Um espaço pensado para preparar, submeter e acompanhar o seu trabalho científico com clareza, do primeiro título à decisão final.',
    status: 'Abertura · 15 novembro 2026',
    statusText: 'As submissões abrem na mesma data das inscrições do CIRC 2027.',
    deskEyebrow: 'A sua secretária editorial',
    deskTitle: 'O seu próximo trabalho começa aqui.',
    deskText: 'A partir de 15 de novembro, este será o ponto único para estruturar o resumo, reunir autores e acompanhar todas as atualizações.',
    openLabel: 'Abertura',
    openValue: '15 nov. 2026',
    oralDeadlineLabel: 'Abstracts · Comunicações livres',
    oralDeadlineValue: 'Até 15 jan. 2027',
    posterDeadlineLabel: 'Posters',
    posterDeadlineValue: 'Até 28 fev. 2027',
    rulesLabel: 'Normas',
    rulesValue: 'Em preparação',
    newWork: 'Novo trabalho',
    newWorkHint: 'Disponível a partir de 15 de novembro de 2026',
    journeyEyebrow: 'Percurso do autor',
    journeyTitle: 'Quatro etapas. Sempre a saber onde está.',
    steps: [
      ['01', 'Identificação', 'Título, área científica e modalidade do trabalho.'],
      ['02', 'Autores', 'Autores, ordem, afiliações e contactos reunidos num só lugar.'],
      ['03', 'Resumo', 'Conteúdo científico organizado antes da revisão final.'],
      ['04', 'Submissão', 'Confirmação, histórico e estado do processo sempre visíveis.'],
    ],
    worksEyebrow: 'Os seus trabalhos',
    worksTitle: 'Ainda não existem trabalhos',
    worksText: 'A partir de 15 de novembro poderá criar uma submissão, escolher a tipologia e guardá-la antes de enviar.',
    profile: 'Rever dados do perfil',
    preparationEyebrow: 'Preparação',
    preparationTitle: 'Tudo pronto antes de começar.',
    preparationText: 'O perfil do autor será reutilizado para reduzir o preenchimento e manter os dados consistentes.',
    checklist: ['Dados pessoais e profissionais', 'Título provisório', 'Autores e afiliações', 'Conteúdo do resumo'],
    back: 'Voltar ao My CIRC',
  },
  en: {
    eyebrow: 'My CIRC · Scientific submissions',
    title: 'Submission Centre',
    lead: 'A space designed to prepare, submit and follow your scientific work clearly, from the first title to the final decision.',
    status: 'Opening · 15 November 2026',
    statusText: 'Submissions open on the same date as CIRC 2027 registration.',
    deskEyebrow: 'Your editorial desk',
    deskTitle: 'Your next work starts here.',
    deskText: 'From 15 November, this will be the single place to structure your abstract, bring authors together and follow every update.',
    openLabel: 'Opening',
    openValue: '15 Nov. 2026',
    oralDeadlineLabel: 'Abstracts · Free communications',
    oralDeadlineValue: 'By 15 Jan. 2027',
    posterDeadlineLabel: 'Posters',
    posterDeadlineValue: 'By 28 Feb. 2027',
    rulesLabel: 'Guidelines',
    rulesValue: 'In preparation',
    newWork: 'New submission',
    newWorkHint: 'Available from 15 November 2026',
    journeyEyebrow: 'Author journey',
    journeyTitle: 'Four stages. Always know where you are.',
    steps: [
      ['01', 'Identification', 'Title, scientific area and work format.'],
      ['02', 'Authors', 'Authors, order, affiliations and contacts in one place.'],
      ['03', 'Abstract', 'Scientific content organised before the final review.'],
      ['04', 'Submission', 'Confirmation, history and process status always visible.'],
    ],
    worksEyebrow: 'Your submissions',
    worksTitle: 'No submissions yet',
    worksText: 'From 15 November, you will be able to create a submission, choose its type and save it before sending.',
    profile: 'Review profile details',
    preparationEyebrow: 'Preparation',
    preparationTitle: 'Everything ready before you begin.',
    preparationText: 'The author profile will be reused to reduce data entry and keep information consistent.',
    checklist: ['Personal and professional details', 'Working title', 'Authors and affiliations', 'Abstract content'],
    back: 'Back to My CIRC',
  },
};

function DocumentMark() {
  return (
    <div className="submissions-document" aria-hidden="true">
      <span className="submissions-document__label">CIRC 2027</span>
      <span className="submissions-document__title" />
      <span className="submissions-document__line submissions-document__line--short" />
      <span className="submissions-document__line" />
      <span className="submissions-document__line" />
      <span className="submissions-document__line submissions-document__line--medium" />
      <span className="submissions-document__seal">A</span>
    </div>
  );
}

export default function ScientificSubmissionsPage() {
  const { language } = useLanguage();
  const t = content[language === 'en' ? 'en' : 'pt'];

  return (
    <main className="submissions-page">
      <section className="submissions-hero">
        <div className="submissions-hero__copy">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p>{t.lead}</p>
        </div>
        <aside className="submissions-hero__status" aria-label={t.status}>
          <span className="submissions-status-dot" aria-hidden="true" />
          <div>
            <strong>{t.status}</strong>
            <p>{t.statusText}</p>
          </div>
        </aside>
      </section>

      <section className="submissions-desk">
        <div className="submissions-desk__intro">
          <div>
            <p className="eyebrow">{t.deskEyebrow}</p>
            <h2>{t.deskTitle}</h2>
            <p>{t.deskText}</p>
          </div>
          <DocumentMark />
        </div>
        <div className="submissions-desk__meta">
          <dl>
            <div><dt>{t.openLabel}</dt><dd>{t.openValue}</dd></div>
            <div><dt>{t.oralDeadlineLabel}</dt><dd>{t.oralDeadlineValue}</dd></div>
            <div><dt>{t.posterDeadlineLabel}</dt><dd>{t.posterDeadlineValue}</dd></div>
            <div><dt>{t.rulesLabel}</dt><dd>{t.rulesValue}</dd></div>
          </dl>
          <button type="button" disabled aria-describedby="submissions-new-hint">{t.newWork}<span>＋</span></button>
          <small id="submissions-new-hint">{t.newWorkHint}</small>
        </div>
      </section>

      <section className="submissions-journey">
        <header>
          <p className="eyebrow">{t.journeyEyebrow}</p>
          <h2>{t.journeyTitle}</h2>
        </header>
        <div className="submissions-steps">
          {t.steps.map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="submissions-lower-grid">
        <article className="submissions-empty">
          <div className="submissions-empty__mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="eyebrow">{t.worksEyebrow}</p>
            <h2>{t.worksTitle}</h2>
            <p>{t.worksText}</p>
          </div>
        </article>
        <article className="submissions-preparation">
          <p className="eyebrow">{t.preparationEyebrow}</p>
          <h2>{t.preparationTitle}</h2>
          <p>{t.preparationText}</p>
          <ul>
            {t.checklist.map((item) => <li key={item}><span>✓</span>{item}</li>)}
          </ul>
          <Link to="/conta/perfil">{t.profile} →</Link>
        </article>
      </section>

      <Link className="submissions-back" to="/conta">← {t.back}</Link>
    </main>
  );
}
