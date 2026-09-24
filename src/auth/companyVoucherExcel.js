import { formatVoucher, loadCompanyVouchers } from './companyVouchers';

export async function buildCompanyVoucherExcel(purchase, vouchers) {
  if (purchase?.status !== 'paid') throw new Error('A compra ainda não tem pagamento confirmado.');
  const available = vouchers.filter((v) => v.status === 'available');
  if (!available.length) throw new Error('Esta compra não tem códigos disponíveis para exportar.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CIRC 2027';
  const sheet = workbook.addWorksheet('Códigos', { views: [{ state: 'frozen', ySplit: 10 }] });
  sheet.columns = [{ width: 8 }, { width: 48 }, { width: 32 }, { width: 38 }, { width: 22 }];
  const lines = [
    'CIRC 2027 - Inscrições de empresa',
    'Empresa: ' + purchase.company.name,
    'NIF / identificação fiscal: ' + purchase.company.taxNumber + ' | Compra: ' + purchase.id,
    'Externo · Presencial · Dois dias · Sem jantar nem cursos',
    'Inscrição: https://circ-coimbra.org/conta/inscricoes - iniciar sessão e confirmar o email.',
    'Completar o perfil, selecionar Externo e Presencial e utilizar o código da empresa.',
    'Atribuir um código diferente por pessoa. Nome, email e data de envio são preenchidos pela empresa, apenas neste ficheiro.',
    'Disponíveis à data da exportação: ' + new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) + ' (Lisboa). Não é um documento fiscal.',
  ];
  lines.forEach((line, i) => {
    sheet.mergeCells(i + 1, 1, i + 1, 5);
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line;
    cell.font = { name: 'Calibri', size: i === 0 ? 18 : 11, bold: i < 2, color: { argb: i === 0 ? 'FF232EB7' : 'FF202445' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(i + 1).height = i === 1 ? 42 : 30;
  });
  sheet.addTable({ name: 'CodigosEmpresa', ref: 'A10', headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['N.º', 'Código individual', 'Nome do participante', 'Email do participante', 'Data de envio'].map((name) => ({ name, filterButton: true })),
    rows: available.map((v, i) => [i + 1, formatVoucher(v.code), '', '', '']),
  });
  sheet.getRow(10).height = 28;
  for (let row = 11; row < 11 + available.length; row += 1) {
    sheet.getRow(row).height = 25;
    sheet.getCell(row, 2).numFmt = '@';
    sheet.getCell(row, 2).font = { name: 'Consolas', size: 11 };
    sheet.getCell(row, 5).numFmt = 'dd/mm/yyyy';
  }
  const name = purchase.company.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return { buffer: await workbook.xlsx.writeBuffer(), filename: `circ-2027-vouchers-${name}-${purchase.id}.xlsx` };
}

export async function exportCompanyVoucherExcel(purchase) {
  const vouchers = await loadCompanyVouchers(purchase);
  const { buffer, filename } = await buildCompanyVoucherExcel(purchase, vouchers);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
  return vouchers;
}
