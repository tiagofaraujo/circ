import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  deleteSubmissionDraft,
  saveSubmission,
  subscribeToUserSubmissions,
  submissionErrorMessage,
  updateSubmissionDraft,
} from '../auth/adminOperationsStore';
import {
  hasCompleteAbstractSections,
  normalizeAbstractSections,
} from '../auth/submissionAbstract';
import { isSubmissionOpeningReached, isSubmissionTypeOpen, SUBMISSION_LIMITS, SUBMISSION_OPEN_DATE } from '../data/submissions2027';
import { exportSubmissionPdf } from '../auth/submissionPdf';
import { useLanguage } from '../context/LanguageContext';
import '../submissions.css';

const content = {
  pt: {
    eyebrow: 'My CIRC · Submissões científicas',
    title: 'Centro de Submissões',
    lead: 'Um espaço pensado para preparar, submeter e acompanhar o seu trabalho científico com clareza, do primeiro título à decisão final.',
    status: 'Submissões abertas',
    statusText: 'Prepare o resumo, guarde um rascunho ou submeta o trabalho para avaliação científica.',
    upcomingStatus: 'Submissões a partir de 15 de novembro',
    upcomingText: 'A criação de rascunhos e a submissão de trabalhos abrem a 15 de novembro de 2026, às 00h00 de Lisboa.',
    upcomingValue: 'Abre a 15 de novembro',
    closedStatus: 'Prazos de submissão encerrados',
    closedText: 'Pode consultar os seus trabalhos e acompanhar a avaliação nesta página.',
    closedValue: 'Encerrado',
    deskEyebrow: 'Preparar o seu trabalho',
    deskTitle: 'O seu próximo trabalho começa aqui.',
    deskText: 'Estruture o resumo, reúna os autores e acompanhe o estado do seu trabalho nesta página.',
    openLabel: 'Estado',
    openValue: 'Aberto',
    oralDeadlineLabel: 'Resumos · Comunicações livres',
    oralDeadlineValue: 'Até 15 de jan. de 2027',
    posterDeadlineLabel: 'Pósteres',
    posterDeadlineValue: 'Até 28 de fev. de 2027',
    rulesLabel: 'Formato',
    rulesValue: 'Resumo estruturado',
    newWork: 'Novo trabalho',
    closedType: 'Prazo de submissão encerrado para esta tipologia.',
    newWorkHint: 'Guarde um rascunho antes da submissão definitiva.',
    journeyEyebrow: 'Percurso do autor',
    journeyTitle: 'Quatro etapas. Sempre a saber onde está.',
    steps: [
      ['01', 'Identificação', 'Título e modalidade do trabalho.'],
      ['02', 'Autores', 'Autores, ordem, afiliações e contactos reunidos num só lugar.'],
      ['03', 'Resumo', 'Conteúdo científico organizado antes da revisão final.'],
      ['04', 'Submissão', 'Confirmação, histórico e estado do processo sempre visíveis.'],
    ],
    worksEyebrow: 'Os seus trabalhos',
    worksTitle: 'Ainda não existem trabalhos',
    worksText: 'Crie uma submissão, escolha a tipologia e guarde o resumo antes de o enviar para avaliação.',
    worksLoading: 'A carregar os seus trabalhos…',
    worksLoadError: 'Não foi possível carregar os seus trabalhos. Nenhum dado foi alterado.',
    worksRetry: 'Tentar novamente',
    profile: 'Rever dados do perfil',
    preparationEyebrow: 'Preparação',
    preparationTitle: 'Tudo pronto antes de começar.',
    preparationText: 'O perfil do autor será reutilizado para reduzir o preenchimento e manter os dados consistentes.',
    checklist: ['Dados pessoais e profissionais', 'Título provisório', 'Autores e afiliações', 'Conteúdo do resumo'],
    formEyebrow: 'Nova submissão',
    formTitle: 'Construa o trabalho passo a passo.',
    close: 'Fechar formulário',
    typeLabel: 'Escolha a tipologia',
    oralType: 'Resumo · Comunicação livre',
    oralTypeHint: 'Prazo oficial · 15 de janeiro de 2027',
    posterType: 'Póster',
    posterTypeHint: 'Prazo oficial · 28 de fevereiro de 2027',
    identityLabel: 'Identificação do trabalho',
    titleLabel: 'Título do trabalho',
    titlePlaceholder: 'Introduza um título claro e objetivo',
    authorsLabel: 'Autores',
    authorsPlaceholder: 'Um autor por linha, pela ordem de apresentação',
    anonymousHint: 'Para garantir uma avaliação anónima, não inclua nomes de autores nem afiliações no título ou no texto do resumo. Utilize os campos próprios para essa informação.',
    contentLabel: 'Conteúdo científico',
    affiliationLabel: 'Instituição ou afiliação principal',
    affiliationPlaceholder: 'Ex.: ULS Coimbra',
    introductionLabel: 'Introdução',
    introductionPlaceholder: 'Enquadramento e relevância do tema.',
    objectiveLabel: 'Objetivo',
    objectivePlaceholder: 'Defina de forma clara o objetivo principal do trabalho.',
    methodsLabel: 'Métodos',
    methodsPlaceholder: 'Descreva o desenho do estudo, a amostra, os procedimentos e a análise.',
    resultsLabel: 'Resultados',
    resultsPlaceholder: 'Apresente os resultados principais de forma objetiva.',
    conclusionLabel: 'Conclusão',
    conclusionPlaceholder: 'Sintetize a principal conclusão e a sua relevância.',
    keywordsLabel: 'Palavras-chave',
    keywordsPlaceholder: 'Ex.: Radiologia; Ressonância magnética; Diagnóstico',
    sectionsComplete: 'As seis secções do resumo estão preenchidas.',
    reviewLabel: 'Revisão e envio',
    reviewText: 'Confirme os dados e a anonimização do título e do resumo. Depois de submeter, o trabalho segue para avaliação e deixa de poder ser editado.',
    saveDraft: 'Guardar rascunho',
    savingWork: 'A guardar o trabalho…',
    submittingWork: 'A submeter o trabalho…',
    updateDraft: 'Atualizar rascunho',
    submitWork: 'Submeter trabalho',
    submitRequirements: 'Para submeter, preencha o título, os autores e as seis secções do resumo. Pode guardar um rascunho depois de indicar o título e os autores.',
    savedMessage: 'O rascunho foi guardado. Pode continuar a editá-lo antes de submeter.',
    draftUpdatedMessage: 'O rascunho foi atualizado.',
    submittedMessage: 'Trabalho submetido com sucesso. Pode acompanhar o estado da avaliação nesta página.',
    draftStatus: 'Rascunho',
    submittedStatus: 'Submetido',
    editDraft: 'Editar rascunho',
    editFormEyebrow: 'Editar submissão · Rascunho',
    editFormTitle: 'Continue o trabalho e submeta quando estiver pronto.',
    removeDraft: 'Eliminar rascunho',
    viewSubmission: 'Consultar submissão',
    exportPdf: 'Exportar PDF',
    pdfError: 'Não foi possível abrir o documento. Confirme se o navegador bloqueou a nova janela.',
    contactLabel: 'Autor de contacto',
    emailLabel: 'Email',
    abstractDetailLabel: 'Resumo submetido',
    abstractUnavailable: 'Resumo não disponível.',
    workCount: 'trabalho(s)',
    submittedAtLabel: 'Submetido em',
    draftAtLabel: 'Rascunho criado em',
    recordedAtLabel: 'Registado em',
    datePending: 'A registar data e hora…',
    back: 'Voltar ao My CIRC',
  },
  en: {
    eyebrow: 'My CIRC · Scientific submissions',
    title: 'Submission Centre',
    lead: 'A space designed to prepare, submit and follow your scientific work clearly, from the first title to the final decision.',
    status: 'Submissions open',
    statusText: 'Prepare an abstract, save a draft or submit your work for scientific review.',
    upcomingStatus: 'Submissions open on 15 November',
    upcomingText: 'Draft creation and scientific submissions open on 15 November 2026 at 00:00 Lisbon time.',
    upcomingValue: 'Opens on 15 November',
    closedStatus: 'Submission deadlines have passed',
    closedText: 'You can view your submissions and follow their review on this page.',
    closedValue: 'Closed',
    deskEyebrow: 'Your editorial desk',
    deskTitle: 'Your next work starts here.',
    deskText: 'Structure your abstract, bring authors together and track the status of your work here.',
    openLabel: 'Status',
    openValue: 'Open',
    oralDeadlineLabel: 'Abstracts · Free communications',
    oralDeadlineValue: 'By 15 Jan. 2027',
    posterDeadlineLabel: 'Posters',
    posterDeadlineValue: 'By 28 Feb. 2027',
    rulesLabel: 'Format',
    rulesValue: 'Structured abstract',
    newWork: 'New submission',
    closedType: 'The submission deadline for this type has passed.',
    newWorkHint: 'Save a draft before final submission.',
    journeyEyebrow: 'Author journey',
    journeyTitle: 'Four stages. Always know where you are.',
    steps: [
      ['01', 'Identification', 'Title and submission format.'],
      ['02', 'Authors', 'Authors, order, affiliations and contacts in one place.'],
      ['03', 'Abstract', 'Scientific content organised before the final review.'],
      ['04', 'Submission', 'Confirmation, history and process status always visible.'],
    ],
    worksEyebrow: 'Your submissions',
    worksTitle: 'No submissions yet',
    worksText: 'Create a submission, select its type and save your abstract before sending it for review.',
    worksLoading: 'Loading your submissions…',
    worksLoadError: 'Your submissions could not be loaded. No data has been changed.',
    worksRetry: 'Try again',
    profile: 'Review profile details',
    preparationEyebrow: 'Preparation',
    preparationTitle: 'Everything ready before you begin.',
    preparationText: 'The author profile will be reused to reduce data entry and keep information consistent.',
    checklist: ['Personal and professional details', 'Working title', 'Authors and affiliations', 'Abstract content'],
    formEyebrow: 'New submission',
    formTitle: 'Build the work step by step.',
    close: 'Close form',
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
    anonymousHint: 'For anonymous review, do not include author names or affiliations in the title or abstract. Use the dedicated fields for this information.',
    contentLabel: 'Scientific content',
    affiliationLabel: 'Main institution or affiliation',
    affiliationPlaceholder: 'E.g. ULS Coimbra',
    introductionLabel: 'Introduction',
    introductionPlaceholder: 'Set out the context and relevance of the topic.',
    objectiveLabel: 'Objective',
    objectivePlaceholder: 'Clearly define the main objective of the work.',
    methodsLabel: 'Methods',
    methodsPlaceholder: 'Describe the study design, sample, procedures and analysis.',
    resultsLabel: 'Results',
    resultsPlaceholder: 'Present the main results objectively.',
    conclusionLabel: 'Conclusion',
    conclusionPlaceholder: 'Summarise the main conclusion and its relevance.',
    keywordsLabel: 'Keywords',
    keywordsPlaceholder: 'E.g. Radiology; Magnetic resonance imaging; Diagnosis',
    sectionsComplete: 'All six abstract sections are complete.',
    reviewLabel: 'Review and submission',
    reviewText: 'Check the details and anonymise the title and abstract. After submission, the work enters review and can no longer be edited.',
    saveDraft: 'Save draft',
    savingWork: 'Saving your work…',
    submittingWork: 'Submitting your work…',
    updateDraft: 'Update draft',
    submitWork: 'Submit work',
    submitRequirements: 'To submit, complete the title, authors and all six abstract sections. You can save a draft once you have entered the title and authors.',
    savedMessage: 'Your draft was saved. You can keep editing it before submission.',
    draftUpdatedMessage: 'Your draft was updated.',
    submittedMessage: 'Your work was submitted successfully. You can track its review status here.',
    draftStatus: 'Draft',
    submittedStatus: 'Submitted',
    editDraft: 'Edit draft',
    editFormEyebrow: 'Edit submission · Draft',
    editFormTitle: 'Continue the work and submit it when ready.',
    removeDraft: 'Delete draft',
    viewSubmission: 'View submission',
    exportPdf: 'Export PDF',
    pdfError: 'The document could not be opened. Check whether the browser blocked the new window.',
    contactLabel: 'Contact author',
    emailLabel: 'Email',
    abstractDetailLabel: 'Submitted abstract',
    abstractUnavailable: 'Abstract unavailable.',
    workCount: 'submission(s)',
    submittedAtLabel: 'Submitted on',
    draftAtLabel: 'Draft created on',
    recordedAtLabel: 'Recorded on',
    datePending: 'Recording date and time…',
    back: 'Back to My CIRC',
  },
};

