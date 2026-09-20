import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { loadStudentProof, loadStudentRequests, removeReviewedStudentProof, reviewStudentRequest } from '../auth/studentVerificationStore';
import { studentErrorMessage, studentStatusLabels } from '../auth/studentVerification';
import AdminModuleNav from '../components/AdminModuleNav';
import StudentProofPreview from '../components/StudentProofPreview';
import '../admin.css';
import '../components/css/StudentVerification.css';

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [proof, setProof] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [purge, setPurge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const listGeneration = useRef(0);
  const proofGeneration = useRef(0);
  const active = useRef(true);

  const loadPage = useCallback(async (after = null) => {
    const generation = ++listGeneration.current;
    setLoading(true); setError('');
    if (!after) { setItems([]); setSelected(null); setCursor(null); }
    try {
      const result = await loadStudentRequests(status, after);
      if (!active.current || generation !== listGeneration.current) return;
      setItems((previous) => [...new Map([...(after ? previous : []), ...result.items].map((item) => [item.id, item])).values()]);
      setCursor(result.cursor);
    } catch (err) {
      if (active.current && generation === listGeneration.current) setError(studentErrorMessage(err));
    } finally {
      if (active.current && generation === listGeneration.current) setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; listGeneration.current += 1; proofGeneration.current += 1; };
  }, []);
  useEffect(() => { loadPage(); }, [loadPage]);
  useEffect(() => {
    const generation = ++proofGeneration.current;
    setProof(null); setChecked(false); setNote(''); setPurge(false); setProofLoading(false);
    if (!selected?.proofAvailable) return;
    setProofLoading(true);
    loadStudentProof(selected).then((value) => {
      if (active.current && generation === proofGeneration.current) setProof(value);
    }).catch((err) => {
      if (active.current && generation === proofGeneration.current) setError(studentErrorMessage(err));
    }).finally(() => {
      if (active.current && generation === proofGeneration.current) setProofLoading(false);
    });
  }, [selected]);

  const act = async (decision) => {
    if (!selected || busy || (decision === 'approved' && (!checked || !proof))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (decision === 'purge') await removeReviewedStudentProof(selected);
      else await reviewStudentRequest(selected, decision, note);
      if (!active.current) return;
      setMessage(decision === 'purge' ? 'Comprovativo apagado. A decisão foi conservada.' : 'Decisão guardada. O estado já está disponível na conta do estudante.');
      await loadPage();
    } catch (err) {
      if (active.current) setError(err?.code === 'permission-denied'
        ? 'Não foi possível guardar a decisão. Atualize a lista: o nome do perfil ou as permissões podem ter mudado.'
        : studentErrorMessage(err));
    } finally { if (active.current) setBusy(false); }
  };
  const ownRequest = selected?.id === user?.uid;
  const decisionDisabled = busy || ownRequest || proofLoading;

  return <main className="page admin-page">
    <AdminModuleNav />
    <section className="student-verification">
      <h1>Validação de estudantes</h1>
      <p>Confirme o nome completo, a escola, o curso de IMR ou equivalente e a matrícula em 2026/2027. Não existe limite de idade.</p>
      <div className="student-verification__actions">
        <label>Estado<select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos</option>
          {Object.entries(studentStatusLabels).map(([value, labels]) => <option key={value} value={value}>{labels[0]}</option>)}
        </select></label>
        <button type="button" disabled={busy || loading} onClick={() => loadPage()}>Atualizar lista</button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="student-verification__error">{error}</p>}
      {loading && <p role="status">A carregar pedidos…</p>}
      {!loading && !items.length && <p>Sem pedidos neste estado.</p>}
      <div className="student-review-layout">
        <div className="student-review-list" aria-label="Pedidos de estudantes">
          {items.map((item) => <button key={item.id} type="button" disabled={busy} aria-pressed={selected?.id === item.id} onClick={() => { setError(''); setProof(null); setChecked(false); setSelected(item); }}>
            <strong>{item.profileName}</strong><small>{item.school} · {item.course}</small>
            <small>{studentStatusLabels[item.status]?.[0]}</small>
          </button>)}
          {cursor && <button type="button" disabled={loading || busy} onClick={() => loadPage(cursor)}>Carregar mais 25</button>}
        </div>
        {selected && <article className="student-review-details">
          <h2>{selected.profileName}</h2>
          <p>{selected.email}<br />{selected.school}<br />{selected.course} · {selected.academicYear}</p>
          <p>{studentStatusLabels[selected.status]?.[0]} · Versão {selected.revision}</p>
          {selected.reviewedBy && <p>Última decisão: {selected.reviewedBy.email}{selected.reviewedAt?.toDate && ` · ${selected.reviewedAt.toDate().toLocaleString('pt-PT')}`}</p>}
          {selected.reviewNote && <p>Nota anterior: {selected.reviewNote}</p>}
          {proofLoading && <p role="status">A carregar comprovativo privado…</p>}
          {!selected.proofAvailable && <p>O comprovativo já foi apagado. Uma nova aprovação exige novo envio pelo estudante.</p>}
          <StudentProofPreview proof={proof} />
          {proof && <label className="student-verification__check"><input type="checkbox" checked={checked} disabled={busy || ownRequest} onChange={(e) => setChecked(e.target.checked)} />Conferi o documento: corresponde ao nome do perfil acima, à escola, ao curso elegível e ao ano letivo 2026/2027.</label>}
          {ownRequest && <p role="note">O seu próprio pedido tem de ser analisado por outro membro do secretariado.</p>}
          <label>Nota para o estudante<textarea maxLength={1000} rows={4} value={note} disabled={busy || ownRequest} onChange={(e) => setNote(e.target.value)} /></label>
          <small>Para pedir correção ou recusar, indique um motivo claro com pelo menos 5 caracteres.</small>
          <div className="student-verification__actions">
            <button type="button" disabled={decisionDisabled || !proof || !checked} onClick={() => act('approved')}>Aprovar</button>
            <button type="button" disabled={decisionDisabled || note.trim().length < 5} onClick={() => act('correction')}>Pedir correção</button>
            <button type="button" disabled={decisionDisabled || note.trim().length < 5} onClick={() => act('rejected')}>Recusar</button>
          </div>
          {selected.status !== 'pending' && selected.proofAvailable && <button type="button" disabled={busy} onClick={() => setPurge(true)}>Apagar comprovativo após análise</button>}
          {purge && <div className="student-verification__confirm"><p>Apagar o ficheiro definitivamente e conservar a decisão e os dados do pedido?</p><button type="button" disabled={busy} onClick={() => act('purge')}>Confirmar eliminação</button>{' '}<button type="button" disabled={busy} onClick={() => setPurge(false)}>Cancelar</button></div>}
        </article>}
      </div>
    </section>
  </main>;
}
