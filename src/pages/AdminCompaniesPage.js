import React, { useEffect, useState } from 'react';
import AdminModuleNav from '../components/AdminModuleNav';
import { exportCompanyVoucherPdf } from '../auth/companyVoucherPdf';
import { cancelCompanyVoucher, companyError, confirmCompanyTransfer, createCompanyPurchase, formatVoucher,
  loadCompanyPurchases, loadCompanyVouchers, setCompanyCodesEnabled, subscribeCompanyConfig } from '../auth/companyVouchers';
import { CONGRESS_RATES, getRegistrationPeriod } from '../data/registration2027';
import '../admin.css';
import '../components/css/CompanyVouchers.css';
const money = (cents) => (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const initial = () => ({ name: '', taxNumber: '', address: '', email: '', quantity: 1, unitPrice: CONGRESS_RATES.external[getRegistrationPeriod()] });
const labels = { pending: 'A aguardar transferência', paid: 'Transferência confirmada', available: 'Disponível', redeemed: 'Utilizado', cancelled: 'Cancelado' };
export default function AdminCompaniesPage() {
  const [form, setForm] = useState(initial);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [fiscal, setFiscal] = useState('');
  const [checked, setChecked] = useState(false);
  const [cancelCode, setCancelCode] = useState('');
  const refresh = async (after = null) => {
    const result = await loadCompanyPurchases(after);
    setItems((old) => after ? [...old, ...result.items] : result.items); setCursor(result.cursor);
  };
  useEffect(() => {
    refresh().catch((e) => setError(companyError(e)));
    return subscribeCompanyConfig(setEnabled, (e) => setError(companyError(e)));
  }, []);
  useEffect(() => {
    let active = true;
    setVouchers([]); setReference(''); setFiscal(''); setChecked(false); setCancelCode('');
    if (selected?.status === 'paid') loadCompanyVouchers(selected).then((v) => { if (active) setVouchers(v); }).catch((e) => { if (active) setError(companyError(e)); });
    return () => { active = false; };
  }, [selected]);
  const run = async (work) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (e) { setError(companyError(e)); } finally { setBusy(false); }
  };
  const create = (e) => { e.preventDefault(); run(async () => { await createCompanyPurchase(form); setForm(initial()); await refresh(); setMessage('Compra registada. Aguarda confirmação da entrada da transferência.'); }); };
  const confirm = (e) => { e.preventDefault(); if (!checked) return; run(async () => { await confirmCompanyTransfer(selected.id, reference, fiscal); setSelected(null); await refresh(); setMessage('Transferência confirmada. Abra a compra para consultar e copiar os códigos.'); }); };
  return <main className="admin-page"><AdminModuleNav /><header><h1>Inscrições de empresas</h1><p>Congressista externo · Presencial · Dois dias · Sem jantar nem cursos</p></header>
    <section className="company-voucher"><h2>Utilização dos códigos</h2><p>{enabled ? 'Ativa: os participantes podem confirmar inscrições com códigos pagos.' : 'Desativada: pode preparar compras e códigos, mas ainda não podem ser utilizados.'}</p>
      <button disabled={busy} onClick={() => run(() => setCompanyCodesEnabled(!enabled))}>{enabled ? 'Desativar utilização de códigos' : 'Ativar utilização de códigos pagos'}</button>
      <small>Esta opção ativa apenas as inscrições pagas por empresas. Não abre os pagamentos individuais.</small></section>
    <form className="company-voucher" onSubmit={create}><h2>Registar compra</h2>
      {[['name', 'Nome da empresa'], ['taxNumber', 'NIF / identificação fiscal'], ['address', 'Morada de faturação'], ['email', 'Email de contacto']].map(([key, label]) => <label key={key}>{label}<input type={key === 'email' ? 'email' : 'text'} required maxLength={key === 'address' ? 300 : key === 'email' ? 254 : key === 'taxNumber' ? 40 : 160} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} disabled={busy} /></label>)}
      <label>Número de inscrições (1–50 por compra)<input required type="number" min="1" max="50" step="1" value={form.quantity} disabled={busy} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
      <label>Preço acordado por inscrição (€)<input required type="number" min="0.01" max="1000" step="0.01" value={form.unitPrice} disabled={busy} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} /></label>
      <p>Total: <strong>{money(Math.round(Number(form.unitPrice) * 100) * Number(form.quantity))}</strong></p><button disabled={busy}>Registar compra a aguardar transferência</button></form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="company-voucher"><h2>Compras</h2><button disabled={busy} onClick={() => run(async () => { setSelected(null); await refresh(); })}>Atualizar</button>
      <ul>{items.map((p) => <li key={p.id}><button disabled={busy} onClick={() => setSelected(p)}>{p.company.name} · {p.quantity} inscrições · {money(p.amountCents)} · {labels[p.status]}</button></li>)}</ul>
      {!items.length && <p>Sem compras carregadas.</p>}{cursor && <button disabled={busy} onClick={() => run(() => refresh(cursor))}>Carregar mais</button>}</section>
    {selected && <section className="company-voucher"><h2>{selected.company.name}</h2><p>{selected.company.taxNumber} · {selected.company.address} · {selected.company.email}</p><p>{selected.quantity} inscrições · {money(selected.amountCents)} · {labels[selected.status]}</p>
      {selected.status === 'pending' ? <form onSubmit={confirm}>
        <label>Referência da transferência / movimento bancário<input required minLength={2} maxLength={200} value={reference} disabled={busy} onChange={(e) => setReference(e.target.value)} /></label>
        <label>Referência do documento de faturação (opcional)<input maxLength={200} value={fiscal} disabled={busy} onChange={(e) => setFiscal(e.target.value)} /></label>
        <label><input type="checkbox" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} />Confirmei a entrada de {money(selected.amountCents)} na conta bancária.</label>
        <button disabled={busy || !checked}>Confirmar pagamento e gerar {selected.quantity} códigos</button>
      </form> : <><p>Transferência: {selected.transferReference}</p><p>Documento de faturação: {selected.fiscalReference || 'Não indicado'}</p>
        <p>O pagamento global está registado nesta compra. A utilização dos códigos não regista uma nova receita nem emite um novo recibo.</p>
        <button disabled={busy} onClick={() => run(async () => {
          try { setVouchers(await exportCompanyVoucherPdf(selected)); setMessage('Documento aberto. Clique em «Imprimir / Guardar como PDF» para o guardar e enviar à empresa.'); }
          catch (e) { setError(e.code ? companyError(e) : e.message); }
        })}>Exportar códigos disponíveis em PDF</button>
        <button disabled={!vouchers.length || busy} onClick={() => run(async () => { await navigator.clipboard.writeText(vouchers.filter((v) => v.status === 'available').map((v) => formatVoucher(v.code)).join('\n')); setMessage('Códigos disponíveis copiados.'); })}>Copiar códigos disponíveis</button>
        <div className="company-table"><table><thead><tr><th>Código</th><th>Estado</th><th>Inscrição</th><th>Ação</th></tr></thead><tbody>{vouchers.map((v) => <tr key={v.code}><td><code>{formatVoucher(v.code)}</code></td><td>{labels[v.status]}</td><td>{v.registrationId || '—'}</td><td>{v.status === 'available' && <button disabled={busy} onClick={() => setCancelCode(v.code)}>Cancelar</button>}</td></tr>)}</tbody></table></div>
        {cancelCode && <div><p>Cancelar definitivamente o código {formatVoucher(cancelCode)}? Esta ação não processa um reembolso.</p><button disabled={busy} onClick={() => run(async () => { await cancelCompanyVoucher(cancelCode); setCancelCode(''); setVouchers(await loadCompanyVouchers(selected)); })}>Confirmar cancelamento</button><button disabled={busy} onClick={() => setCancelCode('')}>Voltar</button></div>}
      </>}
    </section>}
  </main>;
}
