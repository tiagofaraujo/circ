import React, { useEffect, useRef, useState } from 'react';

export const transferMessages = {
  'transfer-invalid-proof': ['Use um PDF, JPG ou PNG válido, com um nome simples.', 'Use a valid PDF, JPG or PNG with a simple filename.'],
  'transfer-proof-too-large': ['O comprovativo excede 500 KB.', 'The proof exceeds 500 KB.'],
  'transfer-proof-limit': ['Este pedido já tem cinco versões de comprovativo. O histórico foi conservado.', 'This order already has five proof versions. History is retained.'],
  'transfer-invalid-state': ['A ação não está disponível neste estado. Atualize o teste.', 'This action is unavailable in this state. Refresh the test.'],
  'transfer-stale-review': ['O comprovativo mudou. Atualize o teste e analise a última versão.', 'The proof changed. Refresh the test and review the latest version.'],
  'transfer-proof-required': ['É necessário enviar um comprovativo antes da validação.', 'Upload a proof before reviewing.'],
  'transfer-reason-required': ['Indique um motivo entre 5 e 500 caracteres.', 'Enter a reason between 5 and 500 characters.'],
  'transfer-credit-required': ['Confirme a análise do comprovativo e a conferência do crédito simulado.', 'Confirm proof review and the simulated credit check.'],
  'transfer-amount-mismatch': ['O valor conferido deve coincidir exatamente com o total do pedido. A inscrição não foi confirmada.', 'The checked amount must exactly match the order total. The registration was not confirmed.'],
  'transfer-credit-used': ['Esse movimento simulado já foi utilizado noutro pedido.', 'That simulated bank entry was already used by another order.'],
  'transfer-invalid-credit': ['Use uma referência TESTE- seguida de letras/números/hífens e uma data válida, não futura.', 'Use a TESTE- reference followed by letters/numbers/hyphens and a valid non-future date.'],
};
export const transferLabels = {
  awaiting_proof: ['A aguardar comprovativo de teste', 'Awaiting test proof'],
  under_review: ['Comprovativo recebido — em análise', 'Proof received — under review'],
  rejected: ['Comprovativo recusado — necessita de correção', 'Proof rejected — correction needed'],
  cancelled: ['Pedido de transferência de teste cancelado', 'Test transfer request cancelled'],
  confirmed: ['Transferência simulada validada pela organização', 'Simulated transfer validated by the organiser'],
};
export default function SandboxBankTransfer({ sessionId, order, en, api, run, busy, onUpdate }) {
  const t = (pt, english) => en ? english : pt;
  const transfer = order.bankTransfer;
  const latestId = transfer.proofs.at(-1)?.id || null;
  const [file, setFile] = useState(null);
  const [sample, setSample] = useState(false);
  const [proofReviewed, setReviewed] = useState(false);
  const [creditConfirmed, setCreditConfirmed] = useState(false);
  const [amount, setAmount] = useState((order.amountCents / 100).toFixed(2));
  const [creditReference, setReference] = useState(`TESTE-${order.id}`);
  const [bookingDate, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const uploadId = useRef(null), decisionId = useRef(null);
  const path = `sessions/${sessionId}/orders/${order.id}`;
  useEffect(() => { setReviewed(false); setCreditConfirmed(false); decisionId.current = null; }, [latestId]);
  const changeFile = event => { setFile(event.target.files?.[0] || null); uploadId.current = null; setSample(false); };
  async function upload(proof) {
    if (!uploadId.current) uploadId.current = crypto.randomUUID();
    const data = await api(`${path}/proof`, { id: uploadId.current, expectedProofId: latestId, ...proof, sampleAcknowledged: true });
    onUpdate(data.session); uploadId.current = null; setFile(null); setSample(false);
    setFeedback(t('Comprovativo guardado. A inscrição continua pendente até validação manual.', 'Proof saved. The registration remains pending until manual validation.'));
  }
  function uploadFile(event) {
    event.preventDefault(); if (!file || !sample) return;
    run(async () => {
      if (file.size > 500 * 1024) throw new Error('transfer-proof-too-large');
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('transfer-invalid-proof')); reader.readAsDataURL(file);
      });
      await upload({ filename: file.name, mimeType: file.type, base64 });
    });
  }
  function fictionalProof() {
    run(async () => {
      // Generated locally from non-sensitive test data. No real bank document.
      const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 260;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('transfer-invalid-proof');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#141846';
      ctx.font = 'bold 24px sans-serif'; ctx.fillText('CIRC 2027 — COMPROVATIVO FICTÍCIO / TEST ONLY', 24, 45);
      ctx.font = '18px sans-serif'; ctx.fillText('Não foi efetuada qualquer transferência. Sem validade bancária.', 24, 90);
      ctx.fillText(transfer.memo, 24, 140); ctx.fillText(`Valor simulado: ${(order.amountCents / 100).toFixed(2)} EUR`, 24, 190);
      await upload({ filename: 'comprovativo-ficticio.png', mimeType: 'image/png', base64: canvas.toDataURL('image/png').split(',')[1] });
    });
  }
  function review(decision) {
    run(async () => {
      const body = { decision, proofId: latestId, reason, sandboxAcknowledged: true,
        ...(decision === 'approve' ? { proofReviewed, creditConfirmed, amount, creditReference, bookingDate } : {}) };
      const key = JSON.stringify(body);
      if (decisionId.current?.key !== key) decisionId.current = { key, id: crypto.randomUUID() };
      onUpdate((await api(`${path}/review`, { ...body, id: decisionId.current.id })).session);
      decisionId.current = null; setFeedback(t('Decisão de teste registada.', 'Test decision recorded.'));
    });
  }
  function download(proof) {
    run(async () => {
      const blob = await api(`${path}/proof-download`, { proofId: proof.id }, undefined, true);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `comprovativo-teste.${proof.mimeType === 'application/pdf' ? 'pdf' : proof.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <section className="sandbox-bank-transfer" aria-label={t('Transferência bancária de teste', 'Test bank transfer')}>
    <p><strong>{t('Descrição para identificar o teste', 'Test identification')}:</strong> <code>{transfer.memo}</code></p>
    <p>{t('Sem IBAN neste ensaio. Não transfira dinheiro. Este método não usa a Eupago nem consulta a sua conta bancária.', 'No IBAN in this rehearsal. Do not transfer money. This method does not use Eupago or access your bank account.')}</p>
    {feedback && <p role="status">{feedback}</p>}
    {order.status === 'pending' && <form onSubmit={uploadFile}><fieldset disabled={busy}>
      <h4>{t('1. Comprovativo', '1. Proof')}</h4>
      <button type="button" className="secondary" onClick={fictionalProof} disabled={transfer.proofs.length >= 5}>{t('Usar comprovativo fictício', 'Use fictional proof')}</button>
      <label>{t('Ou enviar ficheiro de teste (PDF, JPG ou PNG; até 500 KB)', 'Or upload a test file (PDF, JPG or PNG; up to 500 KB)')}<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={changeFile} /></label>
      <label className="check"><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} />{t('Este ficheiro é fictício e não contém dados bancários pessoais.', 'This is a fictional file without personal bank details.')}</label>
      <button type="submit" disabled={!file || !sample || transfer.proofs.length >= 5}>{t('Enviar comprovativo de teste', 'Upload test proof')}</button>
    </fieldset></form>}
    {transfer.proofs.length > 0 && <div><h4>{t('Comprovativos privados', 'Private proofs')}</h4><p>{t('Só são descarregados por pedido autenticado. O envio não prova o recebimento do dinheiro.', 'Downloads require authentication. Uploading does not prove receipt of funds.')}</p>
      {transfer.proofs.map((proof, i) => <p key={proof.id}>v{i + 1} · {proof.filename} · {new Date(proof.uploadedAt).toLocaleString(en ? 'en-GB' : 'pt-PT')} <button type="button" className="secondary" disabled={busy} onClick={() => download(proof)}>{t('Descarregar', 'Download')} v{i + 1}</button></p>)}
    </div>}
    {order.status === 'pending' && <section className="sandbox-bank-transfer__review"><h4>{t('2. Validação pela organização — simulação', '2. Organiser validation — simulation')}</h4>
      <p>{t('Na utilização real, esta decisão exige conferir a entrada na conta da associação, não apenas o comprovativo. Aqui apenas ensaiamos essa decisão.', 'In real use, this decision requires checking the credit in the association’s bank account, not only the proof. Here we only rehearse that decision.')}</p>
      <fieldset disabled={busy}>
        {transfer.status === 'under_review' && <>
          <label className="check"><input type="checkbox" checked={proofReviewed} onChange={e => setReviewed(e.target.checked)} />{t('Analisei a última versão do comprovativo de teste.', 'I reviewed the latest test proof.')}</label>
          <label className="check"><input type="checkbox" checked={creditConfirmed} onChange={e => setCreditConfirmed(e.target.checked)} />{t('Confirmo, apenas para simulação, a conferência do crédito bancário.', 'For this simulation only, I confirm the bank credit check.')}</label>
          <div className="sandbox-checkout__grid"><label>{t('Valor conferido (EUR)', 'Checked amount (EUR)')}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label>{t('Data do movimento simulado', 'Simulated entry date')}<input type="date" value={bookingDate} onChange={e => setDate(e.target.value)} /></label></div>
          <label>{t('Referência única do movimento simulado', 'Unique simulated entry reference')}<input value={creditReference} maxLength={70} onChange={e => setReference(e.target.value)} /></label>
        </>}
        <label>{t('Nota / motivo de recusa ou cancelamento', 'Note / rejection or cancellation reason')}<textarea rows="2" maxLength="500" value={reason} onChange={e => setReason(e.target.value)} /></label>
        <div className="sandbox-checkout__actions">
          {transfer.status === 'under_review' && <><button type="button" disabled={!proofReviewed || !creditConfirmed} onClick={() => review('approve')}>{t('Validar transferência simulada', 'Validate simulated transfer')}</button>
          <button type="button" className="secondary" disabled={reason.trim().length < 5} onClick={() => review('reject')}>{t('Recusar comprovativo', 'Reject proof')}</button></>}
          <button type="button" className="secondary" disabled={reason.trim().length < 5} onClick={() => review('cancel')}>{t('Cancelar pedido de teste', 'Cancel test request')}</button>
        </div>
      </fieldset>
    </section>}
    {transfer.confirmation && <p><strong>{t('Validação manual de teste registada', 'Manual test validation recorded')}</strong> · {new Date(transfer.confirmation.confirmedAt).toLocaleString(en ? 'en-GB' : 'pt-PT')} · {transfer.confirmation.creditReference}</p>}
    {transfer.decisions.length > 0 && <details><summary>{t('Histórico das decisões', 'Decision history')}</summary>{transfer.decisions.map(d => <p key={d.id}>{new Date(d.at).toLocaleString(en ? 'en-GB' : 'pt-PT')} · {d.action === 'approve' ? t('Validado', 'Approved') : d.action === 'reject' ? t('Recusado', 'Rejected') : t('Cancelado', 'Cancelled')} · {d.reason || '—'} · {t('Responsável', 'Reviewer')}: <code>{d.actor}</code></p>)}</details>}
  </section>;
}
