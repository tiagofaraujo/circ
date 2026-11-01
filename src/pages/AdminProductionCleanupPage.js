import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AdminModuleNav from '../components/AdminModuleNav';
import { prepareProductionCleanup, archiveProductionCleanup, restoreProductionCleanup } from '../auth/productionCleanupStore';
import '../admin.css';

// This preparation retires the pre-opening material, never new participant data.
const OPENING_CLEANUP_CUTOFF = Date.parse('2026-11-01T00:00:00Z');

const errors = {
  'cleanup/admin-required': 'Esta operação requer a conta de administração.',
  'cleanup/inventory-too-large': 'O inventário excede o limite desta operação. A limpeza não foi iniciada.',
  'cleanup/group-too-large': 'Um conjunto de registos excede o limite do arquivo. A limpeza não foi iniciada.',
  'cleanup/archive-running': 'Este arquivo ainda está em processamento. Aguarde pela conclusão antes de o repor.',
  'cleanup/source-changed': 'Um registo foi alterado depois da conferência. Atualize o inventário antes de continuar.',
  'cleanup/plan-expired': 'A conferência expirou. Atualize o inventário antes de continuar.',
  'cleanup/review-linked': 'Um trabalho tem avaliações associadas e foi preservado.',
  'cleanup/reviewer-restore-required': 'O trabalho foi recuperado. Falta reativar as atribuições: confirme se a avaliação e os revisores anteriores estão ativos e repita a reposição.',
  'cleanup/financial-record': 'Um registo tem informação financeira real e foi preservado.',
  'cleanup/restore-conflict': 'Já existe um registo com o mesmo identificador. A reposição não substitui dados atuais.',
};
export default function AdminProductionCleanupPage() {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [restoreId, setRestoreId] = useState('');
  const [restored, setRestored] = useState(false);
  async function inventory() {
    setBusy(true); setError(''); setChecked(false);
    try { setPlan(await prepareProductionCleanup(user, { cutoff: OPENING_CLEANUP_CUTOFF })); }
    catch (issue) { setError(errors[issue.message] || 'Não foi possível concluir a conferência. Nenhum registo foi removido.'); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!checked || !plan?.groups.length) return;
    setBusy(true); setError(''); setRestored(false);
    try {
      const value = await archiveProductionCleanup(user, plan, setProgress);
      setResult(value); setRestoreId(value.archiveId); setPlan(null); setChecked(false);
    } catch (issue) {
      if (issue.archiveId) { setResult({ archiveId: issue.archiveId, completed: issue.completed, partial: true }); setRestoreId(issue.archiveId); }
      setError(errors[issue.message] || 'A operação foi interrompida. Os registos já arquivados têm cópia de segurança; os restantes foram preservados.');
      setPlan(null); setChecked(false);
    } finally { setBusy(false); }
  }
  async function restore() {
    setBusy(true); setError('');
    try { await restoreProductionCleanup(user, restoreId); setRestored(true); setPlan(null); }
    catch (issue) { setError(errors[issue.message] || 'Não foi possível concluir a reposição. Os dados atuais não foram substituídos.'); }
    finally { setBusy(false); }
  }
  const protectedFinancial = plan?.protectedItems.filter(item => item.reason === 'financial-record').length || 0;
  const protectedReviews = plan?.protectedItems.filter(item => item.reason === 'review-linked').length || 0;
  return <main className="admin-page">
    <AdminModuleNav />
    <header><h1>Preparação da abertura</h1><p>Conferência e arquivo dos registos anteriores do CIRC 2027.</p></header>
    <section className="admin-panel">
      <h2>Conferir os dados existentes</h2>
      <p>O arquivo retira os registos dos ecrãs ativos e conserva uma cópia reservada à administração. Os perfis dos participantes mantêm-se.</p>
      <p>Pagamentos reais, referências de pagamento em curso e documentos fiscais são preservados. Os trabalhos arquivados são retirados também da área dos revisores; as atribuições e avaliações ficam guardadas.</p>
      <button type="button" disabled={busy} onClick={inventory}>{busy ? 'A processar…' : 'Atualizar inventário'}</button>
      {plan && <>
        <p>Conferência de {new Date(plan.preparedAt).toLocaleString('pt-PT')}. Apenas os registos anteriores a 1 de novembro de 2026 são abrangidos. A atividade nova fica fora desta operação.</p>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Dados</th><th>Encontrados</th><th>A arquivar</th></tr></thead><tbody>
          <tr><td>Inscrições</td><td>{plan.totals.registrations}</td><td>{plan.eligible.registrations}</td></tr>
          <tr><td>Trabalhos de submissão</td><td>{plan.totals.submissions}</td><td>{plan.eligible.submissions}</td></tr>
          <tr><td>Ensaios anteriores</td><td>{plan.totals.sandbox}</td><td>{plan.eligible.sandbox}</td></tr>
          <tr><td>Outros registos de ensaio associados</td><td>—</td><td>{plan.eligible.related}</td></tr>
        </tbody></table></div>
        <p><strong>Preservados:</strong> {protectedFinancial} inscrição(ões) com informação financeira real; {protectedReviews} trabalho(s) com avaliações; {plan.recent.length} registo(s) posteriores à conferência.</p>
        {plan.groups.length > 0 && <>
          <label><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} /> Conferi o inventário e pretendo arquivar os registos indicados.</label>
          <div><button type="button" disabled={busy || !checked} onClick={archive}>Arquivar os registos conferidos</button></div>
        </>}
        {!plan.groups.length && <p>Não há registos elegíveis para arquivar nesta conferência.</p>}
      </>}
      {progress && busy && <p role="status">A arquivar: {progress.completed} de {progress.total} grupos.</p>}
      {result && <div role="status"><p>{result.partial ? 'Arquivo parcialmente concluído.' : 'Arquivo concluído.'} {result.completed} grupo(s) retirado(s) dos ecrãs ativos.</p><p>Referência do arquivo: <code>{result.archiveId}</code></p></div>}
    </section>
    <section className="admin-panel"><h2>Repor um arquivo</h2><p>A reposição só recupera identificadores livres. Não substitui inscrições ou trabalhos entretanto criados. Repor atribuições de avaliação requer que os respetivos revisores e a avaliação estejam ativos.</p>
      <label>Referência do arquivo<input value={restoreId} disabled={busy} onChange={event => setRestoreId(event.target.value.trim())} /></label>
      <button type="button" disabled={busy || !restoreId} onClick={restore}>Repor os dados arquivados</button>
      {restored && <p role="status">Dados repostos.</p>}
    </section>
    {error && <p role="alert">{error}</p>}
  </main>;
}
