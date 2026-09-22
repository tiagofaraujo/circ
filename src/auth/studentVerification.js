export const STUDENT_EVENT_ID = 'circ-2027';
export const STUDENT_ACADEMIC_YEAR = '2026/2027';
// Event scope for the existing Firestore schema, not a qualification supplied
// or verified by the applicant. Eligibility still requires document review.
export const STUDENT_COURSE = 'Radiologia / Imagem Médica e Radioterapia';
export const STUDENT_PROOF_MAX_BYTES = 300 * 1024;
export const STUDENT_PROOF_MAX_BASE64 = 409600;

export const studentStatusLabels = {
  pending: ['Comprovativo em análise', 'Document under review'],
  approved: ['Tarifa de estudante aprovada', 'Student rate approved'],
  correction: ['Correção solicitada', 'Correction requested'],
  rejected: ['Pedido recusado', 'Request declined'],
};

export function studentError(code) {
  return Object.assign(new Error(code), { code: `student/${code}` });
}

export function isStudentApproved(data, uid, profileName) {
  return Boolean(data && uid && data.userId === uid
    && data.eventId === STUDENT_EVENT_ID && data.academicYear === STUDENT_ACADEMIC_YEAR
    && data.status === 'approved' && typeof profileName === 'string'
    && profileName.trim().length >= 5 && data.profileName === profileName);
}

export function validateStudentProof(proof) {
  const { mimeType, base64 } = proof || {};
  if (typeof base64 !== 'string') throw studentError('invalid-file');
  if (base64.length > STUDENT_PROOF_MAX_BASE64) throw studentError('file-too-large');
  if (base64.length < 8 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    || !((mimeType === 'application/pdf' && base64.startsWith('JVBERi0'))
      || (mimeType === 'image/jpeg' && base64.startsWith('/9j/')))) {
    throw studentError('invalid-file');
  }
  return { mimeType, base64 };
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(studentError('invalid-file'));
    reader.readAsDataURL(file);
  });
}

export async function prepareStudentProof(file) {
  if (!file || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw studentError('invalid-file');
  }
  const isPdf = file.type === 'application/pdf';
  if (file.size > (isPdf ? STUDENT_PROOF_MAX_BYTES : 10 * 1024 * 1024)) {
    throw studentError('file-too-large');
  }
  const url = await readFile(file);
  if (isPdf) return validateStudentProof({ mimeType: file.type, base64: url.split(',')[1] });
  const picture = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(studentError('invalid-file'));
    img.src = url;
  });
  if (!picture.naturalWidth || !picture.naturalHeight) throw studentError('invalid-file');
  // Re-encode photographs locally: bound upload size and discard original metadata.
  const canvas = document.createElement('canvas');
  for (const edge of [2000, 1600, 1280]) {
    const scale = Math.min(1, edge / Math.max(picture.naturalWidth, picture.naturalHeight));
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw studentError('invalid-file');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.75, 0.62]) {
      const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (base64.length <= STUDENT_PROOF_MAX_BASE64) {
        return validateStudentProof({ mimeType: 'image/jpeg', base64 });
      }
    }
  }
  throw studentError('file-too-large');
}

export function studentErrorMessage(error, en = false) {
  const messages = {
    'student/invalid-file': ['Escolha um PDF ou uma imagem JPG, PNG ou WebP válida.', 'Choose a valid PDF, JPG, PNG or WebP image.'],
    'student/file-too-large': ['O PDF deve ter até 300 KB. Para fotografias, escolha uma imagem até 10 MB com o documento bem enquadrado.', 'PDFs must be at most 300 KB. For photographs, choose an image up to 10 MB tightly framing the document.'],
    'student/missing-profile-name': ['Guarde primeiro o nome completo no perfil My CIRC.', 'Save your full name in your My CIRC profile first.'],
    'student/missing-details': ['Indique a escola / instituição (2 a 160 caracteres).', 'Enter your school / institution (2 to 160 characters).'],
    'student/email-not-verified': ['Confirme o email da sua conta antes de enviar o comprovativo.', 'Verify your account email before submitting your document.'],
    'student/conflict': ['O pedido mudou. Atualize a lista e reveja o comprovativo antes de continuar.', 'The request has changed. Refresh and review the document again.'],
    'student/too-soon': ['Aguarde um minuto entre envios de comprovativos.', 'Wait one minute between document submissions.'],
    'student/note-required': ['Indique o motivo da correção ou recusa (5 a 1000 caracteres).', 'Explain the correction or refusal (5 to 1000 characters).'],
  };
  return (messages[error?.code] || ['Não foi possível concluir. Verifique a ligação e tente novamente.', 'Could not complete this action. Check your connection and try again.'])[en ? 1 : 0];
}
