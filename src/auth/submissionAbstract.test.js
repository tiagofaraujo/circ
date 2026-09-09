import {
  abstractSectionsToText,
  hasCompleteAbstractSections,
  normalizeAbstractSections,
} from './submissionAbstract';

const completeAbstract = {
  introduction: 'Contexto do estudo.',
  objective: 'Avaliar o objetivo principal.',
  methods: 'Estudo observacional com análise de imagem.',
  results: 'Foram observados resultados relevantes.',
  conclusion: 'Os resultados apoiam a hipótese.',
  keywords: 'Radiologia; Ressonância magnética; Diagnóstico',
};

describe('submissionAbstract', () => {
  test('normalizes every scientific section', () => {
    expect(normalizeAbstractSections(completeAbstract)).toEqual(completeAbstract);
  });

  test('requires all six abstract fields', () => {
    expect(hasCompleteAbstractSections(completeAbstract)).toBe(true);
    expect(hasCompleteAbstractSections({ ...completeAbstract, results: '' })).toBe(false);
  });

  test('creates a backwards-compatible plain-text abstract', () => {
    const text = abstractSectionsToText(completeAbstract);
    expect(text).toContain('INTRODUÇÃO\nContexto do estudo.');
    expect(text).toContain('PALAVRAS-CHAVE\nRadiologia; Ressonância magnética; Diagnóstico');
  });
});
