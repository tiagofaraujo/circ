import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { prepareStudentProof, studentErrorMessage, studentStatusLabels, STUDENT_ACADEMIC_YEAR, STUDENT_PROOF_ACCEPT } from '../../auth/studentVerification';
import { submitStudentVerification, withdrawStudentVerification } from '../../auth/studentVerificationStore';
import StudentProofPreview from '../StudentProofPreview';
import StudentUploadedProof from '../StudentUploadedProof';
import '../css/StudentVerification.css';

export default function StudentVerification({ user, verification, en = false }) {
  const [school, setSchool] = useState('');
  const [proof, setProof] = useState(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [legible, setLegible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [operation, setOperation] = useState('');
  const busy = Boolean(operation);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const fileSequence = useRef(0);
  const fileInput = useRef(null);
  const data = verification.data;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; fileSequence.current += 1; };
  }, []);
  useEffect(() => {
    if (!editing) setSchool(data?.school || '');
  }, [data?.school, editing]);

  const clearFile = () => {
    fileSequence.current += 1;
    setProof(null); setFileName(''); setLegible(false);
    if (fileInput.current) fileInput.current.value = '';
  };
  const chooseFiles = async (files) => {
    // Cancelling the picker retains the already prepared document.
    if (busy || !files?.length) return;
    const file = files[0];
    const count = files.length;
    clearFile(); setError(''); setMessage('');
    if (count !== 1) {
      setError(studentErrorMessage({ code: 'student/one-file-only' }, en));
      return;
    }
    const sequence = ++fileSequence.current;
    setOperation('prepare');
    try {
      const next = await prepareStudentProof(file);
      if (active.current && sequence === fileSequence.current) { setProof(next); setFileName(file.name); }
    } catch (err) {
      if (active.current && sequence === fileSequence.current) setError(studentErrorMessage(err, en));
    } finally {
      if (active.current && sequence === fileSequence.current) setOperation('');
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !proof || !legible) return;
    setOperation('submit'); setError(''); setMessage('');
    try {
      await submitStudentVerification({ school, proof });
      if (!active.current) return;
      setEditing(false); clearFile();
      setMessage(en ? 'Document submitted. Awaiting review by the secretariat.' : 'Comprovativo enviado. Aguarde a análise pelo secretariado.');
    } catch (err) { if (active.current) setError(studentErrorMessage(err, en)); }
    finally { if (active.current) setOperation(''); }
  };
  const withdraw = async () => {
    setOperation('withdraw'); setError('');
    try {
      await withdrawStudentVerification();
      if (!active.current) return;
      setWithdrawing(false); setEditing(false); clearFile(); setMessage('');
    } catch (err) { if (active.current) setError(studentErrorMessage(err, en)); }
    finally { if (active.current) setOperation(''); }
  };
  const showForm = !data || editing || verification.nameChanged || ['correction', 'rejected'].includes(data.status);

  return <section className="student-verification" aria-labelledby="student-verification-title">
    <h3 id="student-verification-title">{en ? 'Student eligibility' : 'Elegibilidade de estudante'}</h3>
    <p>{en ? `Academic year ${STUDENT_ACADEMIC_YEAR} · No age limit.` : `Ano letivo ${STUDENT_ACADEMIC_YEAR} · Sem limite de idade.`}</p>
    {!user ? <p><Link to="/login">{en ? 'Sign in to send your document.' : 'Entre na sua conta para enviar o comprovativo.'}</Link></p>
      : !user.emailVerified ? <p>{en ? 'Verify your account email before submitting your document.' : 'Confirme o email da sua conta antes de enviar o comprovativo.'} <Link to="/conta/seguranca">{en ? 'Account security' : 'Segurança da conta'}</Link></p>
        : verification.status === 'error' ? <p role="alert">{en ? 'Could not load your request. Reload the page to try again.' : 'Não foi possível carregar o pedido. Recarregue a página para tentar novamente.'}</p>
          : verification.status !== 'ready' ? <p role="status">{en ? 'Loading your request…' : 'A carregar o pedido…'}</p>
            : <>
              {data && <div className={`student-verification__status is-${verification.approved ? 'approved' : data.status === 'approved' ? 'correction' : data.status}`} role="status">
                <strong>{verification.nameChanged ? (en ? 'Profile name changed: new review required' : 'Nome do perfil alterado: é necessária nova análise') : studentStatusLabels[data.status]?.[en ? 1 : 0]}</strong>
                <p>{data.school}</p>
                {data.proofAvailable && <StudentUploadedProof key={`${user.uid}:${data.revision}`} userId={user.uid} revision={data.revision} submittedAt={data.submittedAt} en={en} />}
                {data.proofAvailable === false && <p>{en ? 'The document was deleted after review.' : 'O comprovativo foi apagado após a análise.'}</p>}
                {data.reviewNote && <p>{data.reviewNote}</p>}
                {verification.approved && <p>{en ? 'You can now select your congress participation below.' : 'Já pode selecionar abaixo a sua participação no congresso.'}</p>}
              </div>}
              {showForm && <form onSubmit={submit} className="student-verification__form">
                <p>{en ? 'Full name saved in your profile: ' : 'Nome completo guardado no perfil: '}<strong>{verification.profileName || '—'}</strong> · <Link to="/conta/perfil">{en ? 'Review profile' : 'Rever perfil'}</Link></p>
                {data && <p>{en ? 'A new document replaces the previous one and requires a new approval.' : 'O novo comprovativo substitui o anterior e exige nova aprovação.'}</p>}
                <div className="student-verification__fields">
                  <label>{en ? 'School / institution' : 'Escola / instituição'}<input required minLength={2} maxLength={160} value={school} onChange={(e) => setSchool(e.target.value)} disabled={busy} /></label>
                </div>
                <p>{en ? 'Send an enrolment document showing your full name, school and academic year 2026/2027. You may hide unrelated information such as your address or tax number.' : 'Envie um comprovativo de matrícula com o nome completo, escola e ano letivo 2026/2027. Pode ocultar informação desnecessária, como morada ou NIF.'}</p>
                <div className={`student-upload${dragging ? ' is-dragging' : ''}`} role="group" aria-label={en ? 'Document upload' : 'Upload do comprovativo'} aria-busy={busy}
                  onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFiles(event.dataTransfer.files); }}>
                  <label htmlFor="student-proof-file">{en ? 'Enrolment document' : 'Comprovativo de matrícula'}</label>
                  <input id="student-proof-file" ref={fileInput} type="file" hidden accept={STUDENT_PROOF_ACCEPT} onChange={(event) => chooseFiles(event.target.files)} disabled={busy} />
                  <button type="button" disabled={busy} aria-describedby="student-proof-limits" onClick={() => fileInput.current?.click()}>{proof ? (en ? 'Change file' : 'Trocar ficheiro') : (en ? 'Select file' : 'Selecionar ficheiro')}</button>
                  <span>{en ? 'or drag a PDF or photograph here' : 'ou arraste um PDF ou uma fotografia para aqui'}</span>
                  <small id="student-proof-limits">{en ? 'PDF up to 300 KB, or JPG/PNG/WebP up to 10 MB. Images are compressed before sending.' : 'PDF até 300 KB, ou JPG/PNG/WebP até 10 MB. As imagens são comprimidas antes do envio.'}</small>
                  {operation === 'prepare' && <p role="status">{en ? 'Preparing file…' : 'A preparar ficheiro…'}</p>}
                  {proof && <div className="student-upload__selected">
                    <p role="status"><strong>{fileName}</strong><br />{en ? 'File ready. Submit it for review below.' : 'Ficheiro preparado. Falta enviar para análise.'}</p>
                    <button type="button" disabled={busy} onClick={() => { clearFile(); setError(''); }}>{en ? 'Remove selected file' : 'Remover ficheiro selecionado'}</button>
                  </div>}
                </div>
                <StudentProofPreview proof={proof} en={en} />
                {proof && <label className="student-verification__check"><input type="checkbox" checked={legible} onChange={(e) => setLegible(e.target.checked)} disabled={busy} />{en ? 'I checked that the prepared document is legible and contains the required information.' : 'Verifiquei que o documento preparado está legível e contém a informação necessária.'}</label>}
                <button type="submit" disabled={busy || !proof || !legible || !verification.profileName?.trim()}>{operation === 'submit' ? (en ? 'Sending document…' : 'A enviar comprovativo…') : (en ? 'Submit for review' : 'Enviar para análise')}</button>
              </form>}
              {data && <div className="student-verification__actions">
                {!showForm && <button type="button" disabled={busy} onClick={() => setEditing(true)}>{en ? 'Replace document' : 'Substituir comprovativo'}</button>}
                <button type="button" disabled={busy} onClick={() => setWithdrawing(true)}>{en ? 'Withdraw request and delete document' : 'Retirar pedido e apagar comprovativo'}</button>
              </div>}
              {withdrawing && <div className="student-verification__confirm">
                <p>{en ? 'This deletes the request and document and removes student eligibility from your account. Continue?' : 'Esta ação apaga o pedido e o comprovativo e retira a elegibilidade de estudante da conta. Continuar?'}</p>
                <button type="button" disabled={busy} onClick={withdraw}>{en ? 'Confirm removal' : 'Confirmar remoção'}</button>{' '}
                <button type="button" disabled={busy} onClick={() => setWithdrawing(false)}>{en ? 'Cancel' : 'Cancelar'}</button>
              </div>}
            </>}
    {error && <p className="student-verification__error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <p className="student-verification__privacy">{en ? 'Your document is private and accessible only to you and authorised secretariat staff.' : 'O comprovativo é privado e acessível apenas a si e ao secretariado autorizado.'} <Link to="/privacidade">{en ? 'Privacy' : 'Privacidade'}</Link></p>
  </section>;
}
