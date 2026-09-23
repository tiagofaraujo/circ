import { isStudentApproved, prepareStudentProof, STUDENT_PROOF_MAX_BASE64, validateStudentProof } from './studentVerification';

const approved = { userId: 'student', eventId: 'circ-2027', academicYear: '2026/2027', profileName: 'Maria Leonor de Sá', status: 'approved' };
test('approval is tied to account, event, academic year and exact saved profile name', () => {
  expect(isStudentApproved(approved, 'student', approved.profileName)).toBe(true);
  expect(isStudentApproved(approved, 'other', approved.profileName)).toBe(false);
  expect(isStudentApproved(approved, 'student', 'Maria de Sá')).toBe(false);
  for (const change of [{ status: 'pending' }, { status: 'rejected' }, { status: 'correction' }, { eventId: 'circ-2028' }, { academicYear: '2025/2026' }]) {
    expect(isStudentApproved({ ...approved, ...change }, 'student', approved.profileName)).toBe(false);
  }
});
test('only bounded JPEG and PDF payloads can become private proofs', () => {
  expect(validateStudentProof({ mimeType: 'image/jpeg', base64: '/9j/QUJDREVGR0g=', unwanted: 'discard' })).toEqual({ mimeType: 'image/jpeg', base64: '/9j/QUJDREVGR0g=' });
  expect(validateStudentProof({ mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' }).mimeType).toBe('application/pdf');
  expect(validateStudentProof({ mimeType: 'image/jpeg', base64: '/9j/' + 'A'.repeat(STUDENT_PROOF_MAX_BASE64 - 4) }).base64).toHaveLength(STUDENT_PROOF_MAX_BASE64);
  for (const proof of [null, { mimeType: 'text/html', base64: '/9j/QUJDREVGR0g=' }, { mimeType: 'image/jpeg', base64: 'NOTANIMAGE==' }, { mimeType: 'image/jpeg', base64: '/9j/' + 'A'.repeat(STUDENT_PROOF_MAX_BASE64) }]) {
    expect(() => validateStudentProof(proof)).toThrow();
  }
});
test('PDF preparation preserves bytes and rejects unsupported or oversized input', async () => {
  await expect(prepareStudentProof(new File(['%PDF-1.4\n'], 'document.pdf', { type: 'application/pdf' })))
    .resolves.toEqual({ mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' });
  await expect(prepareStudentProof(new File(['<svg/>'], 'document.svg', { type: 'image/svg+xml' }))).rejects.toMatchObject({ code: 'student/invalid-file' });
  await expect(prepareStudentProof({ type: 'application/pdf', size: 307201 })).rejects.toMatchObject({ code: 'student/file-too-large' });
  await expect(prepareStudentProof({ type: 'image/jpeg', size: 10485761 })).rejects.toMatchObject({ code: 'student/file-too-large' });
});
test('PDFs with missing or generic device MIME types are identified from their bytes', async () => {
  for (const type of ['', 'application/octet-stream']) {
    await expect(prepareStudentProof(new File(['%PDF-1.4\n'], 'matricula.pdf', { type })))
      .resolves.toEqual({ mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' });
    await expect(prepareStudentProof(new File(['%PDF-' + 'a'.repeat(307200)], 'matricula.pdf', { type })))
      .rejects.toMatchObject({ code: 'student/file-too-large' });
  }
});
test('a file extension or declared MIME type cannot disguise unsupported contents', async () => {
  for (const type of ['', 'application/octet-stream', 'application/pdf']) {
    await expect(prepareStudentProof(new File(['<html>not a document</html>'], 'matricula.pdf', { type })))
      .rejects.toMatchObject({ code: 'student/invalid-file' });
  }
  await expect(prepareStudentProof(new File(['%PDF-1.4\n'], 'matricula.jpg', { type: 'image/jpeg' })))
    .rejects.toMatchObject({ code: 'student/invalid-file' });
});
