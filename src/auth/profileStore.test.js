import { canonicalizeProfileName } from './profileStore';

describe('participant profile name storage', () => {
  test('trims and collapses whitespace before persistence', () => {
    expect(canonicalizeProfileName('  Tiago   Fernando\nConde  de Araújo  '))
      .toBe('Tiago Fernando Conde de Araújo');
  });

  test('returns an empty value for a whitespace-only name', () => {
    expect(canonicalizeProfileName('   \n\t  ')).toBe('');
  });
});
