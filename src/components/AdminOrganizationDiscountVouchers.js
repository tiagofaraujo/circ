import React, { useState } from 'react';
import { getFirebaseAuth, isAdminUser } from '../auth/firebaseClient';
import { exportOrganizationDiscountVoucherExcel, formatOrganizationDiscount, ORGANIZATION_VOUCHER_ULS_AUDIENCE } from '../auth/organizationDiscountVoucherExcel';

const API = '/api/admin/registration-management/discount-vouchers';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CODE = /^CIRC27-D-(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/;
const DEFAULT_FORM = { label: '', count: '1', value: '', audience: '' };
const DISCOUNT_MAX = { percentage: 9999, fixed: 9999900 };

function savedValue(key) {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; }
}

function saveValue(key, value) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch { /* The current page still holds the last batch ID and any pending retry. */ }
}

function discountValue(input) {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : 0;
}

function validDiscount(discount) {
  return Object.hasOwn(DISCOUNT_MAX, discount?.type) && Number.isInteger(discount.value)
    && discount.value > 0 && discount.value <= DISCOUNT_MAX[discount.type];
}

function validBatchTerms(batch) {
  return typeof batch?.batchId === 'string' && UUID.test(batch.batchId) && typeof batch.label === 'string'
    && Number.isInteger(batch.count) && batch.count >= 1 && batch.count <= 50 && validDiscount(batch.discount)
    && (batch.audience === undefined || batch.audience === 'uls-onsite');
}

async function requestBatch(batchId, terms) {
  const user = getFirebaseAuth()?.currentUser;
  if (!isAdminUser(user) || !user.getIdToken) throw new Error('admin-required');
  const token = await user.getIdToken();
  const response = await fetch(terms ? API : `${API}?batchId=${encodeURIComponent(batchId)}`, {
    method: terms ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(terms ? { 'Content-Type': 'application/json' } : {}) },
    ...(terms ? { body: JSON.stringify(terms) } : {}),
  });
  const batch = await response.json();
  if (!response.ok) throw new Error(batch?.error);
  if (!validBatchTerms(batch) || batch.batchId !== batchId || (terms && batch.audience !== terms.audience) || !Number.isFinite(Date.parse(batch.createdAt))
    || !Array.isArray(batch.codes) || batch.codes.length !== batch.count
    || batch.codes.some(code => typeof code !== 'string' || !CODE.test(code))) throw new Error('invalid-response');
  return batch;
}

