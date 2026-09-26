export const reviewCriteria = [
  ['quality', 'Qualidade científica e relevância do trabalho', 'Scientific quality and relevance'],
  ['originality', 'Originalidade e inovação', 'Originality and innovation'],
  ['methodology', 'Rigor metodológico e científico', 'Methodological and scientific rigour'],
  [
    'clinicalRelevance',
    'Relevância e aplicabilidade clínica',
    'Clinical relevance and applicability',
  ],
  [
    'impact',
    'Impacto e contributo para a prática clínica e para a investigação',
    'Impact and contribution to clinical practice and research',
  ],
];
export const MAX_REVIEWERS = 3;
export const REVIEW_COMMENT_LIMIT = 4000;
export const reviewableStatuses = ['submitted', 'under_review', 'revisions'];
export const reviewStatusLabels = {
  submitted: ['Por avaliar', 'Awaiting review'],
  under_review: ['Em avaliação', 'Under review'],
  revisions: ['Revisões pedidas', 'Revisions requested'],
  accepted: ['Aceite', 'Accepted'],
  rejected: ['Não aceite', 'Not accepted'],
};
export const reviewAbstractLabels = [
  ['introduction', 'Introdução', 'Introduction'],
  ['objective', 'Objetivo', 'Objective'],
  ['methods', 'Métodos', 'Methods'],
  ['results', 'Resultados', 'Results'],
  ['conclusion', 'Conclusão', 'Conclusion'],
  ['keywords', 'Palavras-chave', 'Keywords'],
];
export function reviewerEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
export function validReviewerEmail(value) {
  return /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value) && value.length <= 254;
}
export function emptyReviewScores() {
  return Object.fromEntries(reviewCriteria.map(([key]) => [key, '']));
}
export function parseReviewScores(input) {
  const scores = {};
  for (const [key] of reviewCriteria) {
    const raw = input?.[key];
    if (raw === null || raw === undefined || String(raw).trim() === '')
      throw new Error('review/incomplete-scores');
    const score = Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error('review/invalid-score');
    scores[key] = Math.round(score * 100) / 100;
  }
  return scores;
}
export function reviewTotal(input) {
  try {
    return (
      Math.round(Object.values(parseReviewScores(input)).reduce((sum, n) => sum + n, 0) * 100) / 100
    );
  } catch {
    return null;
  }
}
export function reviewMean(works) {
  const totals = works
    .filter((w) => w.active && w.evaluation)
    .map((w) => reviewTotal(w.evaluation.scores))
    .filter((t) => t !== null);
  return totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length / 5 : null;
}
// Deliberate allowlist: never spread a submission into a reviewer's document.
export function anonymousReviewContent(submission, id) {
  return {
    eventId: 'circ-2027',
    submissionId: id,
    code: submission.code || id,
    title: submission.title || '',
    type: submission.type || '',
    abstract: submission.abstract || '',
    abstractSections: submission.abstractSections
      ? Object.fromEntries(
          reviewAbstractLabels.map(([key]) => [
            key,
            String(submission.abstractSections[key] || ''),
          ]),
        )
      : null,
    status: submission.status,
    isTest: submission.isTest === true,
  };
}
export function acceptedReviewIdentity(submission) {
  return {
    authors: submission.authors || '',
    contactName: submission.contactName || '',
    affiliation: submission.affiliation || '',
  };
}
export function reviewErrorMessage(error, en = false) {
  const messages = {
    'review/conflict': [
      'O trabalho ou a avaliação mudou. Atualize a página antes de guardar.',
      'The submission or evaluation changed. Refresh before saving.',
    ],
    'review/closed': [
      'A avaliação está encerrada. O superavaliador pode reabrir o trabalho.',
      'Review is closed. The supervisor can reopen the submission.',
    ],
    'review/self-review': [
      'Não pode avaliar o seu próprio trabalho.',
      'You cannot review your own submission.',
    ],
    'review/invalid-reviewer': [
      'Indique um nome e um email válido para o revisor.',
      'Enter a name and a valid email for the reviewer.',
    ],
    'review/invalid-assignment': [
      'Selecione até três revisores ativos.',
      'Select up to three active reviewers.',
    ],
    'review/disabled': [
      'O módulo de avaliação ainda não está ativo.',
      'The review module is not active yet.',
    ],
    'review/incomplete-scores': [
      'Preencha os cinco critérios. A pontuação zero é válida.',
      'Complete all five criteria. Zero is a valid score.',
    ],
    'review/invalid-score': [
      'Cada pontuação deve estar entre 0 e 10.',
      'Each score must be between 0 and 10.',
    ],
    'review/comment-too-long': [
      'O comentário pode ter até 4000 caracteres.',
      'Comments can contain up to 4000 characters.',
    ],
  };
  return (
    messages[error?.message]?.[en ? 1 : 0] ||
    (en
      ? 'Could not save. Check your connection and permissions, then try again.'
      : 'Não foi possível guardar. Verifique a ligação e as permissões e tente novamente.')
  );
}
