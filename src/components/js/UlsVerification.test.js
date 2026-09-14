import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UlsVerification from './UlsVerification';

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
