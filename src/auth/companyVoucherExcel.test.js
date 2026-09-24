import ExcelJS from 'exceljs';
import { buildCompanyVoucherExcel } from './companyVoucherExcel';

const purchase = { id: 'purchase-1', status: 'paid', company: { name: '=Empresa & Filhos', taxNumber: '001234567' } };
test('real xlsx preserves text codes, filters used codes and provides editable distribution columns', async () => {
  const { buffer, filename } = await buildCompanyVoucherExcel(purchase, [
    { code: '0'.repeat(32), status: 'available' },
    { code: 'b'.repeat(32), status: 'redeemed' },
    { code: 'c'.repeat(32), status: 'cancelled' },
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Códigos');
  expect(filename).toMatch(/\.xlsx$/);
  expect(sheet.getCell('B11').value).toBe('0000-0000-0000-0000-0000-0000-0000-0000');
  expect(sheet.getCell('B12').value).toBeNull();
  expect(sheet.getCell('C10').value).toBe('Nome do participante');
  expect(sheet.getCell('D10').value).toBe('Email do participante');
  expect(sheet.getCell('A2').value).toBe('Empresa: =Empresa & Filhos');
  expect(sheet.getCell('A2').formula).toBeUndefined();
  expect(sheet.views[0].ySplit).toBe(10);
  expect(sheet.getTable('CodigosEmpresa')).toBeDefined();
});
test('does not export unpaid or empty purchases', async () => {
  await expect(buildCompanyVoucherExcel({ ...purchase, status: 'pending' }, [])).rejects.toThrow();
  await expect(buildCompanyVoucherExcel(purchase, [])).rejects.toThrow('não tem códigos disponíveis');
});
