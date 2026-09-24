import { buildCompanyVoucherDocument } from './companyVoucherPdf';

const purchase = { id: 'purchase-1', status: 'paid', company: { name: '<Empresa & Filhos>', taxNumber: '123456789' } };
test('export includes only available codes and escapes company text', () => {
  const html = buildCompanyVoucherDocument(purchase, [
    { code: 'a'.repeat(32), status: 'available' },
    { code: 'b'.repeat(32), status: 'redeemed' },
    { code: 'c'.repeat(32), status: 'cancelled' },
  ]);
  expect(html).toContain('aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa');
  expect(html).not.toContain('bbbb-bbbb');
  expect(html).not.toContain('cccc-cccc');
  expect(html).toContain('&lt;Empresa &amp; Filhos&gt;');
  expect(html).toContain('não é uma fatura nem um recibo');
});
test('export refuses unpaid purchases and empty available lists', () => {
  expect(() => buildCompanyVoucherDocument({ ...purchase, status: 'pending' }, [])).toThrow();
  expect(() => buildCompanyVoucherDocument(purchase, [])).toThrow('não tem códigos disponíveis');
});
test('maximum purchase has seven numbered pages without losing codes', () => {
  const html = buildCompanyVoucherDocument(purchase, Array.from({ length: 50 }, (_, i) => ({ code: i.toString(16).padStart(32, '0'), status: 'available' })));
  expect(html.match(/class="page"/g)).toHaveLength(7);
  expect(html.match(/<code>/g)).toHaveLength(50);
  expect(html).toContain('Página 7 de 7');
});
