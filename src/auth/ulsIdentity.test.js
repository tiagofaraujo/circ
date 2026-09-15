import { buildUlsIdentity, normalizeUlsMec, normalizeUlsName } from './ulsIdentity';

describe('ULS identity normalisation', () => {
  test('matches common Portuguese spelling, accents and particles', () => {
    expect(normalizeUlsName(' Ana Filipa de Sá ')).toBe('ANA FILIPA SA');
    expect(normalizeUlsName('ANA FILIPA SA')).toBe('ANA FILIPA SA');
  });

  test('normalises punctuation and repeated spaces consistently', () => {
    expect(normalizeUlsName("Maria  d'Ávila-Santos"))
      .toBe('MARIA AVILA SANTOS');
  });

  test('accepts a numeric MEC without changing it', () => {
    expect(normalizeUlsMec(' 7315 ')).toBe('7315');
    expect(buildUlsIdentity('7315', 'Ana Filipa de Sá')).toEqual({
      mec: '7315',
      nameKey: 'ANA FILIPA SA',
    });
  });

  test.each(['', '42A6', '1234567890123'])('rejects invalid MEC %p', (mec) => {
    expect(() => normalizeUlsMec(mec)).toThrow('uls/invalid-mec');
  });

  test('rejects a missing full name', () => {
    expect(() => buildUlsIdentity('7315', 'de')).toThrow('uls/missing-profile-name');
  });
});
