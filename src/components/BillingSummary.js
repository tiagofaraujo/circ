import React, { useEffect, useId, useState } from 'react';
import './BillingSummary.css';

const methods = {
  multibanco: ['Multibanco', 'Multibanco'],
  mbway: ['MB WAY', 'MB WAY'],
  bank_transfer: ['Transferência bancária', 'Bank transfer'],
  stripe_card: ['Cartão (Stripe)', 'Card (Stripe)'],
  company_voucher_purchase: ['Compras de empresas', 'Company purchases'],
  other: ['Outros meios', 'Other methods'],
};

const metricKeys = [
  'receivedCents', 'receivedCount', 'refundedCents', 'unresolvedRefundCount', 'reportedFeeMicros',
  'feeKnownCount', 'reviewCents', 'reviewCount', 'issuedCount', 'fiscalPendingCount',
];

function validMetrics(metrics) {
  return metrics && metricKeys.every(key => Number.isSafeInteger(metrics[key]) && metrics[key] >= 0);
}

function amounts(metrics, money, unknown) {
  const fullFeeCoverage = metrics.feeKnownCount === metrics.receivedCount;
  const fullRefundCoverage = metrics.unresolvedRefundCount === 0;
  return {
    received: money(metrics.receivedCents / 100),
    refunds: fullRefundCoverage || metrics.refundedCents > 0 ? money(metrics.refundedCents / 100) : unknown,
    fees: fullFeeCoverage || metrics.feeKnownCount > 0 ? money(metrics.reportedFeeMicros / 1000000) : unknown,
    net: fullFeeCoverage && fullRefundCoverage
      ? money((metrics.receivedCents - metrics.refundedCents) / 100 - metrics.reportedFeeMicros / 1000000)
      : unknown,
  };
}

