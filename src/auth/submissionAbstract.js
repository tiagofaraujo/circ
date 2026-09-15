export const abstractSectionKeys = [
  'introduction',
  'objective',
  'methods',
  'results',
  'conclusion',
  'keywords',
];

export function normalizeAbstractSections(value = {}) {
  return {
    introduction: String(value.introduction || '').trim(),
    objective: String(value.objective || '').trim(),
    methods: String(value.methods || '').trim(),
    results: String(value.results || '').trim(),
    conclusion: String(value.conclusion || '').trim(),
    keywords: String(value.keywords || '').trim(),
  };
}

export function hasCompleteAbstractSections(value = {}) {
  const sections = normalizeAbstractSections(value);
  return abstractSectionKeys.every((key) => sections[key].length > 0);
}

export function abstractSectionsToText(value = {}) {
  const sections = normalizeAbstractSections(value);
  const labels = {
    introduction: 'INTRODUÇÃO',
    objective: 'OBJETIVO',
    methods: 'MÉTODOS',
    results: 'RESULTADOS',
    conclusion: 'CONCLUSÃO',
    keywords: 'PALAVRAS-CHAVE',
  };

  return abstractSectionKeys
    .map((key) => `${labels[key]}\n${sections[key]}`)
    .join('\n\n');
}
