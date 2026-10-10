import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AdminModuleNav from '../components/AdminModuleNav';
import SandboxBankTransfer, { transferLabels, transferMessages } from './SandboxBankTransfer';
import './SandboxCheckoutPage.css';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const flatten = sessions => sessions.flatMap(s => (s.bankTransfers || []).map(o => ({ ...o, sessionId: s.id })));
const summary = session => ({ id: session.id, bankTransfers: session.orders.filter(o => o.bankTransfer).map(o => ({
  id: o.id, memo: o.bankTransfer.memo, status: o.bankTransfer.status, amountCents: o.amountCents,
  proofCount: o.bankTransfer.proofs.length, createdAt: o.createdAt,
})) });

export default function SandboxBankTransferReviewPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [params, setParams] = useSearchParams();
  const initial = useRef({ sessionId: params.get('teste'), orderId: params.get('pedido') });
  const [cases, setCases] = useState([]);
  const [session, setSession] = useState(null);
  const [orderId, setOrderId] = useState(initial.current.orderId);
  const [filter, setFilter] = useState('under_review');
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true), running = useRef(false);
  const money = value => new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(value / 100);
  const api = useCallback(async (path, body, signal, binary = false) => {
    const token = await user.getIdToken();
    const response = await fetch(`/api/checkout/sandbox/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'service-unavailable'); }
    return binary ? response.blob() : response.json();
  }, [user]);
  function displayError(issue) {
    setError(transferMessages[issue.message]?.[en ? 1 : 0] || t('Não foi possível concluir a operação. Atualize a fila; não force uma confirmação.', 'Could not complete the operation. Refresh the queue; do not force confirmation.'));
  }
  useEffect(() => {
    let active = true; alive.current = true;
    const controller = new AbortController();
    (async () => {
      try {
        const list = await api('sessions', undefined, controller.signal);
        if (!active) return;
        setCases(flatten(list.sessions)); setTruncated(list.truncated);
        if (UUID.test(initial.current.sessionId || '')) {
          const data = await api(`sessions/${initial.current.sessionId}`, undefined, controller.signal);
          if (active) setSession(data.session);
        }
      } catch (issue) { if (active && issue.name !== 'AbortError') setError(en ? 'Could not load the test queue. Sign in with the organiser account and refresh.' : 'Não foi possível carregar a fila de teste. Entre com a conta da organização e atualize.'); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; alive.current = false; controller.abort(); };
    // Changing the language does not reset an in-progress administrative review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  async function run(work) {
    if (busy || running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await work(); } catch (issue) { if (alive.current) displayError(issue); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function update(record) {
    if (!alive.current) return;
    setSession(record);
    setCases(previous => [...previous.filter(item => item.sessionId !== record.id), ...flatten([summary(record)])]);
  }
  function load(item) {
    run(async () => {
      const data = await api(`sessions/${item.sessionId}`);
      if (!alive.current) return;
      update(data.session); setOrderId(item.id); setParams({ teste: item.sessionId, pedido: item.id }, { replace: true });
    });
  }
  function refresh() {
    run(async () => {
      const list = await api('sessions');
      if (!alive.current) return;
      setCases(flatten(list.sessions)); setTruncated(list.truncated);
      if (session) update((await api(`sessions/${session.id}`)).session);
    });
  }
  const selected = session?.orders.find(o => o.id === orderId && o.method === 'bank_transfer');
  const visible = cases.filter(item => filter === 'all' || item.status === filter).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return <main className="sandbox-checkout admin-page">
    <AdminModuleNav />
    <header className="sandbox-checkout__header"><div><p className="sandbox-checkout__eyebrow">CIRC · SANDBOX</p><h1>{t('Conferir transferências — teste', 'Review transfers — test')}</h1></div><Link to={`/conta/inscricoes-teste${session ? `?teste=${session.id}` : ''}`}>{t('Voltar à inscrição de teste', 'Back to test registration')}</Link></header>
    <section className="sandbox-checkout__notice"><strong>{t('Área da organização — apenas simulação', 'Organiser area — simulation only')}</strong><p>{t('A mesma conta administradora ensaia os dois lados, em páginas separadas. Não há acesso a extratos nem confirmação de dinheiro real.', 'The same administrator rehearses both roles on separate pages. No bank statements or real-money confirmations are involved.')}</p></section>
    {error && <p role="alert" className="sandbox-checkout__error">{error}</p>}
    {busy && <p role="status">{t('A carregar…', 'Loading…')}</p>}
    <section className="sandbox-checkout__panel"><h2>{t('Transferências para conferência', 'Transfers to review')}</h2>
      <div className="sandbox-checkout__actions"><label>{t('Mostrar', 'Show')}<select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="under_review">{t('Aguarda confirmação', 'Awaiting confirmation')}</option><option value="rejected">{t('Necessita de esclarecimento', 'Clarification needed')}</option><option value="confirmed">{t('Confirmadas', 'Confirmed')}</option><option value="all">{t('Todas', 'All')}</option>
      </select></label><button type="button" className="secondary" disabled={busy} onClick={refresh}>{t('Atualizar fila', 'Refresh queue')}</button></div>
      {visible.length ? <ul className="sandbox-checkout__history">{visible.map(item => <li key={`${item.sessionId}-${item.id}`}><button type="button" className="secondary" disabled={busy} onClick={() => load(item)}>
        <strong>{money(item.amountCents)} · {transferLabels[item.status]?.[en ? 1 : 0] || item.status}</strong><small>{item.memo}</small><small>{item.proofCount ? t('Com comprovativo', 'Proof attached') : t('Sem comprovativo — opcional', 'No proof — optional')}</small>
      </button></li>)}</ul> : !busy && <p>{t('Não há transferências neste estado entre os testes carregados.', 'No transfers in this state among the loaded tests.')}</p>}
      {truncated && <p>{t('A fila abrange os primeiros 100 testes da conta. Para outros testes, use o respetivo endereço. Nenhum registo foi apagado.', 'The queue covers the first 100 account tests. Use a test’s own address to access others. No record was deleted.')}</p>}
    </section>
    {selected && <section className="sandbox-checkout__panel"><h2>{t('Pedido selecionado', 'Selected request')} · {money(selected.amountCents)}</h2>
      <SandboxBankTransfer key={`${session.id}-${selected.id}`} sessionId={session.id} order={selected} en={en} api={api} run={run} busy={busy} onUpdate={update} view="organisation" />
    </section>}
  </main>;
}
