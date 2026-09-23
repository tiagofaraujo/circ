import React, { useEffect, useRef, useState } from 'react';
import { loadStudentProof } from '../auth/studentVerificationStore';
import { studentErrorMessage } from '../auth/studentVerification';
import StudentProofPreview from './StudentProofPreview';

// The parent keys this component by account and document revision. A replaced
// document or changed account cannot retain the previous private preview.
export default function StudentUploadedProof({ userId, revision, submittedAt, en = false }) {
  const [proof, setProof] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const open = async () => {
    if (loading) return;
    if (proof) { setProof(null); return; }
    setLoading(true); setError('');
    try {
      const uploaded = await loadStudentProof({ id: userId, revision });
      if (active.current) setProof(uploaded);
    } catch (err) {
      if (active.current) setError(studentErrorMessage(err, en));
    } finally {
      if (active.current) setLoading(false);
    }
  };
  const date = submittedAt?.toDate?.();
  return <div className="student-upload-receipt">
    <p><strong>{en ? 'Document received' : 'Comprovativo recebido'}</strong>{date && <> · <time dateTime={date.toISOString()}>{date.toLocaleString(en ? 'en-GB' : 'pt-PT')}</time></>}</p>
    <button type="button" disabled={loading} onClick={open} aria-expanded={Boolean(proof)}>
      {loading ? (en ? 'Loading document…' : 'A carregar comprovativo…')
        : proof ? (en ? 'Close document' : 'Fechar comprovativo')
          : (en ? 'View submitted document' : 'Ver comprovativo enviado')}
    </button>
    <StudentProofPreview proof={proof} en={en} />
    {error && <p role="alert" className="student-verification__error">{error}</p>}
  </div>;
}