export default function AdminOrganizationDiscountVouchers() {
  const storageKey = `circ-2027-organization-discount-vouchers:${getFirebaseAuth()?.currentUser?.uid}`;
  const [form, setForm] = useState(DEFAULT_FORM);
  const [pending, setPending] = useState(() => {
    const value = savedValue(`${storageKey}:pending`);
    return validBatchTerms(value) ? value : null;
  });
  const [lookupId, setLookupId] = useState(() => {
    const value = savedValue(`${storageKey}:last-batch`);
    return typeof value === 'string' && UUID.test(value) ? value : '';
  });
  const [batch, setBatch] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const rememberPending = (terms) => {
    setPending(terms);
    saveValue(`${storageKey}:pending`, terms);
  };

  const showBatch = (result) => {
    setBatch(result);
    setLookupId(result.batchId);
    saveValue(`${storageKey}:last-batch`, result.batchId);
  };

  const issue = async (terms) => {
    setBusy('issue');
    setError('');
    setMessage('');
    rememberPending(terms);
    try {
      showBatch(await requestBatch(terms.batchId, terms));
      rememberPending(null);
      setForm(DEFAULT_FORM);
      setMessage('Lote emitido. Os códigos estão disponíveis para descarregar.');
    } catch (failure) {
      if (failure.message === 'fixed-discount-required') {
        rememberPending(null);
        setError('O lote em percentagem não chegou a ser emitido. Indique um desconto em euros para criar um lote.');
      } else if (failure.message === 'invalid-request' || failure.message === 'batch-conflict') {
        rememberPending(null);
        setError(failure.message === 'batch-conflict'
          ? 'O identificador já pertence a outro lote. Volte a emitir para gerar um novo identificador.'
          : 'Verifique os dados e volte a emitir o lote.');
      } else {
        setError('A emissão não foi confirmada. Use «Retomar emissão» para recuperar ou concluir o mesmo lote.');
      }
    } finally { setBusy(''); }
  };

  const submit = (event) => {
    event.preventDefault();
    const count = Number(form.count);
    const value = discountValue(form.value);
    const label = form.label.trim();
    const discount = { type: 'fixed', value };
    if (!label || !Number.isInteger(count) || count < 1 || count > 50 || !validDiscount(discount)) {
      setMessage('');
      setError('Indique um nome, 1 a 50 códigos e um desconto em euros com até duas casas decimais.');
      return;
    }
    issue({ batchId: crypto.randomUUID(), label, count, discount, ...(form.audience ? { audience: form.audience } : {}) });
  };

  const lookup = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const batchId = lookupId.trim().toLowerCase();
    if (!UUID.test(batchId)) {
      setError('Introduza o identificador do lote indicado na emissão ou no Excel.');
      return;
    }
    setBusy('lookup');
    try { showBatch(await requestBatch(batchId)); }
    catch (failure) {
      setError(failure.message === 'batch-not-found' ? 'Não foi encontrado um lote com este identificador.'
        : 'Não foi possível consultar o lote. Tente novamente.');
    } finally { setBusy(''); }
  };

  const download = async () => {
    setBusy('download');
    setError('');
    setMessage('');
    try {
      await exportOrganizationDiscountVoucherExcel(batch);
      setMessage('Excel preparado. Consulte as transferências do navegador.');
    } catch { setError('Não foi possível preparar o Excel. Tente novamente.'); }
    finally { setBusy(''); }
  };

  const edit = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return <section className="company-voucher organization-discount-vouchers" aria-labelledby="organization-discount-vouchers-title">
    <h2 id="organization-discount-vouchers-title">Gerar vouchers</h2>
    <p>O desconto fixo incide sobre o total da inscrição. Os códigos do lote têm o mesmo valor e são de utilização única.</p>
    {pending ? <div className="organization-discount-vouchers__batch">
      <h3>Emissão em curso</h3>
      <p>{pending.label} · {pending.count} {pending.count === 1 ? 'código' : 'códigos'} · {formatOrganizationDiscount(pending.discount)}</p>
      {pending.audience === 'uls-onsite' && <p>{ORGANIZATION_VOUCHER_ULS_AUDIENCE}</p>}
      <p>Identificador do lote <code>{pending.batchId}</code></p>
      <button type="button" disabled={Boolean(busy)} onClick={() => issue(pending)}>{busy === 'issue' ? 'A emitir…' : 'Retomar emissão'}</button>
    </div> : <form onSubmit={submit}>
      <label>Nome do lote<input required maxLength={100} value={form.label} onChange={edit('label')} disabled={Boolean(busy)} /></label>
      <div className="organization-discount-vouchers__fields">
        <label>Desconto por voucher (€)<input required inputMode="decimal" maxLength={8} value={form.value} onChange={edit('value')} disabled={Boolean(busy)} /></label>
        <label>Número de códigos<input required type="number" min="1" max="50" step="1" value={form.count} onChange={edit('count')} disabled={Boolean(busy)} /></label>
        <label>Destinatários<select value={form.audience} onChange={edit('audience')} disabled={Boolean(busy)}>
          <option value="">Todos os perfis elegíveis</option>
          <option value="uls-onsite">{ORGANIZATION_VOUCHER_ULS_AUDIENCE}</option>
        </select></label>
      </div>
      <button type="submit" disabled={Boolean(busy)}>Gerar códigos</button>
    </form>}

    {batch && <div className="organization-discount-vouchers__batch" aria-labelledby="organization-discount-vouchers-batch">
      <h3 id="organization-discount-vouchers-batch">{batch.label}</h3>
      <p>{batch.count} {batch.count === 1 ? 'código emitido' : 'códigos emitidos'} · {formatOrganizationDiscount(batch.discount)} de desconto</p>
      {batch.audience === 'uls-onsite' && <p>{ORGANIZATION_VOUCHER_ULS_AUDIENCE}</p>}
      <p>Identificador do lote <code>{batch.batchId}</code></p>
      <button type="button" disabled={Boolean(busy)} onClick={download}>{busy === 'download' ? 'A preparar Excel…' : 'Descarregar lote em Excel'}</button>
      <details>
        <summary>Ver códigos emitidos</summary>
        <ol>{batch.codes.map(code => <li key={code}><code>{code}</code></li>)}</ol>
      </details>
    </div>}

    <details className="organization-discount-vouchers__lookup"><summary>Consultar lote anterior</summary>
      <form onSubmit={lookup}>
        <label>Identificador do lote<input required maxLength={36} autoComplete="off" spellCheck={false} value={lookupId} onChange={(event) => setLookupId(event.target.value)} disabled={Boolean(busy)} /></label>
        <button type="submit" disabled={Boolean(busy)}>{busy === 'lookup' ? 'A consultar…' : 'Consultar lote'}</button>
      </form>
    </details>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
