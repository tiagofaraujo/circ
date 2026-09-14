import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { claimUlsEligibility } from '../../auth/ulsEligibilityStore';
import UlsVerification from './UlsVerification';

jest.mock('../../auth/ulsEligibilityStore', () => ({
  claimUlsEligibility: jest.fn(),
  isUlsPilotUser: () => true,
  ulsVerificationEnabled: true,
}));

beforeEach(() => claimUlsEligibility.mockReset());

test('shows roster revocation and disables the MEC claim form', () => {
  render(
    <MemoryRouter>
      <UlsVerification
        user={{ uid: 'pilot', email: 'pilot@example.test' }}
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
        user={{ uid: 'pilot', email: 'pilot@example.test' }}
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
