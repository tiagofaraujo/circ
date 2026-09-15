import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { claimUlsEligibility } from '../../auth/ulsEligibilityStore';
import UlsVerification from './UlsVerification';

jest.mock('../../auth/ulsEligibilityStore', () => ({
  claimUlsEligibility: jest.fn(),
  ulsVerificationEnabled: true,
}));

beforeEach(() => claimUlsEligibility.mockReset());

test('offers the MEC form to an ordinary verified account without pilot roles', () => {
  render(<MemoryRouter><UlsVerification
    user={{ uid: 'ordinary', email: 'ordinary@example.test', emailVerified: true }}
    eligibility={{ status: 'ready', verified: false }}
    en={false}
  /></MemoryRouter>);
  expect(screen.getByLabelText('Número mecanográfico (MEC)')).toBeInTheDocument();
  expect(screen.queryByText(/piloto/i)).not.toBeInTheDocument();
});

test('requires email confirmation before offering the MEC form', () => {
  render(<MemoryRouter><UlsVerification
    user={{ uid: 'ordinary', email: 'ordinary@example.test', emailVerified: false }}
    eligibility={{ status: 'ready', verified: false }}
    en={false}
  /></MemoryRouter>);
  expect(screen.getByText(/Confirme o email da sua conta/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Número mecanográfico (MEC)')).not.toBeInTheDocument();
});

test('shows roster revocation and disables the MEC claim form', () => {
  render(
    <MemoryRouter>
      <UlsVerification
        user={{ uid: 'participant', email: 'participant@example.test', emailVerified: true }}
        eligibility={{
          status: 'ready',
          verified: false,
          revoked: true,
          mec: '4206',
        }}
        en={false}
      />
    </MemoryRouter>
  );

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Esta correspondência ULS Coimbra já não está ativa'
  );
  expect(screen.queryByLabelText('Número mecanográfico (MEC)')).not.toBeInTheDocument();
});


test('keeps the post-claim message neutral until the roster confirms the match', async () => {
  claimUlsEligibility.mockResolvedValue({ verified: true, mec: '4206' });
  render(
    <MemoryRouter>
      <UlsVerification
        user={{ uid: 'participant', email: 'participant@example.test', emailVerified: true }}
        eligibility={{
          status: 'ready',
          verified: false,
          revoked: false,
        }}
        en={false}
      />
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText('Número mecanográfico (MEC)'), {
    target: { value: '4206' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar MEC' }));

  expect(await screen.findByText('Dados submetidos. A confirmar o estado atual na lista…'))
    .toBeInTheDocument();
  expect(screen.queryByText(/Correspondência confirmada/)).not.toBeInTheDocument();
});
