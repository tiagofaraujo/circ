import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  deleteAdminTestSubmission,
  saveAdminTestSubmission,
  subscribeToSubmissions,
} from '../auth/adminOperationsStore';
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
    testMode: 'Modo de teste administrativo',
    testModeText: 'Esta simulação cria um registo de teste no Firebase, visível apenas na administração e claramente separado das submissões reais.',
    startTest: 'Criar trabalho de teste',
    testHint: 'Simulação disponível apenas para administração',
    formEyebrow: 'Nova submissão · Teste',
    formTitle: 'Construa o trabalho passo a passo.',
    close: 'Fechar teste',
    typeLabel: 'Escolha a tipologia',
    oralType: 'Abstract · Comunicação livre',
    oralTypeHint: 'Prazo oficial · 15 janeiro 2027',
    posterType: 'Poster',
    posterTypeHint: 'Prazo oficial · 28 fevereiro 2027',
    identityLabel: 'Identificação do trabalho',
    titleLabel: 'Título do trabalho',
    titlePlaceholder: 'Introduza um título claro e objetivo',
    authorsLabel: 'Autores',
    authorsPlaceholder: 'Um autor por linha, pela ordem de apresentação',
    contentLabel: 'Conteúdo científico',
    affiliationLabel: 'Instituição ou afiliação principal',
    affiliationPlaceholder: 'Ex.: ULS Coimbra',
    abstractLabel: 'Texto do resumo',
    abstractPlaceholder: 'Escreva aqui o conteúdo científico para testar a experiência de submissão.',
    reviewLabel: 'Revisão e envio',
    reviewText: 'Confirme os dados. Neste modo, “Submeter teste” cria um registo Firebase identificado como demonstração.',
    saveDraft: 'Guardar rascunho',
    submitTest: 'Submeter teste',
    savedMessage: 'O rascunho de teste foi guardado e já está disponível na administração.',
    submittedMessage: 'Submissão de teste concluída e disponível na Gestão de Submissões.',
    draftStatus: 'Rascunho · Teste',
    submittedStatus: 'Submetido · Teste',
    removeTest: 'Eliminar teste',
    workCount: 'trabalho(s) de teste',
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
    testMode: 'Administrative test mode',
    testModeText: 'This simulation creates a test record in Firebase, visible only to administration and clearly separated from real submissions.',
    startTest: 'Create test submission',
    testHint: 'Simulation available to administration only',
    formEyebrow: 'New submission · Test',
    formTitle: 'Build the work step by step.',
    close: 'Close test',
    typeLabel: 'Choose the submission type',
    oralType: 'Abstract · Free communication',
    oralTypeHint: 'Official deadline · 15 January 2027',
    posterType: 'Poster',
    posterTypeHint: 'Official deadline · 28 February 2027',
    identityLabel: 'Work identification',
    titleLabel: 'Work title',
    titlePlaceholder: 'Enter a clear, objective title',
    authorsLabel: 'Authors',
    authorsPlaceholder: 'One author per line, in presentation order',
    contentLabel: 'Scientific content',
    affiliationLabel: 'Main institution or affiliation',
    affiliationPlaceholder: 'E.g. ULS Coimbra',
    abstractLabel: 'Abstract text',
    abstractPlaceholder: 'Write the scientific content here to test the submission experience.',
    reviewLabel: 'Review and submission',
    reviewText: 'Confirm the details. In this mode, “Submit test” creates a Firebase record identified as a demonstration.',
    saveDraft: 'Save draft',
    submitTest: 'Submit test',
    savedMessage: 'The test draft was saved and is now available in administration.',
    submittedMessage: 'Test submission completed and available in Submission Management.',
    draftStatus: 'Draft · Test',
    submittedStatus: 'Submitted · Test',
    removeTest: 'Delete test',
    workCount: 'test submission(s)',
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

