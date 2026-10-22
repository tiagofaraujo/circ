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
    {!check.policyCurrent && <p role="alert"><strong>{t('Ensaio anterior à configuração M07.', 'Rehearsal predates the M07 configuration.')}</strong> {t('A revisão atual inclui o jantar isento.', 'The current revision includes exempt dinner tickets.')} {rehearsal.status === 'simulated-issued'
      ? t('Para voltar a testar, use «Repor este ensaio» e prepare uma nova pré-visualização. O pagamento não será alterado.', 'To test again, reset this rehearsal and prepare a new preview. The payment will not change.')
      : t('Atualize a pré-visualização antes de simular a emissão.', 'Refresh the preview before simulating issue.')}</p>}
    <p>{t('Série FR 244 / CIRC2027', 'FR series 244 / CIRC2027')}: <strong>{check.seriesFound ? t('Presente na API', 'Present in the API') : t('Não confirmada nesta leitura', 'Not confirmed in this read')}</strong> · {check.seriesInPayload ? t('Incluída na pré-visualização', 'Included in the preview') : t('Não incluída nesta pré-visualização', 'Not included in this preview')}</p>
    <ul>{check.serviceChecks.map((item, index) => <li key={`${item.code}-${index}`}>
      <strong>{item.code}</strong> (ID {item.id || '—'}): {item.taxCode === 'ISE' ? t('Isento · M07 / artigo 9.º', 'Exempt · M07 / article 9') : item.taxCode === 'NOR' ? t('IVA 23% incluído', '23% VAT included') : t('Enquadramento fiscal por definir', 'Tax treatment pending')}
      {' — '}<strong>{item.ok ? t('Correspondência técnica confirmada', 'Technical match confirmed') : t('Por confirmar / divergente', 'Unconfirmed / mismatch')}</strong>
      {item.issues.length > 0 && <small> ({item.issues.join(', ')})</small>}
    </li>)}</ul>
    <p>{t('Total das linhas', 'Line total')}: {money(check.calculatedCents)} · {t('Pagamento registado', 'Recorded payment')}: {money(check.expectedCents)} — <strong>{check.exactTotal ? t('Coincide', 'Matches') : t('DIVERGÊNCIA', 'MISMATCH')}</strong></p>
    {check.policyCurrent && tax && <>
      <h4>{t('Discriminação fiscal — cálculo local de teste', 'Tax breakdown — local test calculation')}</h4>
      <ul>{tax.lines.map((line, index) => <li key={`${line.itemCode}-${index}`}>
        {line.itemCode}: {money(line.grossCents)} — {line.pending
          ? t('IVA por definir; sem cálculo fiscal assumido.', 'VAT pending; no tax calculation assumed.')
          : <>{line.exemptionCode ? t('valor isento', 'exempt amount') : t('base tributável', 'taxable base')} {money(line.netCents)} + IVA {money(line.vatCents)}{line.exemptionCode ? ` · ${line.exemptionCode}` : ''}</>}
      </li>)}</ul>
      {tax.complete ? <>
        <p>{t('Total isento', 'Total exempt')}: <strong>{money(tax.exemptCents)}</strong> · {t('Base tributável', 'Taxable base')}: <strong>{money(tax.taxableNetCents)}</strong></p>
        <p><strong>{t('Total sem IVA (inclui valores isentos)', 'Total excluding VAT (includes exempt amounts)')}: {money(tax.netCents)} · IVA: {money(tax.vatCents)} · Total: {money(tax.grossCents)}</strong></p>
      </> : <p><strong>{t('Total comercial preservado; total de IVA não apurado enquanto houver linhas por esclarecer.', 'Commercial total preserved; total VAT is undetermined while tax treatment is pending.')}</strong></p>}
      <p>{t('Estimativa com arredondamento por linha. Não valida a aceitação nem o cálculo da API do TOConline.', 'Per-line rounded estimate. This does not validate TOConline API acceptance or calculation.')}</p>
    </>}
    <p>{t('Configuração de trabalho: inscrições e jantar (participante ou acompanhante) isentos M07; cursos a 23%. Os preços finais não são alterados. Estas regras não constituem validação das vendas virtuais a clientes no estrangeiro.', 'Working configuration: registrations and dinner tickets (participants or guests) exempt under M07; courses at 23%. Final prices are unchanged. These rules do not validate virtual sales to customers abroad.')}</p>
    <p><strong>{t('Emissão fiscal real bloqueada', 'Real fiscal issuance blocked')}.</strong> {t('A atualização do website não altera as fichas do TOConline. Permanecem por validar as fichas na API, a comunicação da série/ATCUD, os dados reais do cliente, os meios de recebimento e a emissão no TOConline.', 'Updating the website does not change TOConline service records. API catalogue checks, series registration/ATCUD, real customer data, receipt methods and TOConline issuance remain to be validated.')}</p>
  </div>;
}
