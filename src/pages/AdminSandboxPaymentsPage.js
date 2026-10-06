import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../components/css/CompanyVouchers.css';

const errors = {
  sandbox_not_configured: 'A chave da sandbox ainda não está disponível neste servidor.',
  storage_forbidden: 'O Firebase recusou o registo do teste. Confirme as permissões da conta administradora.',
  storage_unavailable: 'Não foi possível consultar ou guardar o teste. Atualize o estado antes de voltar a tentar.',
  creation_unknown: 'A Eupago não confirmou o resultado. Consulte o backoffice da sandbox antes de iniciar outro teste.',
  storage_after_creation_failed: 'O pedido foi enviado, mas não foi possível guardar a resposta. Consulte o backoffice da sandbox.',
  creation_in_progress: 'O teste já está a ser criado. Atualize o estado dentro de alguns segundos.',
  provider_unavailable: 'Não foi possível consultar a Eupago. Tente atualizar o estado mais tarde.',
  not_found: 'Este teste não foi encontrado no servidor.',
  admin_required: 'Esta página requer a conta administradora do CIRC.',
  invalid_session: 'A sessão expirou. Volte a iniciar sessão.',
  sign_in_required: 'Inicie sessão com a conta administradora.',
};
const labels = { creating: 'Criação em curso ou por confirmar', pending: 'Referência criada — pagamento por verificar', creation_unknown: 'Resultado da criação por confirmar' };
function savedId(key) { try { return sessionStorage.getItem(key) || ''; } catch { return ''; } }
function saveId(key, id) { try { if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* The current tab state still retains the ID. */ } }
export default function AdminSandboxPaymentsPage() {
  const { user } = useAuth();
  const storageKey = `circ-eupago-sandbox-${user.uid}`;
  const [id, setId] = useState(() => savedId(storageKey));
  const [method, setMethod] = useState('multibanco');
  const [phone, setPhone] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function api(path, body) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/payments/sandbox/${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { const issue = new Error(data.error); issue.attempt = data.attempt; throw issue; }
    return data;
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const response = await fetch('/api/payments/sandbox/config', { headers, cache: 'no-store' });
        const config = await response.json(); if (!response.ok) throw new Error(config.error);
        if (!active) return; setConfigured(config.configured);
        if (!config.configured) setError(errors.sandbox_not_configured);
        const previous = savedId(storageKey);
        if (previous && config.configured) {
          const result = await fetch(`/api/payments/sandbox/attempts/${previous}`, { headers, cache: 'no-store' });
          const data = await result.json();
          if (!result.ok) throw new Error(data.error);
          if (active) setAttempt(data.attempt);
        }
      } catch (e) { if (active) setError(errors[e.message] || 'Não foi possível carregar o teste. Tente novamente.'); }
      finally { if (active) setBusy(false); }
    }
    load(); return () => { active = false; };
  }, [user, storageKey]);
  async function run(work) {
    if (busy) return; setBusy(true); setError('');
    try { await work(); }
    catch (e) { if (e.attempt) setAttempt(e.attempt); setError(errors[e.message] || 'Não foi possível concluir o pedido. Atualize o estado antes de repetir.'); }
    finally { setBusy(false); }
  }
  function create(event) {
    event.preventDefault();
    run(async () => {
      const next = id || crypto.randomUUID(); setId(next); saveId(storageKey, next);
      const data = await api('attempts', { id: next, method, ...(method === 'mbway' ? { phone } : {}) });
      setAttempt(data.attempt); setPhone('');
    });
  }
  return <main className="admin-page"><AdminModuleNav />
    <header><h1>Testes de pagamento</h1><p>Sandbox Eupago · acesso reservado à organização</p></header>
    <section className="company-voucher"><h2>Teste de ligação — 1,00 €</h2>
      <p>Este teste cria um pedido apenas no ambiente de demonstração. Não confirma inscrições, não reserva vagas e não emite faturas.</p>
      <p>Os dados apresentados destinam-se exclusivamente à sandbox. Não efetue pagamentos no banco ou na aplicação MB WAY real.</p>
      {!attempt && <form onSubmit={create}>
        <label>Meio de pagamento<select value={method} onChange={e => setMethod(e.target.value)} disabled={busy}><option value="multibanco">Multibanco</option><option value="mbway">MB WAY</option></select></label>
        {method === 'mbway' && <label>Número de teste MB WAY<input type="tel" inputMode="numeric" pattern="9[0-9]{8}" maxLength={9} required value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} /><small>Use um número indicado pela Eupago para os testes. O número 987654321 simula um erro.</small></label>}
        <button disabled={busy || !configured}>{busy ? 'A preparar…' : 'Criar pagamento de teste de 1,00 €'}</button>
      </form>}
      {id && <p>Identificador do teste: <code>{id}</code></p>}
      {attempt && <dl><dt>Estado</dt><dd>{labels[attempt.status] || 'Por verificar'}</dd>
        <dt>Meio de pagamento</dt><dd>{attempt.method === 'multibanco' ? 'Multibanco' : 'MB WAY'}</dd>
        {attempt.entity && <><dt>Entidade de teste</dt><dd>{attempt.entity}</dd></>}
        {attempt.reference && <><dt>Referência de teste</dt><dd>{attempt.reference}</dd></>}
        <dt>Valor de teste</dt><dd>1,00 €</dd><dt>Identificador na Eupago</dt><dd>{attempt.identifier}</dd>
        {attempt.providerState && <><dt>Estado devolvido pela Eupago</dt><dd>{attempt.providerState}</dd></>}
      </dl>}
      {id && <button disabled={busy} onClick={() => run(async () => setAttempt((await api(`attempts/${id}`)).attempt))}>Atualizar registo do teste</button>}
      {attempt?.reference && <button disabled={busy} onClick={() => run(async () => setAttempt((await api(`attempts/${id}/inspect`, {})).attempt))}>Consultar estado na Eupago</button>}
      {attempt?.status === 'pending' && <button disabled={busy} onClick={() => { saveId(storageKey, ''); setId(''); setAttempt(null); setError(''); }}>Preparar outro teste</button>}
      <p>A confirmação automática das inscrições ainda não está ativa. A consulta do estado serve apenas para verificar a ligação à Eupago.</p>
    </section>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">A processar…</p>}
  </main>;
}
