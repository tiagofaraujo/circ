import { formatVoucher, loadCompanyVouchers } from './companyVouchers';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildCompanyVoucherDocument(purchase, vouchers, date = new Date()) {
  if (purchase?.status !== 'paid') throw new Error('A compra ainda não tem pagamento confirmado.');
  const available = vouchers.filter((v) => v.status === 'available');
  if (!available.length) throw new Error('Esta compra não tem códigos disponíveis para exportar.');
  const company = escapeHtml(purchase.company.name);
  const filename = ('circ-2027-vouchers-' + purchase.company.name + '-' + purchase.id)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const pages = [];
  for (let i = 0; i < available.length; i += 10) pages.push(available.slice(i, i + 10));
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escapeHtml(filename)}.pdf</title>
    <style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#202445;font:10pt/1.45 Arial,Helvetica,sans-serif;background:#eee}
    .toolbar{padding:16px;text-align:center;background:#232eb7;color:white}.toolbar button{padding:10px 20px;font:inherit;cursor:pointer}
    .page{background:white;width:210mm;margin:16px auto;padding:16mm;break-after:page}.page:last-child{break-after:auto}
    header{border-bottom:3px solid #232eb7;padding-bottom:12px;display:flex;justify-content:space-between;align-items:center}
    .brand{font-size:26pt;font-weight:bold;color:#232eb7}header small{color:#e6503b}h1{font-size:19pt;color:#232eb7;margin:20px 0 6px}
    .company{font-size:13pt;font-weight:bold;margin:0;overflow-wrap:anywhere}.meta{font-size:9pt;color:#555;overflow-wrap:anywhere}
    .scope{background:#efe8df;padding:12px;margin:14px 0}h2{font-size:11pt;margin:0 0 6px}ol{padding-left:20px;margin:6px 0 14px}
    table{width:100%;border-collapse:collapse;margin:16px 0}th{text-align:left;color:#232eb7;border-bottom:2px solid #232eb7;padding:8px}
    td{padding:10px 8px;border-bottom:1px solid #ddd}code{font:11pt 'Courier New',monospace;white-space:nowrap}tr{break-inside:avoid}
    a{color:#232eb7}.note{font-size:9pt}footer{border-top:1px solid #ddd;padding-top:10px;margin-top:18px;font-size:8pt;color:#666;display:flex;justify-content:space-between;gap:12px}
    @media print{body{background:white}.toolbar{display:none}.page{width:auto;margin:0;padding:0}}
    </style></head><body><div class="toolbar"><button id="print">Imprimir / Guardar como PDF</button><p>Escolha «Guardar como PDF» e desative os cabeçalhos e rodapés do navegador.</p></div>
    ${pages.map((page, index) => `<section class="page"><header><div class="brand">CIRC 2027</div><small>Congresso Internacional<br>de Radiologia de Coimbra</small></header>
      <h1>Códigos de inscrição</h1><p class="company">${company}</p>
      <p class="meta">NIF / identificação fiscal: ${escapeHtml(purchase.company.taxNumber)}<br>Referência da compra: ${escapeHtml(purchase.id)}<br>${available.length} código(s) disponível(eis) nesta exportação</p>
      <div class="scope"><strong>Congressista externo · Presencial · Dois dias</strong><br>Inscrição paga pela empresa. Não inclui jantar nem cursos.</div>
      <h2>Como utilizar</h2><ol><li>Aceda a <a href="https://circ-coimbra.org/conta/inscricoes">circ-coimbra.org/conta/inscricoes</a>, inicie sessão ou crie uma conta e confirme o email.</li><li>Complete o perfil e escolha Externo e Presencial, sem jantar nem cursos.</li><li>Introduza o código da empresa e confirme a inscrição.</li></ol>
      <table><thead><tr><th>N.º</th><th>Código individual</th></tr></thead><tbody>${page.map((v, j) => `<tr><td>${index * 10 + j + 1}</td><td><code>${escapeHtml(formatVoucher(v.code))}</code></td></tr>`).join('')}</tbody></table>
      <p class="note">Entregue um código diferente a cada participante. Cada código permite uma única inscrição. Guarde esta lista e partilhe apenas o código atribuído a cada pessoa.</p>
      <p class="note">Os códigos estavam disponíveis na data de exportação; a sua validade é verificada ao confirmar a inscrição. Este documento não é uma fatura nem um recibo.</p>
      <footer><span>Exportado em ${escapeHtml(date.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }))} (Lisboa)</span><span>Página ${index + 1} de ${pages.length}</span></footer></section>`).join('')}</body></html>`;
}

export async function exportCompanyVoucherPdf(purchase) {
  const preview = window.open('', '_blank', 'popup=yes,width=920,height=1040');
  if (!preview) throw new Error('Permita a abertura de janelas neste site para exportar o PDF.');
  preview.opener = null;
  preview.document.body.textContent = 'A consultar os códigos disponíveis…';
  try {
    const vouchers = await loadCompanyVouchers(purchase);
    const html = buildCompanyVoucherDocument(purchase, vouchers);
    if (preview.closed) throw new Error('A janela do PDF foi fechada. Volte a exportar.');
    preview.document.open();
    preview.document.write(html);
    preview.document.close();
    preview.document.getElementById('print').addEventListener('click', () => { preview.focus(); preview.print(); });
    return vouchers;
  } catch (error) {
    preview.close();
    throw error;
  }
}
