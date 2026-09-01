import { getProfileCompletion } from './profileCompletion';

describe('getProfileCompletion', () => {
  test('returns 100% when every applicable profile field is filled', () => {
    const result = getProfileCompletion({
      name: 'Participante CIRC',
      email: 'participante@example.com',
      dateOfBirth: '1979-07-12',
      gender: 'male',
      taxNumber: '123456789',
      mobile: '+351900000000',
      country: 'Portugal',
      profession: 'radiographer',
      institution: 'Instituição de saúde',
      professionalId: 'C-000000000',
      billingAddress: 'Rua de exemplo, 1',
      billingPostalCode: '3000-000',
      billingCity: 'Coimbra',
      billingCountry: 'Portugal',
    });

    expect(result).toEqual({
      completed: 14,
      total: 14,
      percentage: 100,
    });
  });

  test('identifies the five defaults that previously appeared as 36%', () => {
    const result = getProfileCompletion({
      name: 'Participante CIRC',
      email: 'participante@example.com',
      country: 'Portugal',
      profession: 'radiographer',
      billingCountry: 'Portugal',
    });

    expect(result).toEqual({
      completed: 5,
      total: 14,
      percentage: 36,
    });
  });
});