export default function BillingSummary({ user, en = false }) {
  const t = (pt, english) => en ? english : pt;
  const headingId = useId();
  const uid = user.uid;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const current = result?.uid === uid && result.revision === revision ? result : null;

  useEffect(() => {
    const request = new AbortController();
    async function load() {
      try {
        const token = await user.getIdToken();
        if (request.signal.aborted) return;
        const response = await fetch('/api/admin/billing/summary', {
          method: 'GET',
          cache: 'no-store',
          signal: request.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('billing-summary-unavailable');
        const summary = await response.json();
        if (summary?.currency !== 'EUR' || !Number.isFinite(Date.parse(summary.generatedAt))
          || !validMetrics(summary.totals) || !Array.isArray(summary.methods)
          || !summary.methods.every(row => typeof row?.method === 'string' && validMetrics(row))) {
          throw new Error('billing-summary-invalid');
        }
        if (!request.signal.aborted) setResult({ uid, revision, summary });
      } catch {
        if (!request.signal.aborted) setResult({ uid, revision, summary: null });
      }
    }
    load();
    return () => request.abort();
    // The UID identifies the session. Changes to the auth object for the same user do not restart a read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, revision]);

  const summary = current?.summary;
  const locale = en ? 'en-IE' : 'pt-PT';
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format;
  const count = new Intl.NumberFormat(locale).format;
  const unknown = t('Por apurar', 'Pending verification');
  const date = summary && new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Lisbon',
  }).format(new Date(summary.generatedAt));

  function feeCoverage(metrics) {
    const covered = count(metrics.feeKnownCount);
    const total = count(metrics.receivedCount);
    return t(`Pagamentos com dados ${covered}/${total}`, `Payments with fee data ${covered}/${total}`);
  }

  function renderSummary() {
    const { totals } = summary;
    const values = amounts(totals, money, unknown);
    const rows = summary.methods.filter(row => row.receivedCount > 0).sort((a, b) => b.receivedCents - a.receivedCents);
    const metrics = [
      [t('Total recebido', 'Gross received'), values.received,
        t(`Pagamentos confirmados ${count(totals.receivedCount)}`, `Confirmed payments ${count(totals.receivedCount)}`)],
      [t('Reembolsos registados', 'Recorded refunds'), values.refunds, totals.unresolvedRefundCount > 0
        ? t(`${count(totals.unresolvedRefundCount)} por confirmar`, `${count(totals.unresolvedRefundCount)} awaiting confirmation`)
        : t('Montantes confirmados', 'Confirmed amounts')],
      [t('Comissões comunicadas', 'Reported fees'), values.fees, feeCoverage(totals)],
      [t('Após comissões', 'After reported fees'), values.net, values.net === unknown
        ? t('Faltam dados de comissões ou reembolsos', 'Fee or refund data is incomplete')
        : t('Com reembolsos deduzidos', 'After subtracting refunds')],
    ];

    return <>
      <dl className="billing-summary__metrics">
        {metrics.map(([label, value, detail]) => <div key={label}>
          <dt>{label}</dt>
          <dd><strong className={value === unknown ? 'billing-summary__unknown' : undefined}>{value}</strong><small>{detail}</small></dd>
        </div>)}
      </dl>

      <dl className="billing-summary__activity">
        <div><dt>{t('Faturas-recibo emitidas', 'Invoice receipts issued')}</dt><dd>{count(totals.issuedCount)}</dd></div>
        <div><dt>{t('Faturação por concluir', 'Invoicing incomplete')}</dt><dd>{count(totals.fiscalPendingCount)}</dd></div>
        <div>
          <dt>{t('Recebimentos em revisão', 'Receipts under review')}</dt>
          <dd>{money(totals.reviewCents / 100)} <small>· {count(totals.reviewCount)} {totals.reviewCount === 1
            ? t('pagamento', 'payment') : t('pagamentos', 'payments')}</small></dd>
        </div>
      </dl>

      <section className="billing-summary__breakdown" aria-labelledby={`${headingId}-methods`}>
        <h3 id={`${headingId}-methods`}>{t('Por meio de pagamento', 'By payment method')}</h3>
        {rows.length === 0 ? <p className="billing-summary__empty">
          {t('Ainda não há pagamentos confirmados no CIRC 2027.', 'There are no confirmed CIRC 2027 payments yet.')}
        </p> : <div className="billing-summary__table-scroll" role="region" aria-labelledby={`${headingId}-methods`} tabIndex={0}>
          <table>
            <thead><tr>
              <th scope="col">{t('Meio', 'Method')}</th>
              <th scope="col">{t('Pagamentos', 'Payments')}</th>
              <th scope="col">{t('Recebido', 'Received')}</th>
              <th scope="col">{t('Reembolsos', 'Refunds')}</th>
              <th scope="col">{t('Comissões', 'Fees')}</th>
              <th scope="col">{t('Após comissões', 'After reported fees')}</th>
            </tr></thead>
            <tbody>{rows.map(row => {
              const label = Object.prototype.hasOwnProperty.call(methods, row.method) ? methods[row.method] : methods.other;
              const value = amounts(row, money, unknown);
              return <tr key={row.method}>
                <th scope="row">
                  {label[en ? 1 : 0]}
                  <div className="billing-summary__share" aria-hidden="true">
                    <span style={{ width: `${totals.receivedCents ? Math.min(100, row.receivedCents / totals.receivedCents * 100) : 0}%` }} />
                  </div>
                </th>
                <td>{count(row.receivedCount)}</td>
                <td>{value.received}</td>
                <td>{value.refunds}{row.unresolvedRefundCount > 0 && <small>
                  {count(row.unresolvedRefundCount)} {t('por confirmar', 'unconfirmed')}
                </small>}</td>
                <td>{value.fees}<small>{feeCoverage(row)}</small></td>
                <td>{value.net}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </section>

      <p className="billing-summary__note">{t(
        'O total recebido inclui os pagamentos confirmados antes dos reembolsos. A contagem de faturação refere-se às faturas-recibo da plataforma. Confirme o IVA sobre comissões e os depósitos bancários nos extratos.',
        'Gross received includes all confirmed payments before refunds. Invoice counts refer to invoice receipts issued through the platform. Check your statements for VAT on fees and bank deposits.',
      )}</p>
    </>;
  }

  return <section className="billing-summary" aria-labelledby={headingId}>
    <header className="billing-summary__header">
      <div>
        <h2 id={headingId}>{t('Resumo financeiro', 'Financial summary')}</h2>
        <p>{t('Recebimentos e faturação do CIRC 2027.', 'CIRC 2027 payments and invoicing.')}</p>
      </div>
      <div className="billing-summary__controls">
        {date && <time dateTime={summary.generatedAt}>{t('Atualizado em', 'Updated')} {date}</time>}
        <button type="button" onClick={() => setRevision(value => value + 1)}>{t('Atualizar resumo', 'Refresh summary')}</button>
      </div>
    </header>
    <div aria-busy={!current}>
      {!current ? <p className="billing-summary__state" role="status">{t('A consultar o resumo financeiro…', 'Loading the financial summary…')}</p>
        : summary ? renderSummary()
          : <p className="billing-summary__state billing-summary__state--error" role="alert">{t('Não foi possível consultar o resumo financeiro. Atualize para tentar novamente.', 'The financial summary could not be loaded. Refresh to try again.')}</p>}
    </div>
  </section>;
}
