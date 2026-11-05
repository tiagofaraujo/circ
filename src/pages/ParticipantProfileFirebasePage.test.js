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

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({
    user: { uid: 'participant', email: PROFILE.email, displayName: PROFILE.name, photoURL: '' },
    updateDisplayName: jest.fn().mockResolvedValue(undefined),
  });
  useUlsEligibility.mockReturnValue({ status: 'ready', verified: false, confirmedAbsent: true });
  loadParticipantProfile.mockResolvedValue(PROFILE);
  saveParticipantProfile.mockImplementation(async (_, profile) => ({ ...profile, __remoteSaved: true }));
});

function show() {
  return render(<MemoryRouter><ParticipantProfileFirebasePage /></MemoryRouter>);
}

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

  const nameInput = await screen.findByLabelText('Nome completo *');
  fireEvent.change(nameInput, { target: { value: 'Nome   Novo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dados' }));

  expect(await screen.findByText(/O perfil foi guardado, mas não foi possível sincronizar o nome da conta/i))
    .toBeInTheDocument();
  expect(screen.getByText('Guardado na base de dados.')).toBeInTheDocument();
  expect(updateDisplayName).toHaveBeenCalledWith('Nome Novo');
  expect(nameInput).toHaveValue('Nome Novo');
});

test('identifies the fiscal minimums and formats without using overall profile completion as a payment gate', async () => {
  show();
  const name = await screen.findByLabelText('Nome completo *');
  expect(name).toHaveAttribute('aria-required', 'true');
  expect(name).toHaveAttribute('minlength', '5');
  expect(name).toHaveAttribute('maxlength', '200');
  ['N.º de contribuinte / NIF português *', 'Morada *', 'Código postal *', 'Localidade *', 'País de faturação *'].forEach(label => {
    const field = screen.getByLabelText(label);
    expect(field).toHaveAttribute('aria-required', 'true');
    expect(field).not.toHaveAttribute('required');
  });
  expect(screen.getByLabelText('Morada *')).toHaveAttribute('maxlength', '250');
  expect(screen.getByLabelText('Localidade *')).toHaveAttribute('maxlength', '100');
  expect(screen.getByText(/A percentagem de conclusão global.*não é o critério para poder pagar/)).toBeInTheDocument();
  expect(screen.getByText(/NIF português com 9 dígitos.*validado pelo servidor/)).toBeInTheDocument();
  expect(screen.getByText(/Formato português: 0000-000/)).toBeInTheDocument();
  expect(screen.getByText(/Para pagar, indique Portugal ou PT/)).toBeInTheDocument();
});

test('keeps billing entity and unrelated personal and professional data optional', async () => {
  show(); await screen.findByLabelText('Nome completo *');
  const billingName = screen.getByLabelText(/Nome \/ entidade para faturação \(opcional\)/);
  expect(billingName).not.toBeRequired();
  expect(billingName).toHaveAttribute('maxlength', '180');
  expect(billingName).toHaveAttribute('placeholder', PROFILE.name);
  ['Data de nascimento', 'Sexo / género', 'Telemóvel', 'País de residência', 'Profissão', 'Instituição / organização', 'N.º de cédula profissional'].forEach(label => {
    expect(screen.getByLabelText(label)).not.toBeRequired();
  });
});

test('can save a partial profile with an unfinished NIF and blank optional billing name', async () => {
  show(); await screen.findByLabelText('Nome completo *');
  fireEvent.change(screen.getByLabelText('N.º de contribuinte / NIF português *'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dados' }));
  expect(await screen.findByText('Guardado na base de dados.')).toBeInTheDocument();
  expect(saveParticipantProfile).toHaveBeenCalledWith(expect.objectContaining({ uid: 'participant' }), expect.objectContaining({
    name: PROFILE.name, taxNumber: '123', billingName: '', billingAddress: '', billingPostalCode: '', billingCity: '',
  }));
  expect(useAuth().updateDisplayName).not.toHaveBeenCalled();
});

test('preserves the verified ULS name lock while saving the remaining profile fields', async () => {
  useUlsEligibility.mockReturnValue({ status: 'ready', verified: true, confirmedAbsent: false });
  show();
  const name = await screen.findByLabelText('Nome completo *');
  expect(name).toHaveAttribute('readonly');
  expect(name).toHaveAttribute('aria-readonly', 'true');
  expect(screen.getByText(/Bloqueado após a correspondência ULS Coimbra/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Localidade *'), { target: { value: 'Coimbra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar dados' }));
  await screen.findByText('Guardado na base de dados.');
  expect(saveParticipantProfile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: PROFILE.name, billingCity: 'Coimbra' }));
});
