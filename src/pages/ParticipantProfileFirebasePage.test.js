import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadParticipantProfile, saveParticipantProfile } from '../auth/profileStore';
import { useUlsEligibility } from '../auth/ulsEligibilityStore';
import ParticipantProfileFirebasePage from './ParticipantProfileFirebasePage';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/profileStore', () => ({
  loadParticipantProfile: jest.fn(),
  saveParticipantProfile: jest.fn(),
}));
jest.mock('../auth/ulsEligibilityStore', () => ({ useUlsEligibility: jest.fn() }));
jest.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ language: 'pt' }),
}));

const PROFILE = {
  name: 'Nome Antigo',
  email: 'pilot@example.test',
  country: 'Portugal',
  profession: 'radiographer',
  billingCountry: 'Portugal',
};

test('reports an Auth sync warning without claiming the Firestore save failed', async () => {
  const updateDisplayName = jest.fn().mockRejectedValue(new Error('auth/reload-failed'));
  useAuth.mockReturnValue({
    user: {
      uid: 'pilot',
      email: 'pilot@example.test',
      displayName: 'Nome Antigo',
      photoURL: '',
    },
    updateDisplayName,
  });
  useUlsEligibility.mockReturnValue({
    status: 'ready',
    verified: false,
    confirmedAbsent: true,
  });
  loadParticipantProfile.mockResolvedValue(PROFILE);
  saveParticipantProfile.mockResolvedValue({
    ...PROFILE,
    name: 'Nome Novo',
    __remoteSaved: true,
  });

  render(
    <MemoryRouter>
      <ParticipantProfileFirebasePage />
    </MemoryRouter>
  );

  const nameInput = await screen.findByLabelText('Nome completo');
  fireEvent.change(nameInput, { target: { value: 'Nome   Novo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dados' }));

  expect(await screen.findByText(/O perfil foi guardado, mas não foi possível sincronizar o nome da conta/i))
    .toBeInTheDocument();
  expect(screen.getByText('Guardado na base de dados.')).toBeInTheDocument();
  expect(updateDisplayName).toHaveBeenCalledWith('Nome Novo');
  expect(nameInput).toHaveValue('Nome Novo');
});
