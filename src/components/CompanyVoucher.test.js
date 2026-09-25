import { fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '../auth/AuthContext';
import { redeemCompanyVoucher, subscribeCompanyConfig } from '../auth/companyVouchers';
import CompanyVoucher from './CompanyVoucher';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/companyVouchers', () => ({ redeemCompanyVoucher: jest.fn(), subscribeCompanyConfig: jest.fn(), companyError: () => 'Envio falhou.' }));
beforeEach(() => { jest.clearAllMocks(); useAuth.mockReturnValue({ user: { uid: 'u', emailVerified: true } }); subscribeCompanyConfig.mockImplementation((next) => { next(true); return () => {}; }); });
test('requires eligible external onsite selection without extras and explicit confirmation', async () => {
  redeemCompanyVoucher.mockResolvedValue('circ-2027-u');
  const { rerender } = render(<CompanyVoucher eligible={false} />);
  fireEvent.click(screen.getByText('Tem um voucher?'));
  fireEvent.change(screen.getByLabelText('Código do voucher'), { target: { value: 'a'.repeat(32) } });
  expect(screen.getByRole('button')).toBeDisabled(); expect(redeemCompanyVoucher).not.toHaveBeenCalled();
  rerender(<CompanyVoucher eligible />); fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByText('Inscrição confirmada com voucher.')).toBeInTheDocument();
  expect(redeemCompanyVoucher).toHaveBeenCalledTimes(1);
});
test('failed redemption keeps code for retry and does not claim confirmation', async () => {
  redeemCompanyVoucher.mockRejectedValue(new Error('unavailable'));
  render(<CompanyVoucher eligible />); fireEvent.click(screen.getByText('Tem um voucher?')); fireEvent.change(screen.getByLabelText('Código do voucher'), { target: { value: 'a'.repeat(32) } });
  fireEvent.click(screen.getByRole('button')); expect(await screen.findByRole('alert')).toHaveTextContent('Envio falhou.');
  expect(screen.getByLabelText('Código do voucher')).toHaveValue('a'.repeat(32));
  expect(screen.queryByText('Inscrição confirmada com voucher.')).not.toBeInTheDocument();
});
