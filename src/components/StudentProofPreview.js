import React, { useEffect, useState } from 'react';

export default function StudentProofPreview({ proof, en = false }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!proof) { setUrl(''); return undefined; }
    const bytes = Uint8Array.from(atob(proof.base64), (char) => char.charCodeAt(0));
    const localUrl = URL.createObjectURL(new Blob([bytes], { type: proof.mimeType }));
    setUrl(localUrl);
    return () => URL.revokeObjectURL(localUrl);
  }, [proof]);
  if (!proof || !url) return null;
  const pdf = proof.mimeType === 'application/pdf';
  return <div className="student-proof-preview">
    {!pdf && <img src={url} alt={en ? 'Enrolment document preview' : 'Pré-visualização do comprovativo de matrícula'} />}
    <a href={url} download={`comprovativo-circ-2027.${pdf ? 'pdf' : 'jpg'}`}>
      {en ? 'Download document to check legibility' : 'Descarregar comprovativo para verificar a legibilidade'}
    </a>
  </div>;
}
