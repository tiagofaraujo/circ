import { abstractSectionKeys, normalizeAbstractSections } from './submissionAbstract';

const sectionLabels = {
  pt: {
    introduction: 'Introdução',
    objective: 'Objetivo',
    methods: 'Métodos',
    results: 'Resultados',
    conclusion: 'Conclusão',
    keywords: 'Palavras-chave',
  },
  en: {
    introduction: 'Introduction',
    objective: 'Objective',
    methods: 'Methods',
    results: 'Results',
    conclusion: 'Conclusion',
    keywords: 'Keywords',
  },
};

const copy = {
  pt: {
    documentTitle: 'Submissão científica',
    code: 'Código',
    type: 'Tipologia',
    status: 'Estado',
    submittedAt: 'Data e hora',
    contact: 'Autor de contacto',
    email: 'Email',
    authors: 'Autores',
    affiliation: 'Instituição / Afiliação',
    abstract: 'Resumo',
    generatedAt: 'Documento gerado em',
    printHint: 'Na janela de impressão, selecione “Guardar como PDF”.',
    typeLabels: { oral: 'Comunicação livre', poster: 'Poster' },
    statusLabels: {
      draft: 'Rascunho',
      submitted: 'Por avaliar',
      under_review: 'Em revisão',
      revisions: 'Revisões pedidas',
      accepted: 'Aceite',
      rejected: 'Não aceite',
    },
  },
  en: {
    documentTitle: 'Scientific submission',
    code: 'Code',
    type: 'Type',
    status: 'Status',
    submittedAt: 'Date and time',
    contact: 'Contact author',
    email: 'Email',
    authors: 'Authors',
    affiliation: 'Institution / Affiliation',
    abstract: 'Abstract',
    generatedAt: 'Document generated on',
    printHint: 'In the print window, select “Save as PDF”.',
    typeLabels: { oral: 'Free communication', poster: 'Poster' },
    statusLabels: {
      draft: 'Draft',
      submitted: 'Pending review',
      under_review: 'Under review',
      revisions: 'Revisions requested',
      accepted: 'Accepted',
      rejected: 'Not accepted',
    },
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dateFromValue(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDate(value, language) {
  const date = dateFromValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function printableValue(value, fallback = '—') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function abstractMarkup(submission, language, t) {
  if (submission.abstractSections && typeof submission.abstractSections === 'object') {
    const sections = normalizeAbstractSections(submission.abstractSections);
    return abstractSectionKeys.map((key) => (
      '<section class="abstract-section">'
        + '<h2>' + escapeHtml(sectionLabels[language][key]) + '</h2>'
        + '<p>' + escapeHtml(printableValue(sections[key])).replace(/\n/g, '<br>') + '</p>'
      + '</section>'
    )).join('');
  }

  return '<section class="abstract-section">'
    + '<h2>' + escapeHtml(t.abstract) + '</h2>'
    + '<p>' + escapeHtml(printableValue(submission.abstract, language === 'en' ? 'Abstract unavailable.' : 'Resumo não disponível.')).replace(/\n/g, '<br>') + '</p>'
  + '</section>';
}

export function submissionPdfFilename(submission) {
  const code = printableValue(submission?.code || submission?.id, 'submissao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return 'circ-2027-' + (code || 'submissao') + '.pdf';
}

export function buildSubmissionPrintDocument(submission, options = {}) {
  const language = options.language === 'en' ? 'en' : 'pt';
  const t = copy[language];
  const code = printableValue(submission?.code || submission?.id);
  const dateValue = submission?.submittedAt || submission?.updatedAt || submission?.createdAt;
  const generatedAt = new Date();
  const type = t.typeLabels[submission?.type] || printableValue(submission?.type);
  const status = t.statusLabels[submission?.status] || printableValue(submission?.status);
  const testBadge = submission?.isTest
    ? '<span class="test-badge">' + (language === 'en' ? 'TEST' : 'TESTE') + '</span>'
    : '';
  const styles = [
    '@page{size:A4;margin:18mm 17mm 18mm;}',
    '*{box-sizing:border-box;}',
    'html{background:#e9e9ee;}',
    'body{margin:0;color:#111747;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
    '.screen-note{padding:12px 18px;background:#111747;color:#fff;text-align:center;font-size:10pt;}',
    '.page{max-width:210mm;min-height:297mm;margin:0 auto;padding:18mm 17mm;background:#fff;}',
    '.masthead{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #2733c6;}',
    '.brand{color:#2733c6;font-size:25pt;font-weight:800;letter-spacing:-1.2px;line-height:1;}',
    '.brand small{display:block;margin-top:6px;color:#e6503b;font-size:7.5pt;letter-spacing:1.6px;text-transform:uppercase;}',
    '.document-label{text-align:right;color:#5c607c;font-size:8pt;letter-spacing:1px;text-transform:uppercase;}',
    '.document-label strong{display:block;margin-top:5px;color:#111747;font-size:12pt;letter-spacing:0;text-transform:none;}',
    '.title-block{padding:26px 0 20px;border-bottom:1px solid #d8d9e2;}',
    '.title-block h1{max-width:165mm;margin:8px 0 0;color:#2733c6;font-size:22pt;font-weight:600;line-height:1.12;letter-spacing:-.6px;}',
    '.test-badge{display:inline-block;padding:4px 7px;border:1px solid #e6503b;color:#c53f2d;font-size:7pt;font-weight:800;letter-spacing:1px;}',
    '.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-bottom:1px solid #d8d9e2;}',
    '.meta div{padding:13px 14px 13px 0;border-bottom:1px solid #ececf1;}',
    '.meta div:nth-child(even){padding-left:14px;border-left:1px solid #ececf1;}',
    '.meta span{display:block;margin-bottom:4px;color:#73768c;font-size:7.3pt;font-weight:700;letter-spacing:.7px;text-transform:uppercase;}',
    '.meta strong{color:#111747;font-size:10pt;font-weight:600;white-space:pre-line;overflow-wrap:anywhere;}',
    '.abstract{padding-top:20px;}',
    '.abstract-heading{margin:0 0 7px;color:#e6503b;font-size:8pt;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;}',
    '.abstract-section{padding:15px 0;border-top:1px solid #d8d9e2;break-inside:avoid;}',
    '.abstract-section h2{margin:0 0 7px;color:#2733c6;font-size:9pt;font-weight:800;letter-spacing:.8px;text-transform:uppercase;}',
    '.abstract-section p{margin:0;color:#252a50;text-align:justify;overflow-wrap:anywhere;}',
    '.footer{margin-top:26px;padding-top:10px;border-top:1px solid #d8d9e2;display:flex;justify-content:space-between;gap:20px;color:#73768c;font-size:7.5pt;}',
    '@media print{html,body{background:#fff;}.screen-note{display:none;}.page{max-width:none;min-height:0;margin:0;padding:0;}}',
    '@media screen and (max-width:700px){.page{padding:28px 22px;}.meta{grid-template-columns:1fr;}.meta div:nth-child(even){padding-left:0;border-left:0;}.masthead{display:block;}.document-label{margin-top:18px;text-align:left;}}',
  ].join('');

  const meta = [
    [t.code, code],
    [t.type, type],
    [t.status, status],
    [t.submittedAt, formatDate(dateValue, language)],
    [t.contact, printableValue(submission?.contactName)],
    [t.email, printableValue(submission?.contactEmail)],
    [t.authors, printableValue(submission?.authors)],
    [t.affiliation, printableValue(submission?.affiliation)],
  ].map(([label, value]) => (
    '<div><span>' + escapeHtml(label) + '</span><strong>'
      + escapeHtml(value).replace(/\n/g, '<br>')
    + '</strong></div>'
  )).join('');

  return '<!doctype html>'
    + '<html lang="' + language + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + escapeHtml(submissionPdfFilename(submission)) + '</title>'
    + '<style>' + styles + '</style></head><body>'
    + '<div class="screen-note">' + escapeHtml(t.printHint) + '</div>'
    + '<main class="page">'
    + '<header class="masthead"><div class="brand">CIRC 2027<small>Coimbra · 9—10 abril</small></div>'
    + '<div class="document-label">' + escapeHtml(t.documentTitle) + '<strong>' + escapeHtml(code) + '</strong></div></header>'
    + '<section class="title-block">' + testBadge + '<h1>' + escapeHtml(printableValue(submission?.title, language === 'en' ? 'Untitled submission' : 'Trabalho sem título')) + '</h1></section>'
    + '<section class="meta">' + meta + '</section>'
    + '<section class="abstract"><p class="abstract-heading">' + escapeHtml(t.abstract) + '</p>'
    + abstractMarkup(submission || {}, language, t) + '</section>'
    + '<footer class="footer"><span>CIRC 2027 · Congresso Internacional de Radiologia de Coimbra</span>'
    + '<span>' + escapeHtml(t.generatedAt) + ' ' + escapeHtml(formatDate(generatedAt, language)) + '</span></footer>'
    + '</main></body></html>';
}

export function exportSubmissionPdf(submission, options = {}) {
  if (typeof window === 'undefined') throw new Error('pdf/browser-required');

  const printWindow = window.open('', '_blank', 'popup=yes,width=920,height=1040');
  if (!printWindow) throw new Error('pdf/popup-blocked');

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildSubmissionPrintDocument(submission, options));
  printWindow.document.close();

  const openPrintDialog = () => {
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 220);
  };

  if (printWindow.document.readyState === 'complete') openPrintDialog();
  else printWindow.addEventListener('load', openPrintDialog, { once: true });

  return submissionPdfFilename(submission);
}
