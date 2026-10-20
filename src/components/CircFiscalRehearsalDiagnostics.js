import React from 'react';
import { inspectCIRC27Rehearsal } from '../pages/circ2027FiscalDiagnostics';

export default function CircFiscalRehearsalDiagnostics({ rehearsal, resources, en = false }) {
  const check = inspectCIRC27Rehearsal(rehearsal, resources);
  if (!check) return null;
  const t = (pt, english) => en ? english : pt;
  const money = cents => Number.isSafeInteger(cents)
    ? new Intl.NumberFormat(en ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100) : '—';
  const tax = rehearsal.taxPreview;
  return <div className="sandbox-checkout__confirmed">
    <h3>{t('Diagnóstico fiscal CIRC2027 — só leitura', 'CIRC2027 fiscal diagnostics — read only')}</h3>
    {!check.policyCurrent && <p role="alert"><strong>{t('Ensaio anterior à configuração M07.', 'Rehearsal predates the M07 configuration.')}</strong> {rehearsal.status === 'simulated-issued'
      ? t('Para voltar a testar, use «Repor este ensaio» e prepare uma nova pré-visualização. O pagamento não será alterado.', 'To test again, reset this rehearsal and prepare a new preview. The payment will not change.')
      : t('Atualize a pré-visualização antes de simular a emissão.', 'Refresh the preview before simulating issue.')}</p>}
    <p>{t('Série FR 244 / CIRC2027', 'FR series 244 / CIRC2027')}: <strong>{check.seriesFound ? t('Presente na API', 'Present in the API') : t('Não confirmada nesta leitura', 'Not confirmed in this read')}</strong> · {check.seriesInPayload ? t('Incluída na pré-visualização', 'Included in the preview') : t('Não incluída nesta pré-visualização', 'Not included in this preview')}</p>
    <ul>{check.serviceChecks.map((item, index) => <li key={`${item.code}-${index}`}>
      <strong>{item.code}</strong> (ID {item.id || '—'}): {item.taxCode === 'ISE' ? t('Isento · M07 / artigo 9.º', 'Exempt · M07 / article 9') : item.taxCode === 'NOR' ? t('IVA 23% incluído', '23% VAT included') : t('Tratamento do jantar autónomo por esclarecer', 'Separate dinner tax treatment pending')}
      {' — '}<strong>{item.ok ? t('Correspondência técnica confirmada', 'Technical match confirmed') : t('Por confirmar / divergente', 'Unconfirmed / mismatch')}</strong>
      {item.review === 'course-tax-clarification-pending' && <> · {t('23% segundo a indicação recebida; esclarecimento dos cursos pendente.', '23% per the instruction received; course clarification pending.')}</>}
      {item.issues.length > 0 && <small> ({item.issues.join(', ')})</small>}
    </li>)}</ul>
    <p>{t('Total das linhas', 'Line total')}: {money(check.calculatedCents)} · {t('Pagamento registado', 'Recorded payment')}: {money(check.expectedCents)} — <strong>{check.exactTotal ? t('Coincide', 'Matches') : t('DIVERGÊNCIA', 'MISMATCH')}</strong></p>
    {check.policyCurrent && tax && <>
      <h4>{t('Discriminação fiscal — cálculo local de teste', 'Tax breakdown — local test calculation')}</h4>
      <ul>{tax.lines.map((line, index) => <li key={`${line.itemCode}-${index}`}>
        {line.itemCode}: {money(line.grossCents)} — {line.pending
          ? t('IVA por definir; sem cálculo fiscal assumido.', 'VAT pending; no tax calculation assumed.')
          : <>{t('base', 'net')} {money(line.netCents)} + IVA {money(line.vatCents)}{line.exemptionCode ? ` · ${line.exemptionCode}` : ''}</>}
      </li>)}</ul>
      {tax.complete ? <p><strong>{t('Base total', 'Total net')}: {money(tax.netCents)} · IVA: {money(tax.vatCents)} · Total: {money(tax.grossCents)}</strong></p>
        : <p><strong>{t('Total comercial preservado; total de IVA não apurado enquanto houver linhas por esclarecer.', 'Commercial total preserved; total VAT is undetermined while tax treatment is pending.')}</strong></p>}
      <p>{t('Estimativa com arredondamento por linha. Não valida a aceitação nem o cálculo da API do TOConline.', 'Per-line rounded estimate. This does not validate TOConline API acceptance or calculation.')}</p>
    </>}
    <p><strong>{t('Emissão fiscal real bloqueada', 'Real fiscal issuance blocked')}.</strong> {t('A FR no recebimento e a isenção das inscrições seguem a indicação contabilística recebida. Permanecem por validar as fichas na API, a comunicação da série/ATCUD, os dados reais do cliente e a emissão no TOConline. O jantar autónomo e o esclarecimento dos cursos mantêm-se pendentes.', 'FR at receipt and registration exemption follow the accounting instruction received. API catalogue checks, series registration/ATCUD, real customer data and TOConline issuance remain to be validated. Separate dinner treatment and course clarification remain pending.')}</p>
  </div>;
}
