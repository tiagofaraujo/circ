import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegistrationBuilder from './RegistrationBuilder';
import { useAuth } from '../../auth/AuthContext';
import { useUlsEligibility } from '../../auth/ulsEligibilityStore';
import { useStudentVerification } from '../../auth/studentVerificationStore';
import { useRegistrationCapacity } from '../../auth/registrationCapacity';
import PublicLiveCheckout from '../PublicLiveCheckout';
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pt' }) }));
jest.mock('../../auth/ulsEligibilityStore', () => ({ useUlsEligibility: jest.fn() }));
jest.mock('../../auth/studentVerificationStore', () => ({ useStudentVerification: jest.fn() }));
jest.mock('../../auth/registrationCapacity', () => ({ useRegistrationCapacity: jest.fn() }));
let mockCapacityEnabled;
jest.mock('../../data/registration2027', () => ({
 ...jest.requireActual('../../data/registration2027'),
 get REGISTRATION_CAPACITY_ENABLED() { return mockCapacityEnabled; },
}));
jest.mock('./UlsVerification', () => () => <div>ULS validation</div>);
jest.mock('./StudentVerification', () => () => <div>Student document form</div>);
jest.mock('../CompanyVoucher', () => ({ CompanyRegistrationGate: ({ children }) => children(null) }));
jest.mock('../PublicLiveCheckout', () => jest.fn(() => <div>Production checkout</div>));
const capacity = { status: 'ready', limits: { onsite: 400, morningCourse: 170, afternoonCourse: 170 }, remaining: { onsite: 10, morningCourse: 10, afternoonCourse: 10 }, refresh: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); mockCapacityEnabled = false; useRegistrationCapacity.mockReturnValue(capacity); PublicLiveCheckout.mockImplementation(() => <div>Production checkout</div>); useAuth.mockReturnValue({ user: { uid: 'user', emailVerified: true }, isAdmin: false }); useStudentVerification.mockReturnValue({ approved: false }); useUlsEligibility.mockReturnValue({ verified: false }); });
test('choosing a profile never adds a congress fee and courses are separate from congress attendance', () => {
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByText('Production checkout')).toBeInTheDocument();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: false, selection: { profile: 'external', congressMode: 'courses-only', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } });
 expect(screen.getByRole('region', { name: 'O seu perfil de inscrição' })).not.toHaveTextContent('€');
 expect(screen.getByText('Valor estimado').parentElement).toHaveTextContent('0 €');
 expect(screen.queryByText(/Modo de teste|Criar inscrição de teste|15 de novembro/)).not.toBeInTheDocument();
 expect(screen.getByRole('radio', { name: /Congresso virtual/ })).toBeEnabled();
 expect(screen.getByRole('radio', { name: /Não participar no congresso/ })).toBeChecked();
 expect(within(screen.getByRole('region', { name: 'Participação no congresso' })).queryByRole('checkbox')).not.toBeInTheDocument();
 expect(within(screen.getByRole('region', { name: 'Cursos pré-congresso' })).getByRole('checkbox', { name: /Via Verde AVC/ })).toBeEnabled();
});
test('student and ULS rates require eligibility even for the administrator', () => {
 useAuth.mockReturnValue({ user: { uid: 'admin', emailVerified: true }, isAdmin: true });
 const { rerender } = render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 fireEvent.click(screen.getByRole('radio', { name: /Estudante de IMR/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByText('Student document form')).toBeInTheDocument();
 useStudentVerification.mockReturnValue({ approved: true }); rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(true);
 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
test('onsite ULS participants keep their selections and use the checkout for organiser discount codes', () => {
 useUlsEligibility.mockReturnValue({ verified: true });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 expect(screen.queryByText('Tem um voucher de empresa?')).not.toBeInTheDocument();
 expect(screen.queryByText('Voucher de organizador para cursos e jantar')).not.toBeInTheDocument();

 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 expect(screen.queryByText('Tem um voucher de empresa?')).not.toBeInTheDocument();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: {
  profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0,
 } });

 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: {
  profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: true, dinnerQuantity: 1,
 } });
 expect(screen.queryByText('Voucher de organizador para cursos e jantar')).not.toBeInTheDocument();
 expect(screen.queryByText(/Retire os cursos|Após a confirmação do pagamento/)).not.toBeInTheDocument();
});
test('a company voucher covers the registration in the same summary even with a negotiated unit price', () => {
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 const { onVoucherQuote } = PublicLiveCheckout.mock.calls.at(-1)[0];
 act(() => onVoucherQuote({ kind: 'company-voucher', amountCents: 0, currency: 'EUR',
  companyVoucher: { amountCents: 6500, currency: 'EUR' } }));
 expect(screen.getByText('Inscrição coberta pelo voucher de empresa.')).toBeVisible();
 expect(screen.getByText('Total a pagar').parentElement).toHaveTextContent('0,00 €');
 expect(screen.queryByText('Subtotal')).not.toBeInTheDocument();
 expect(screen.queryByText('Valor estimado')).not.toBeInTheDocument();

 act(() => onVoucherQuote(null));
 expect(screen.getByText('Valor estimado')).toBeVisible();
 expect(screen.queryByText('Inscrição coberta pelo voucher de empresa.')).not.toBeInTheDocument();
});
test.each([
 ['organiser benefit', { organizerBenefit: { amountCents: 7000 }, amountCents: 8500 }, 'Voucher de organizador', '155,00 €', '−70,00 €', '85,00 €'],
 ['full congress discount', { discount: { amountCents: 5500 }, amountCents: 0 }, 'Código de desconto', '55,00 €', '−55,00 €', '0,00 €'],
 ['fixed registration discount', { discount: { amountCents: 7000, scope: 'registration' }, amountCents: 5500 }, 'Código de desconto', '125,00 €', '−70,00 €', '55,00 €'],
])('the summary uses the applied %s quote and clears it when invalidated', (_name, quote, label, subtotal, savings, due) => {
 useUlsEligibility.mockReturnValue({ verified: true });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 const onVoucherQuote = PublicLiveCheckout.mock.calls.at(-1)[0].onVoucherQuote;
 act(() => onVoucherQuote(quote));
 expect(screen.getByText('Subtotal').parentElement).toHaveTextContent(subtotal);
 expect(screen.getByText(label).parentElement).toHaveTextContent(savings);
 expect(screen.getByText('Total a pagar').parentElement).toHaveTextContent(due);
 if (quote.organizerBenefit) expect(screen.getByText('Inclui os dois cursos e um bilhete de jantar.')).toBeVisible();
 expect(screen.queryByText('Valor estimado')).not.toBeInTheDocument();

 act(() => onVoucherQuote(null));
 expect(screen.getByText('Valor estimado')).toBeVisible();
 expect(screen.queryByText('Total a pagar')).not.toBeInTheDocument();
});
test('the organiser voucher displays included options and the stepper adds an extra dinner ticket', () => {
 useUlsEligibility.mockReturnValue({ verified: true });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 fireEvent.click(screen.getByRole('radio', { name: /ULS Coimbra/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 const onVoucherQuote = PublicLiveCheckout.mock.calls.at(-1)[0].onVoucherQuote;
 const quote = { organizerBenefit: { amountCents: 7000 }, amountCents: 5500 };
 const morning = screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ });
 const afternoon = screen.getByRole('checkbox', { name: /Via Verde AVC/ });
 const dinners = screen.getByRole('spinbutton');
 act(() => onVoucherQuote(quote));
 expect(morning).toBeChecked();
 expect(afternoon).toBeChecked();
 expect(morning).toBeDisabled();
 expect(dinners).toHaveValue(1);
 expect(screen.getByRole('button', { name: 'Retirar um bilhete de jantar' })).toBeDisabled();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].selection).toMatchObject({ morningCourse: false, afternoonCourse: true, dinnerQuantity: 0 });

 act(() => onVoucherQuote(null));
 expect(morning).not.toBeChecked();
 expect(afternoon).toBeChecked();
 expect(dinners).toHaveValue(null);

 act(() => onVoucherQuote(quote));
 fireEvent.click(screen.getByRole('button', { name: 'Adicionar um bilhete de jantar' }));
 expect(dinners).toHaveValue(2);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].selection.dinnerQuantity).toBe(2);
});
test('email verification is required before preparing payment', () => {
 useAuth.mockReturnValue({ user: { uid: 'user', emailVerified: false }, isAdmin: false });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByRole('alert')).toHaveTextContent('Confirme o email');
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
test('full finite options do not replace the current selection and virtual plus dinner remains available', () => {
 mockCapacityEnabled = true;
 useRegistrationCapacity.mockReturnValue({ ...capacity, remaining: { onsite: 0, morningCourse: 0, afternoonCourse: 0 } });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByRole('radio', { name: /Não participar no congresso/ })).toBeChecked();
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeDisabled();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeDisabled();
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: { congressMode: 'virtual', dinnerQuantity: 2 } });
 expect(screen.getByText(/Os pedidos pendentes não reservam lugares/)).toBeInTheDocument();
});
test.each(['loading', 'error'])('capacity %s blocks finite purchases but permits virtual attendance', status => {
 mockCapacityEnabled = true;
 useRegistrationCapacity.mockReturnValue({ ...capacity, status, remaining: null });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 expect(screen.getByRole('checkbox', { name: /Via Verde AVC/ })).toBeDisabled();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso virtual/ }));
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(true);
 expect(screen.getByRole('radio', { name: /Congresso virtual/ })).toBeEnabled();
});
test('remaining places are visible and the manual refresh is passed through to checkout', () => {
 mockCapacityEnabled = true;
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(screen.getByText('10 / 400 lugares disponíveis')).toBeInTheDocument();
 expect(screen.getAllByText('10 / 170 lugares disponíveis')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button', { name: 'Atualizar lugares disponíveis' }));
 expect(capacity.refresh).toHaveBeenCalledTimes(1);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].onCapacityRefresh).toBe(capacity.refresh);
});

