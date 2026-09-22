import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { prepareStudentProof, studentErrorMessage, studentStatusLabels, STUDENT_ACADEMIC_YEAR } from '../../auth/studentVerification';
import { submitStudentVerification, withdrawStudentVerification } from '../../auth/studentVerificationStore';
import StudentProofPreview from '../StudentProofPreview';
import '../css/StudentVerification.css';

export default function StudentVerification({ user, verification, en = false }) {
  const [school, setSchool] = useState('');
  const [course, setCourse] = useState('');
  const [proof, setProof] = useState(null);
  const [legible, setLegible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
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
    if (!editing) { setSchool(data?.school || ''); setCourse(data?.course || ''); }
  }, [data?.school, data?.course, editing]);

  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    const sequence = ++fileSequence.current;
    setProof(null); setLegible(false); setError('');
    if (!file) return;
    setBusy(true);
    try {
      const next = await prepareStudentProof(file);
      if (active.current && sequence === fileSequence.current) setProof(next);
    } catch (err) {
      if (active.current && sequence === fileSequence.current) setError(studentErrorMessage(err, en));
    } finally {
      if (active.current && sequence === fileSequence.current) setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !proof || !legible) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await submitStudentVerification({ school, course, proof });
      if (!active.current) return;
      setEditing(false); setProof(null); setLegible(false);
      if (fileInput.current) fileInput.current.value = '';
      setMessage(en ? 'Document submitted. Awaiting review by the secretariat.' : 'Comprovativo enviado. Aguarde a análise pelo secretariado.');
    } catch (err) { if (active.current) setError(studentErrorMessage(err, en)); }
    finally { if (active.current) setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true); setError('');
    try {
      await withdrawStudentVerification();
      if (!active.current) return;
      setWithdrawing(false); setEditing(false); setProof(null); setLegible(false); setMessage('');
    } catch (err) { if (active.current) setError(studentErrorMessage(err, en)); }
    finally { if (active.current) setBusy(false); }
  };
  const showForm = !data || editing || verification.nameChanged || ['correction', 'rejected'].includes(data.status);

  return <section className="student-verification" aria-labelledby="student-verification-title">
    <h3 id="student-verification-title">{en ? 'Student eligibility' : 'Elegibilidade de estudante'}</h3>
    <p>{en ? `IMR or equivalent degree · Academic year ${STUDENT_ACADEMIC_YEAR} · No age limit.` : `Curso de IMR ou equivalente · Ano letivo ${STUDENT_ACADEMIC_YEAR} · Sem limite de idade.`}</p>
    {!user ? <p><Link to="/login">{en ? 'Sign in to send your document.' : 'Entre na sua conta para enviar o comprovativo.'}</Link></p>
      : !user.emailVerified ? <p>{en ? 'Verify your account email before submitting your document.' : 'Confirme o email da sua conta antes de enviar o comprovativo.'} <Link to="/conta/seguranca">{en ? 'Account security' : 'Segurança da conta'}</Link></p>
        : verification.status === 'error' ? <p role="alert">{en ? 'Could not load your request. Reload the page to try again.' : 'Não foi possível carregar o pedido. Recarregue a página para tentar novamente.'}</p>
          : verification.status !== 'ready' ? <p role="status">{en ? 'Loading your request…' : 'A carregar o pedido…'}</p>
            : <>
              {data && <div className={`student-verification__status is-${verification.approved ? 'approved' : data.status === 'approved' ? 'correction' : data.status}`} role="status">
                <strong>{verification.nameChanged ? (en ? 'Profile name changed: new review required' : 'Nome do perfil alterado: é necessária nova análise') : studentStatusLabels[data.status]?.[en ? 1 : 0]}</strong>
                <p>{data.school} · {data.course}</p>
                {data.reviewNote && <p>{data.reviewNote}</p>}
                {verification.approved && <p>{en ? 'You can now select your congress participation below.' : 'Já pode selecionar abaixo a sua participação no congresso.'}</p>}
              </div>}
              {showForm && <form onSubmit={submit} className="student-verification__form">
                <p>{en ? 'Full name saved in your profile: ' : 'Nome completo guardado no perfil: '}<strong>{verification.profileName || '—'}</strong> · <Link to="/conta/perfil">{en ? 'Review profile' : 'Rever perfil'}</Link></p>
                {data && <p>{en ? 'A new document replaces the previous one and requires a new approval.' : 'O novo comprovativo substitui o anterior e exige nova aprovação.'}</p>}
                <div className="student-verification__fields">
                  <label>{en ? 'School / institution' : 'Escola / instituição'}<input required minLength={2} maxLength={160} value={school} onChange={(e) => setSchool(e.target.value)} disabled={busy} /></label>
                  <label>{en ? 'Course' : 'Curso'}<input required minLength={2} maxLength={160} value={course} onChange={(e) => setCourse(e.target.value)} disabled={busy} /></label>
                </div>
                <p>{en ? 'Send an enrolment document showing your full name, school, course and academic year 2026/2027. You may hide unrelated information such as your address or tax number.' : 'Envie um comprovativo de matrícula com o nome completo, escola, curso e ano letivo 2026/2027. Pode ocultar informação desnecessária, como morada ou NIF.'}</p>
                <label>{en ? 'Enrolment document' : 'Comprovativo de matrícula'}<input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={chooseFile} disabled={busy} /></label>
                <small>{en ? 'PDF up to 300 KB, or JPG/PNG/WebP up to 10 MB. Images are compressed before sending.' : 'PDF até 300 KB, ou JPG/PNG/WebP até 10 MB. As imagens são comprimidas antes do envio.'}</small>
                <StudentProofPreview proof={proof} en={en} />
                {proof && <label className="student-verification__check"><input type="checkbox" checked={legible} onChange={(e) => setLegible(e.target.checked)} disabled={busy} />{en ? 'I checked that the prepared document is legible and contains the required information.' : 'Verifiquei que o documento preparado está legível e contém a informação necessária.'}</label>}
                <button type="submit" disabled={busy || !proof || !legible || !verification.profileName?.trim()}>{busy ? (en ? 'Preparing / sending…' : 'A preparar / enviar…') : (en ? 'Submit for review' : 'Enviar para análise')}</button>
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
