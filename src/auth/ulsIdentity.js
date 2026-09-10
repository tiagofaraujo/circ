export const ULS_EVENT_ID = 'circ-2027';
export const ULS_MATCH_METHOD = 'mec-name-match';

function validationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function normalizeUlsName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((part) => part && !['D', 'DA', 'DAS', 'DE', 'DO', 'DOS'].includes(part))
    .join(' ');
}

export function normalizeUlsMec(value) {
  const mec = String(value || '').trim();
  if (!/^\d{1,12}$/.test(mec)) throw validationError('uls/invalid-mec');
  return mec;
}

export function buildUlsIdentity(mecValue, nameValue) {
  const mec = normalizeUlsMec(mecValue);
  const nameKey = normalizeUlsName(nameValue);
  if (nameKey.length < 5 || nameKey.length > 160) throw validationError('uls/missing-profile-name');
  return { mec, nameKey };
}