test('suspended capacity allows onsite registration with both courses and dinner even when the lookup is unavailable', () => {
 useRegistrationCapacity.mockReturnValue({ ...capacity, status: 'error', remaining: null });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(useRegistrationCapacity).toHaveBeenCalledWith(expect.objectContaining({ uid: 'user' }), false);
 expect(screen.queryByRole('region', { name: 'Lugares disponíveis' })).not.toBeInTheDocument();
 expect(screen.getByRole('radio', { name: /Congresso presencial/ })).toBeEnabled();
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Pós-processamento em ressonância magnética/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
 expect(PublicLiveCheckout.mock.calls.at(-1)[0]).toMatchObject({ eligible: true, selection: {
  congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 1,
 } });
});

test.each([
 ['Congressista externo', 'external', 35],
 ['ULS Coimbra', 'uls', 20],
 ['Estudante de IMR', 'student', 35],
])('an eligible %s can buy courses without congress and keeps course choices when adding or removing congress', (category, profile, price) => {
 useUlsEligibility.mockReturnValue({ verified: true });
 useStudentVerification.mockReturnValue({ approved: true });
 render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: category, exact: true }));
 const selected = () => PublicLiveCheckout.mock.calls.at(-1)[0];
 expect(selected().eligible).toBe(false);
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 expect(selected()).toMatchObject({ eligible: true, selection: { profile, congressMode: 'courses-only', afternoonCourse: true } });
 expect(screen.getByText('Valor estimado').parentElement).toHaveTextContent(`${price} €`);
 expect(screen.getByText('Congresso').parentElement).toHaveTextContent('Não selecionado');
 fireEvent.click(screen.getByRole('radio', { name: /Congresso presencial/ }));
 expect(selected().selection).toMatchObject({ congressMode: 'onsite', afternoonCourse: true });
 fireEvent.click(screen.getByRole('radio', { name: /Não participar no congresso/ }));
 expect(selected().selection).toMatchObject({ congressMode: 'courses-only', afternoonCourse: true });
 expect(screen.getByText('Valor estimado').parentElement).toHaveTextContent(`${price} €`);
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 fireEvent.click(screen.getByRole('button', { name: 'Adicionar um bilhete de jantar' }));
 expect(selected().eligible).toBe(false);
});

test('a course-only ULS purchase requires MEC validation and re-locks if eligibility is revoked', () => {
 const { rerender } = render(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 fireEvent.click(screen.getByRole('radio', { name: 'ULS Coimbra', exact: true }));
 fireEvent.click(screen.getByRole('checkbox', { name: /Via Verde AVC/ }));
 expect(within(screen.getByRole('region', { name: 'Validação da categoria' })).getByText('ULS validation')).toBeVisible();
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
 useUlsEligibility.mockReturnValue({ verified: true });
 rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(true);
 useUlsEligibility.mockReturnValue({ verified: false, revoked: true });
 rerender(<MemoryRouter><RegistrationBuilder /></MemoryRouter>);
 expect(PublicLiveCheckout.mock.calls.at(-1)[0].eligible).toBe(false);
});