const authorStatusLabels = {
  pt: {
    draft: 'Rascunho',
    submitted: 'Submetido',
    under_review: 'Em avaliação',
    revisions: 'Correções solicitadas',
    accepted: 'Aceite',
    rejected: 'Não aceite',
  },
  en: {
    draft: 'Draft',
    submitted: 'Submitted',
    under_review: 'Under review',
    revisions: 'Revisions requested',
    accepted: 'Accepted',
    rejected: 'Not accepted',
  },
};

function dateFromValue(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function submissionDateMeta(submission, language, t) {
  const isDraft = submission.status === 'draft';
  const value = submission.submittedAt || (isDraft ? submission.createdAt : submission.updatedAt || submission.createdAt);
  const date = dateFromValue(value);
  const label = submission.submittedAt
    ? t.submittedAtLabel
    : isDraft
      ? t.draftAtLabel
      : t.recordedAtLabel;

  return {
    dateTime: date?.toISOString(),
    text: date
      ? `${label} ${new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'pt-PT', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Europe/Lisbon',
        }).format(date)} (${language === 'en' ? 'Lisbon time' : 'hora de Lisboa'})`
      : t.datePending,
  };
}

function submissionAbstractItems(submission, t) {
  if (submission.abstractSections && typeof submission.abstractSections === 'object') {
    const sections = normalizeAbstractSections(submission.abstractSections);
    return [
      ['introduction', t.introductionLabel],
      ['objective', t.objectiveLabel],
      ['methods', t.methodsLabel],
      ['results', t.resultsLabel],
      ['conclusion', t.conclusionLabel],
      ['keywords', t.keywordsLabel],
    ].map(([key, label]) => ({
      key,
      label,
      value: sections[key] || '—',
    }));
  }

  return [{
    key: 'legacy',
    label: t.abstractDetailLabel,
    value: submission.abstract || t.abstractUnavailable,
  }];
}

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

const emptySubmissionForm = {
  type: 'oral',
  title: '',
  authors: '',
  affiliation: '',
  introduction: '',
  objective: '',
  methods: '',
  results: '',
  conclusion: '',
  keywords: '',
};

function formFromSubmission(submission) {
  if (!submission) return { ...emptySubmissionForm, type: isSubmissionTypeOpen('oral') ? 'oral' : 'poster' };

  const sections = normalizeAbstractSections(submission.abstractSections);
  return {
    type: submission.type || (isSubmissionTypeOpen('oral') ? 'oral' : 'poster'),
    title: submission.title || '',
    authors: submission.authors || '',
    affiliation: submission.affiliation || '',
    ...sections,
  };
}

function SubmissionForm({ t, onClose, onSave, onClearError, error, submission }) {
  const [form, setForm] = useState(() => formFromSubmission(submission));
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('draft');
  const headingRef = useRef(null);

  useEffect(() => {
    // Announce the newly opened editor before the participant enters any data.
    headingRef.current?.focus();
  }, []);

  const updateField = (field) => (event) => {
    onClearError();
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const canSaveDraft = Boolean(isSubmissionOpeningReached() && isSubmissionTypeOpen(form.type) && form.title.trim().length >= 3 && form.authors.trim().length >= 2);
  const canSubmit = canSaveDraft && hasCompleteAbstractSections(form) && isSubmissionTypeOpen(form.type);
  const abstractFields = [
    ['introduction', t.introductionLabel, t.introductionPlaceholder, 4],
    ['objective', t.objectiveLabel, t.objectivePlaceholder, 3],
    ['methods', t.methodsLabel, t.methodsPlaceholder, 5],
    ['results', t.resultsLabel, t.resultsPlaceholder, 5],
    ['conclusion', t.conclusionLabel, t.conclusionPlaceholder, 4],
  ];

  const save = async (status) => {
    if (saving || !isSubmissionTypeOpen(form.type) || (status === 'draft' ? !canSaveDraft : !canSubmit)) return;
    setSavingStatus(status);
    setSaving(true);
    try {
      await onSave({
        ...form,
        title: form.title.trim(),
        authors: form.authors.trim(),
        affiliation: form.affiliation.trim(),
        abstractSections: normalizeAbstractSections(form),
      }, status);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="submissions-composer" aria-labelledby="submissions-composer-title">
      <header className="submissions-composer__header">
        <div>
          <p className="eyebrow">{submission ? t.editFormEyebrow : t.formEyebrow}</p>
          <h2 id="submissions-composer-title" ref={headingRef} tabIndex={-1}>{submission ? t.editFormTitle : t.formTitle}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={saving}>{t.close} ×</button>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); save('submitted'); }}>
        <fieldset className="submissions-form-step">
          <legend><span>01</span>{t.typeLabel}</legend>
          <div className="submissions-type-grid">
            <label className={form.type === 'oral' ? 'is-selected' : ''}>
              <input type="radio" name="submission-type" value="oral" checked={form.type === 'oral'} onChange={updateField('type')} />
              <span><strong>{t.oralType}</strong><small>{t.oralTypeHint}</small></span>
              <i aria-hidden="true">{form.type === 'oral' ? '✓' : ''}</i>
            </label>
            <label className={form.type === 'poster' ? 'is-selected' : ''}>
              <input type="radio" name="submission-type" value="poster" checked={form.type === 'poster'} onChange={updateField('type')} />
              <span><strong>{t.posterType}</strong><small>{t.posterTypeHint}</small></span>
              <i aria-hidden="true">{form.type === 'poster' ? '✓' : ''}</i>
            </label>
          </div>
        </fieldset>

        <fieldset className="submissions-form-step">
          <legend><span>02</span>{t.identityLabel}</legend>
          <label>
            <span>{t.titleLabel}</span>
            <input value={form.title} onChange={updateField('title')} placeholder={t.titlePlaceholder} maxLength={SUBMISSION_LIMITS.title} minLength={3} required />
          </label>
          <label>
            <span>{t.authorsLabel}</span>
            <textarea rows="4" value={form.authors} onChange={updateField('authors')} placeholder={t.authorsPlaceholder} maxLength={SUBMISSION_LIMITS.authors} required />
          </label>
        </fieldset>

        <fieldset className="submissions-form-step">
          <legend><span>03</span>{t.contentLabel}</legend>
          <label>
            <span>{t.affiliationLabel}</span>
            <input value={form.affiliation} onChange={updateField('affiliation')} placeholder={t.affiliationPlaceholder} maxLength={SUBMISSION_LIMITS.affiliation} />
          </label>
          <p>{t.anonymousHint}</p>
          <div className="submissions-abstract-grid">
            {abstractFields.map(([field, label, placeholder, rows]) => (
              <label key={field}>
                <span>{label}</span>
                <textarea rows={rows} value={form[field]} onChange={updateField(field)} placeholder={placeholder} maxLength={SUBMISSION_LIMITS[field]} required />
              </label>
            ))}
            <label className="submissions-abstract-grid__keywords">
              <span>{t.keywordsLabel}</span>
              <input value={form.keywords} onChange={updateField('keywords')} placeholder={t.keywordsPlaceholder} maxLength={SUBMISSION_LIMITS.keywords} required />
            </label>
          </div>
        </fieldset>

        <fieldset className="submissions-form-step submissions-form-step--review">
          <legend><span>04</span>{t.reviewLabel}</legend>
          <div className="submissions-review-card">
            <div><small>{t.typeLabel}</small><strong>{form.type === 'oral' ? t.oralType : t.posterType}</strong></div>
            <div><small>{t.titleLabel}</small><strong>{form.title || '—'}</strong></div>
            <div><small>{t.authorsLabel}</small><strong>{form.authors || '—'}</strong></div>
            <div><small>{t.contentLabel}</small><strong>{canSubmit ? t.sectionsComplete : '—'}</strong></div>
          </div>
          <p>{t.reviewText}</p>
          {!isSubmissionTypeOpen(form.type) && <p role="status">{t.closedType}</p>}
          {!canSubmit && isSubmissionTypeOpen(form.type) && <p id="submissions-submit-hint">{t.submitRequirements}</p>}
          {error && <p className="submissions-test-notice" role="alert">{error}</p>}
          {saving && <p role="status" aria-live="polite">{savingStatus === 'submitted' ? t.submittingWork : t.savingWork}</p>}
          <div className="submissions-form-actions">
            <button type="button" onClick={() => save('draft')} disabled={saving || !canSaveDraft}>{submission ? t.updateDraft : t.saveDraft}</button>
            <button type="submit" disabled={saving || !canSubmit} aria-describedby={!canSubmit && isSubmissionTypeOpen(form.type) ? 'submissions-submit-hint' : undefined}>{t.submitWork} →</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export default function ScientificSubmissionsPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const t = content[language === 'en' ? 'en' : 'pt'];
  const [clock, setClock] = useState(() => new Date());
  const openingReached = isSubmissionOpeningReached(clock);
  const anyTypeOpen = isSubmissionTypeOpen('oral', clock) || isSubmissionTypeOpen('poster', clock);
  const canSubmitWork = user?.emailVerified === true && openingReached && anyTypeOpen;
  const status = !openingReached ? t.upcomingStatus : anyTypeOpen ? t.status : t.closedStatus;
  const statusText = !openingReached ? t.upcomingText : anyTypeOpen ? t.statusText : t.closedText;
  const openValue = !openingReached ? t.upcomingValue : anyTypeOpen ? t.openValue : t.closedValue;
  const [composerOpen, setComposerOpen] = useState(false);
  const newSubmissionRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [ownSubmissions, setOwnSubmissions] = useState([]);
  const [submissionsLoadState, setSubmissionsLoadState] = useState('loading');
  const [submissionsRetry, setSubmissionsRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setClock(new Date());
    const interval = window.setInterval(refresh, 60000);
    const untilOpening = new Date(`${SUBMISSION_OPEN_DATE}T00:00:00Z`).getTime() - Date.now();
    const timer = untilOpening > 0 && untilOpening < 2147483647
      ? window.setTimeout(refresh, untilOpening)
      : null;
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    setOwnSubmissions([]);
    setSubmissionsLoadState('loading');
    const unsubscribe = subscribeToUserSubmissions(
      user.uid,
      (items) => { if (active) { setOwnSubmissions(items); setSubmissionsLoadState('ready'); } },
      () => { if (active) setSubmissionsLoadState('error'); }
    );
    return () => { active = false; unsubscribe(); };
  }, [language, user, submissionsRetry]);

  useEffect(() => {
    if (composerOpen || !restoreFocusRef.current) return;
    const trigger = restoreFocusRef.current;
    (trigger.isConnected ? trigger : newSubmissionRef.current)?.focus();
    restoreFocusRef.current = null;
  }, [composerOpen]);

  const openNewSubmission = (event) => {
    if (!canSubmitWork || (!isSubmissionTypeOpen('oral') && !isSubmissionTypeOpen('poster'))) return;
    restoreFocusRef.current = event.currentTarget;
    setError('');
    setEditingSubmission(null);
    setComposerOpen(true);
  };

  const editSubmission = (submission, event) => {
    if (!canSubmitWork || !isSubmissionOpeningReached() || submission?.isTest === true || submission?.userId !== user?.uid || submission.status !== 'draft' || !isSubmissionTypeOpen(submission.type)) return;
    restoreFocusRef.current = event.currentTarget;
    setError('');
    setEditingSubmission(submission);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingSubmission(null);
  };

  const saveWork = async (form, status) => {
    const isEditing = Boolean(editingSubmission);
    setError('');

    try {
      if (isEditing) {
        await updateSubmissionDraft(
          user,
          editingSubmission,
          form,
          status
        );
      } else {
        await saveSubmission(user, form, status);
      }

      closeComposer();
      setNotice(
        status === 'submitted'
          ? t.submittedMessage
          : isEditing
            ? t.draftUpdatedMessage
            : t.savedMessage
      );
      window.setTimeout(() => setNotice(''), 6000);
    } catch (error) {
      setError(submissionErrorMessage(error, language));
    }
  };

  const removeDraft = async (submission) => {
    if (!window.confirm(language === 'en' ? 'Delete this draft permanently?' : 'Eliminar definitivamente este rascunho?')) return;
    setError('');
    try {
      await deleteSubmissionDraft(user, submission);
    } catch (error) {
      setError(submissionErrorMessage(error, language));
    }
  };

  const exportPdf = (submission) => {
    try {
      exportSubmissionPdf(submission, { language });
    } catch (error) {
      setNotice(t.pdfError);
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
        <aside className="submissions-hero__status" aria-label={status}>
          <span className="submissions-status-dot" aria-hidden="true" />
          <div>
            <strong>{status}</strong>
            <p>{statusText}</p>
          </div>
        </aside>
      </section>

      {user?.emailVerified !== true && <p role="alert">{language === 'en' ? 'Verify your email address in your profile before creating or submitting work.' : 'Confirme o endereço de email no perfil antes de criar ou submeter um trabalho.'} <Link to="/conta/perfil">{t.profile}</Link></p>}
      {notice && <div className="submissions-test-notice" role="status">{notice}</div>}
      {error && !composerOpen && <div className="submissions-test-notice" role="alert">{error}</div>}

      <section className="submissions-desk">
        <div className="submissions-desk__intro">
          <div>
            <p className="eyebrow">{t.deskEyebrow}</p>
            <h2>{t.deskTitle}</h2>
            <p>{t.deskText}</p>
            <p><Link className="text-link" to="/regulamento/submissoes">{language === 'en' ? 'Read the scientific submissions regulations' : 'Consultar o regulamento dos trabalhos científicos'}</Link></p>
          </div>
          <DocumentMark />
        </div>
        <div className="submissions-desk__meta">
          <dl>
            <div><dt>{t.openLabel}</dt><dd>{openValue}</dd></div>
            <div><dt>{t.oralDeadlineLabel}</dt><dd>{t.oralDeadlineValue}</dd></div>
            <div><dt>{t.posterDeadlineLabel}</dt><dd>{t.posterDeadlineValue}</dd></div>
            <div><dt>{t.rulesLabel}</dt><dd>{t.rulesValue}</dd></div>
          </dl>
          <button ref={newSubmissionRef} type="button" disabled={!canSubmitWork} onClick={openNewSubmission} aria-describedby="submissions-new-hint">{t.newWork}<span>＋</span></button>
          <small id="submissions-new-hint">{!openingReached ? t.upcomingText : !anyTypeOpen ? t.closedText : t.newWorkHint}</small>
        </div>
      </section>

      {canSubmitWork && composerOpen && (
        <SubmissionForm
          key={editingSubmission?.id || 'new-submission'}
          t={t}
          submission={editingSubmission}
          onClose={closeComposer}
          onSave={saveWork}
          error={error}
          onClearError={() => setError('')}
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

      <section className="submissions-lower-grid" id="my-works">
        {submissionsLoadState === 'loading' ? (
          <article className="submissions-empty" role="status"><p>{t.worksLoading}</p></article>
        ) : submissionsLoadState === 'error' ? (
          <article className="submissions-empty" role="status">
            <div>
              <p>{t.worksLoadError}</p>
              <button type="button" onClick={() => setSubmissionsRetry((count) => count + 1)}>{t.worksRetry}</button>
            </div>
          </article>
        ) : ownSubmissions.length > 0 ? (
          <article className="submissions-test-list">
            <header>
              <div>
                <p className="eyebrow">{t.worksEyebrow}</p>
                <h2>{ownSubmissions.length} {t.workCount}</h2>
              </div>
              <span>MY CIRC</span>
            </header>
            <div>
              {ownSubmissions.map((submission) => (
                <article key={submission.id}>
                  <div className="submissions-test-list__topline">
                    <span>{submission.code || submission.id}</span>
                    <strong className={'is-' + submission.status}>
                      {authorStatusLabels[language === 'en' ? 'en' : 'pt'][submission.status] || submission.status || '—'}

                    </strong>
                  </div>
                  <p>{submission.type === 'oral' ? t.oralType : t.posterType}</p>
                  <h3>{submission.title}</h3>
                  <small>{String(submission.authors || '').split('\n').join(' · ')}</small>
                  <time className="submissions-test-list__timestamp" dateTime={submissionDateMeta(submission, language, t).dateTime}>
                    {submissionDateMeta(submission, language, t).text}
                  </time>

                  {canSubmitWork && submission.isTest !== true && submission.status === 'draft' && (
                    <button type="button" onClick={(event) => editSubmission(submission, event)}>
                      {t.editDraft} →
                    </button>
                  )}

                  <details className="submissions-work-details">
                    <summary>
                      <span>{t.viewSubmission}</span>
                      <i aria-hidden="true">＋</i>
                    </summary>
                    <div className="submissions-work-details__content">
                      <div className="submissions-work-details__meta">
                        <div><span>{t.authorsLabel}</span><p>{submission.authors || '—'}</p></div>
                        <div><span>{t.affiliationLabel}</span><p>{submission.affiliation || '—'}</p></div>
                        <div><span>{t.contactLabel}</span><p>{submission.contactName || '—'}</p></div>
                        <div><span>{t.emailLabel}</span><p>{submission.contactEmail || '—'}</p></div>
                      </div>
                      <div className="submissions-work-details__abstract">
                        <span>{t.abstractDetailLabel}</span>
                        {submissionAbstractItems(submission, t).map((section) => (
                          <section key={section.key}>
                            <h4>{section.label}</h4>
                            <p>{section.value}</p>
                          </section>
                        ))}
                      </div>
                      <div className="submissions-work-details__actions">
                        <button type="button" onClick={() => exportPdf(submission)}>{t.exportPdf}</button>
                        {canSubmitWork && submission.isTest !== true && submission.status === 'draft' && (
                          <button type="button" onClick={() => removeDraft(submission)}>{t.removeDraft}</button>
                        )}
                      </div>
                    </div>
                  </details>
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
