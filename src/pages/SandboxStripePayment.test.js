import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SandboxStripePayment, { StripeSandboxSetup } from './SandboxStripePayment';
const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49', OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const cs = 'cs_test_session1synthetic';
const initial = () => ({ id: OID, method: 'stripe_card', status: 'pending', reference: cs, identifier: 'circ_stripe_identifier',
  stripe: { id: cs, status: 'open', paymentStatus: 'unpaid', url: `https://checkout.stripe.com/c/pay/${cs}` } });
const api = jest.fn(), update = jest.fn();
const show = (order = initial(), en = false) => render(<SandboxStripePayment order={order} sessionId={SID} en={en} api={api} run={work => work()} onUpdate={update} busy={false} />);
beforeEach(() => { jest.clearAllMocks(); api.mockResolvedValue({ session: { id: SID } }); });
test('pending card order links only to its saved test Checkout and never collects card details locally', () => {
  show(); expect(screen.getByRole('link', { name: 'Pagar na Stripe — teste' })).toHaveAttribute('href', `https://checkout.stripe.com/c/pay/${cs}`);
  expect(screen.getByText(/Não introduza um cartão pessoal/)).toBeInTheDocument();
  expect(screen.getByText(/não confirma a inscrição/)).toBeInTheDocument();
  expect(document.querySelector('input[autocomplete="cc-number"]')).toBeNull();
  expect(api).not.toHaveBeenCalled();
});
test('a foreign or live-session destination is never presented as a payment link', () => {
  const o = initial(); o.stripe.url = 'https://example.invalid/collect'; const v = show(o);
  expect(screen.queryByRole('link', { name: 'Pagar na Stripe — teste' })).not.toBeInTheDocument(); v.unmount();
  o.stripe.id = 'cs_live_wrong'; o.stripe.url = 'https://checkout.stripe.com/c/pay/cs_live_wrong'; show(o);
  expect(screen.queryByRole('link', { name: 'Pagar na Stripe — teste' })).not.toBeInTheDocument();
});
test('manual query uses the saved order and does not offer an approval button', async () => {
  show(); fireEvent.click(screen.getByRole('button', { name: 'Consultar estado na Stripe' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(`sessions/${SID}/orders/${OID}/inspect`, {}));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ id: SID })); expect(screen.queryByRole('button', { name: /Validar/ })).not.toBeInTheDocument();
});
test('confirmed orders display the validated notification without a second payment link', () => {
  const o = initial(); o.status = 'confirmed'; o.notification = { verifiedAt: '2026-10-13T11:00:00Z', transactionId: 'pi_test123' };
  show(o); expect(screen.getByText('Notificação validada')).toBeInTheDocument(); expect(screen.getByText('pi_test123')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Pagar na Stripe — teste' })).not.toBeInTheDocument();
});
test('uncertain creation uses recovery, never an automatic second creation', async () => {
  const o = initial(); o.reference = null; o.stripe = null; o.status = 'creation_unknown'; o.creationDiagnostic = 'stripe/timeout'; show(o);
  expect(screen.getByText('stripe/timeout')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ID da sessão Stripe a recuperar'), { target: { value: cs } });
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar sessão sem criar outro pagamento' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(`sessions/${SID}/orders/${OID}/recover`, { reference: cs }));
  expect(api).toHaveBeenCalledTimes(1);
});
test('setup shows missing webhook and copies the separate Stripe URL, not a key', async () => {
  const writeText = jest.fn(async () => {}); Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const refresh = jest.fn(); render(<StripeSandboxSetup config={{ ready: false, apiKeyPresent: true, testKeyValid: true, webhookKeyPresent: false, serviceAccountPresent: true }} refresh={refresh} />);
  expect(screen.getByText('Em falta')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Copiar URL do webhook Stripe de teste' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://circ-coimbra.org/api/payments/stripe/sandbox/notifications'));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar configuração Stripe' })); expect(refresh).toHaveBeenCalledTimes(1);
});
test('English card instructions preserve the same destination and read-only behaviour', () => {
  show(initial(), true); expect(screen.getByRole('link', { name: 'Pay with Stripe — test' })).toHaveAttribute('href', `https://checkout.stripe.com/c/pay/${cs}`);
  expect(screen.getByText(/Do not enter a personal card/)).toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
});