const testExampleDefinitions = {
  pt: {
    oral: {
      title: 'Otimização da dose em tomografia computorizada pediátrica através de protocolos adaptados ao peso',
      coAuthors: ['Ana Martins', 'Miguel Costa'],
      affiliation: 'Serviço de Imagem Médica, Unidade Local de Saúde de Coimbra',
      abstract: 'Introdução: A redução da dose em tomografia computorizada pediátrica exige protocolos ajustados à dimensão corporal, sem comprometer a qualidade diagnóstica.\n\nObjetivo: Avaliar o impacto de um protocolo baseado no peso sobre o CTDIvol, o DLP e a qualidade da imagem.\n\nMateriais e métodos: Foram analisados, para efeito desta simulação, 120 exames abdominais pediátricos, comparando um protocolo convencional com parâmetros automáticos ajustados ao peso. Dois observadores avaliaram a qualidade da imagem numa escala de cinco pontos.\n\nResultados: O protocolo adaptado reduziu o DLP mediano em 31%, mantendo qualidade diagnóstica em 96% dos exames e elevada concordância interobservador.\n\nConclusão: A adaptação dos parâmetros ao peso poderá reduzir significativamente a exposição à radiação, preservando a qualidade necessária ao diagnóstico.',
    },
    poster: {
      title: 'Redução de artefactos metálicos em ressonância magnética musculoesquelética: experiência de um centro',
      coAuthors: ['Joana Ribeiro', 'Pedro Almeida'],
      affiliation: 'Serviço de Imagem Médica, Unidade Local de Saúde de Coimbra',
      abstract: 'Introdução: Os implantes ortopédicos podem limitar a avaliação por ressonância magnética devido a distorção geométrica e perda de sinal.\n\nObjetivo: Comparar uma abordagem convencional com um protocolo otimizado para redução de artefactos metálicos.\n\nMateriais e métodos: Nesta amostra fictícia foram considerados 48 exames musculoesqueléticos realizados em doentes com material ortopédico. O protocolo otimizado combinou maior largura de banda, voxel reduzido e técnicas específicas de redução de artefactos.\n\nResultados: Verificou-se uma redução média de 38% na área de distorção e uma melhoria da confiança diagnóstica, com um aumento de 12% no tempo de aquisição.\n\nConclusão: A combinação de parâmetros adaptados poderá melhorar a avaliação dos tecidos adjacentes ao implante, mantendo um tempo de exame clinicamente aceitável.',
    },
  },
  en: {
    oral: {
      title: 'Paediatric computed tomography dose optimisation using weight-adapted protocols',
      coAuthors: ['Ana Martins', 'Miguel Costa'],
      affiliation: 'Medical Imaging Department, Coimbra Local Health Unit',
      abstract: 'Introduction: Dose reduction in paediatric computed tomography requires protocols adapted to body size without compromising diagnostic quality.\n\nObjective: To assess the impact of a weight-based protocol on CTDIvol, DLP and image quality.\n\nMaterials and methods: For this simulation, 120 paediatric abdominal examinations were analysed, comparing a conventional protocol with automatically adjusted weight-based parameters. Two observers assessed image quality on a five-point scale.\n\nResults: The adapted protocol reduced median DLP by 31%, while maintaining diagnostic quality in 96% of examinations and high interobserver agreement.\n\nConclusion: Weight-adapted parameters may significantly reduce radiation exposure while preserving the image quality required for diagnosis.',
    },
    poster: {
      title: 'Metal artefact reduction in musculoskeletal magnetic resonance imaging: a single-centre experience',
      coAuthors: ['Joana Ribeiro', 'Pedro Almeida'],
      affiliation: 'Medical Imaging Department, Coimbra Local Health Unit',
      abstract: 'Introduction: Orthopaedic implants may limit magnetic resonance assessment because of geometric distortion and signal loss.\n\nObjective: To compare a conventional approach with an optimised metal artefact reduction protocol.\n\nMaterials and methods: This fictional sample included 48 musculoskeletal examinations performed in patients with orthopaedic hardware. The optimised protocol combined higher bandwidth, smaller voxels and dedicated artefact reduction techniques.\n\nResults: The mean distortion area decreased by 38% and diagnostic confidence improved, with a 12% increase in acquisition time.\n\nConclusion: Combining adapted parameters may improve assessment of tissues adjacent to an implant while maintaining a clinically acceptable examination time.',
    },
  },
};

