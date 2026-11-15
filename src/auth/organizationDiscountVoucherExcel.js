import { downloadVoucherExcel } from './companyVoucherExcel';

export function formatOrganizationDiscount({ type, value }) {
  const options = type === 'fixed' ? { style: 'currency', currency: 'EUR' } : { maximumFractionDigits: 2 };
  const amount = (value / 100).toLocaleString('pt-PT', options);
  return type === 'fixed' ? amount : `${amount}%`;
}

export async function buildOrganizationDiscountVoucherExcel(batch) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CIRC 2027';
  const sheet = workbook.addWorksheet('Vouchers', { views: [{ state: 'frozen', ySplit: 8 }] });
  sheet.columns = [{ width: 8 }, { width: 54 }, { width: 16 }];
  const discount = formatOrganizationDiscount(batch.discount);
  const lines = [
    'CIRC 2027 · Vouchers de desconto da organização',
    `Lote ${batch.label} · ${batch.count} códigos · ${discount} de desconto`,
    `Identificador do lote ${batch.batchId}`,
    `Emitido em ${new Date(batch.createdAt).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })} (Lisboa)`,
    'O desconto incide sobre o preço do congresso. Cada código pode ser utilizado uma vez.',
    'Introduzir o código em https://circ-coimbra.org/conta/inscricoes antes de avançar para o pagamento.',
  ];
  lines.forEach((line, i) => {
    sheet.mergeCells(i + 1, 1, i + 1, 3);
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line;
    cell.font = { name: 'Calibri', size: i === 0 ? 18 : 11, bold: i < 2, color: { argb: i === 0 ? 'FF232EB7' : 'FF202445' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(i + 1).height = i === 1 ? 50 : 42;
  });
  sheet.addTable({ name: 'VouchersOrganizacao', ref: 'A8', headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['N.º', 'Código individual', 'Desconto'].map(name => ({ name, filterButton: true })),
    rows: batch.codes.map((code, index) => [index + 1, code, batch.discount.value / (batch.discount.type === 'fixed' ? 100 : 10000)]),
  });
  sheet.getRow(8).height = 28;
  batch.codes.forEach((_, index) => {
    const row = 9 + index;
    sheet.getRow(row).height = 25;
    sheet.getCell(row, 2).numFmt = '@';
    sheet.getCell(row, 2).font = { name: 'Consolas', size: 11 };
    sheet.getCell(row, 3).numFmt = batch.discount.type === 'fixed' ? '#,##0.00 "€"' : '0.00%';
  });
  return { buffer: await workbook.xlsx.writeBuffer(), filename: `circ-2027-vouchers-organizacao-${batch.batchId}.xlsx` };
}

export async function exportOrganizationDiscountVoucherExcel(batch) {
  downloadVoucherExcel(await buildOrganizationDiscountVoucherExcel(batch));
}
