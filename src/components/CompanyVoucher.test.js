import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '../auth/AuthContext';
import { redeemCompanyVoucher, subscribeCompanyConfig } from '../auth/companyVouchers';
import CompanyVoucher from './CompanyVoucher';
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/companyVouchers', () => ({ redeemCompanyVoucher: jest.fn(), subscribeCompanyConfig: jest.fn(), companyError: () => 'Envio falhou.' }));
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-11-15T00:00:00Z')); jest.clearAllMocks(); useAuth.mockReturnValue({ user: { uid: 'u', emailVerified: true } }); subscribeCompanyConfig.mockImplementation((next) => { next(true); return () => {}; }); });
afterEach(() => jest.useRealTimers());
test('voucher submission stays disabled before the public opening even when codes are enabled', () => {
  jest.setSystemTime(new Date('2026-11-14T23:59:59.999Z'));
  render(<CompanyVoucher eligible />);fireEvent.click(screen.getByText('Tem um voucher?'));
  fireEvent.change(screen.getByLabelText('Código do voucher'),{target:{value:'a'.repeat(32)}});
  expect(screen.getByRole('button')).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('15 de novembro de 2026');
  fireEvent.submit(screen.getByRole('form',{name:'Confirmar inscrição com voucher'}));expect(redeemCompanyVoucher).not.toHaveBeenCalled();
});
test('a voucher form left open becomes available automatically at the opening without redeeming the code', () => {
  jest.setSystemTime(new Date('2026-11-14T23:59:58Z'));
  render(<CompanyVoucher eligible />);fireEvent.click(screen.getByText('Tem um voucher?'));
  fireEvent.change(screen.getByLabelText('Código do voucher'),{target:{value:'a'.repeat(32)}});
  expect(screen.getByRole('button')).toBeDisabled();
  act(()=>{jest.advanceTimersByTime(2025);});
  expect(screen.getByRole('button')).toBeEnabled();expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(redeemCompanyVoucher).not.toHaveBeenCalled();
});
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