function createTestExample(language, type, initialAuthor) {
  const definition = testExampleDefinitions[language === 'en' ? 'en' : 'pt'][type];
  return {
    type,
    title: definition.title,
    authors: [initialAuthor || 'Autor de teste', ...definition.coAuthors].join('\n'),
    affiliation: definition.affiliation,
    abstract: definition.abstract,
  };
}

function TestSubmissionForm({ t, language, initialAuthor, onClose, onSave }) {
  const [form, setForm] = useState(() => createTestExample(language, 'oral', initialAuthor));
  const [saving, setSaving] = useState(false);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const selectType = (type) => {
    setForm(createTestExample(language, type, initialAuthor));
  };

  const save = async (status) => {
    if (saving || !form.title.trim() || !form.authors.trim() || !form.abstract.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        title: form.title.trim(),
        authors: form.authors.trim(),
        affiliation: form.affiliation.trim(),
        abstract: form.abstract.trim(),
      }, status);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="submissions-composer" aria-labelledby="submissions-composer-title">
      <header className="submissions-composer__header">
        <div>
          <p className="eyebrow">{t.formEyebrow}</p>
          <h2 id="submissions-composer-title">{t.formTitle}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={saving}>{t.close} ×</button>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); save('submitted'); }}>
        <fieldset className="submissions-form-step">
          <legend><span>01</span>{t.typeLabel}</legend>
          <div className="submissions-type-grid">
            <label className={form.type === 'oral' ? 'is-selected' : ''}>
              <input type="radio" name="submission-type" value="oral" checked={form.type === 'oral'} onChange={() => selectType('oral')} />
              <span><strong>{t.oralType}</strong><small>{t.oralTypeHint}</small></span>
              <i aria-hidden="true">{form.type === 'oral' ? '✓' : ''}</i>
            </label>
            <label className={form.type === 'poster' ? 'is-selected' : ''}>
              <input type="radio" name="submission-type" value="poster" checked={form.type === 'poster'} onChange={() => selectType('poster')} />
              <span><strong>{t.posterType}</strong><small>{t.posterTypeHint}</small></span>
              <i aria-hidden="true">{form.type === 'poster' ? '✓' : ''}</i>
            </label>
          </div>
        </fieldset>

        <fieldset className="submissions-form-step">
          <legend><span>02</span>{t.identityLabel}</legend>
          <label>
            <span>{t.titleLabel}</span>
            <input value={form.title} onChange={updateField('title')} placeholder={t.titlePlaceholder} required />
          </label>
          <label>
            <span>{t.authorsLabel}</span>
            <textarea rows="4" value={form.authors} onChange={updateField('authors')} placeholder={t.authorsPlaceholder} required />
          </label>
        </fieldset>

        <fieldset className="submissions-form-step">
          <legend><span>03</span>{t.contentLabel}</legend>
          <label>
            <span>{t.affiliationLabel}</span>
            <input value={form.affiliation} onChange={updateField('affiliation')} placeholder={t.affiliationPlaceholder} />
          </label>
          <label>
            <span>{t.abstractLabel}</span>
            <textarea rows="9" value={form.abstract} onChange={updateField('abstract')} placeholder={t.abstractPlaceholder} required />
          </label>
        </fieldset>

        <fieldset className="submissions-form-step submissions-form-step--review">
          <legend><span>04</span>{t.reviewLabel}</legend>
          <div className="submissions-review-card">
            <div><small>{t.typeLabel}</small><strong>{form.type === 'oral' ? t.oralType : t.posterType}</strong></div>
            <div><small>{t.titleLabel}</small><strong>{form.title || '—'}</strong></div>
            <div><small>{t.authorsLabel}</small><strong>{form.authors || '—'}</strong></div>
          </div>
          <p>{t.reviewText}</p>
          <div className="submissions-form-actions">
            <button type="button" onClick={() => save('draft')} disabled={saving || !form.title.trim() || !form.authors.trim() || !form.abstract.trim()}>{saving ? '…' : t.saveDraft}</button>
            <button type="submit" disabled={saving || !form.title.trim() || !form.authors.trim() || !form.abstract.trim()}>{saving ? '…' : t.submitTest} →</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export default function ScientificSubmissionsPage() {
  const { language } = useLanguage();
  const { user, access } = useAuth();
  const t = content[language === 'en' ? 'en' : 'pt'];
  const canTestSubmissions = Boolean(access?.canTestSubmissions);
  const [composerOpen, setComposerOpen] = useState(false);
  const [testSubmissions, setTestSubmissions] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!canTestSubmissions || !user) return undefined;
    return subscribeToSubmissions(
      (items) => setTestSubmissions(items.filter((item) => item.isTest && item.userId === user.uid)),
      () => setNotice(language === 'en' ? 'Unable to load Firebase test submissions.' : 'Não foi possível carregar as submissões de teste do Firebase.')
    );
  }, [canTestSubmissions, language, user]);

  const saveTestSubmission = async (form, status) => {
    try {
      await saveAdminTestSubmission(user, form, status, canTestSubmissions);
      setComposerOpen(false);
      setNotice(status === 'draft' ? t.savedMessage : t.submittedMessage);
      window.setTimeout(() => setNotice(''), 6000);
    } catch (error) {
      setNotice(language === 'en' ? 'The test submission could not be saved.' : 'Não foi possível guardar a submissão de teste.');
    }
  };

  const removeTestSubmission = async (submission) => {
    try {
      await deleteAdminTestSubmission(user, submission, canTestSubmissions);
    } catch (error) {
      setNotice(language === 'en' ? 'The test submission could not be deleted.' : 'Não foi possível eliminar a submissão de teste.');
    }
  };

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

      {canTestSubmissions && (
        <section className="submissions-test-banner" role="status">
          <span>TEST</span>
          <div><strong>{t.testMode}</strong><p>{t.testModeText}</p></div>
        </section>
      )}

      {notice && <div className="submissions-test-notice" role="status">✓ {notice}</div>}

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
          <button type="button" disabled={!canTestSubmissions} onClick={() => setComposerOpen(true)} aria-describedby="submissions-new-hint">{canTestSubmissions ? t.startTest : t.newWork}<span>＋</span></button>
          <small id="submissions-new-hint">{canTestSubmissions ? t.testHint : t.newWorkHint}</small>
        </div>
      </section>

      {canTestSubmissions && composerOpen && (
        <TestSubmissionForm
          t={t}
          language={language}
          initialAuthor={user?.displayName || user?.email || ''}
          onClose={() => setComposerOpen(false)}
          onSave={saveTestSubmission}
        />
      )}

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
        {canTestSubmissions && testSubmissions.length > 0 ? (
          <article className="submissions-test-list">
            <header><div><p className="eyebrow">{t.worksEyebrow}</p><h2>{testSubmissions.length} {t.workCount}</h2></div><span>LOCAL</span></header>
            <div>
              {testSubmissions.map((submission) => (
                <article key={submission.id}>
                  <div className="submissions-test-list__topline">
                    <span>{submission.code || submission.id}</span>
                    <strong className={`is-${submission.status}`}>{submission.status === 'draft' ? t.draftStatus : t.submittedStatus}</strong>
                  </div>
                  <p>{submission.type === 'oral' ? t.oralType : t.posterType}</p>
                  <h3>{submission.title}</h3>
                  <small>{submission.authors.split('\n').join(' · ')}</small>
                  <button type="button" onClick={() => removeTestSubmission(submission)}>{t.removeTest}</button>
                </article>
              ))}
            </div>
          </article>
        ) : (
          <article className="submissions-empty">
            <div className="submissions-empty__mark" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <p className="eyebrow">{t.worksEyebrow}</p>
              <h2>{t.worksTitle}</h2>
              <p>{t.worksText}</p>
            </div>
          </article>
        )}
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
