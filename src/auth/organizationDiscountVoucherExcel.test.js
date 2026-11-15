import ExcelJS from 'exceljs';
import { buildOrganizationDiscountVoucherExcel } from './organizationDiscountVoucherExcel';

const batch = {
  batchId: '12345678-abcd-4000-a000-123456789abc', label: '=Parceiros científicos', count: 1,
  createdAt: '2026-11-15T12:00:00.000Z', codes: ['CIRC27-D-0000-0000-0000-0000-0000-0000-0000-0000'],
};

test.each([
  ['percentage', 1250, 0.125, '0.00%'],
  ['fixed', 1750, 17.5, '#,##0.00 "€"'],
])('exports %s discounts as numbers in an Excel workbook and preserves the code and batch ID', async (type, value, expected, numFmt) => {
  const { buffer, filename } = await buildOrganizationDiscountVoucherExcel({ ...batch, discount: { type, value } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Vouchers');
  expect(filename).toContain(batch.batchId);
  expect(sheet.getCell('B9').value).toBe(batch.codes[0]);
  expect(sheet.getCell('A3').value).toContain(batch.batchId);
  expect(sheet.getCell('A2').formula).toBeUndefined();
  expect(sheet.getCell('C9').value).toBe(expected);
  expect(sheet.getCell('C9').numFmt).toBe(numFmt);
});
