function firstFilled(...values) {
  return values.find((value) => String(value ?? '').trim().length > 0);
}

function valueOrDefault(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

export function normalizeParticipantProfile(profile = {}) {
  const personal = profile.personalDetails || profile.personal || {};
  const professional = profile.professionalDetails || profile.professional || {};
  const billing = profile.billingDetails || profile.billing || profile.invoice || {};

  return {
    ...profile,
    name: firstFilled(profile.name, profile.fullName, profile.nome, personal.name, personal.fullName),
    email: firstFilled(profile.email, personal.email),
    dateOfBirth: firstFilled(
      profile.dateOfBirth,
      profile.birthDate,
      profile.dataNascimento,
      personal.dateOfBirth,
      personal.birthDate
    ),
    gender: firstFilled(profile.gender, profile.sex, profile.sexo, personal.gender, personal.sex),
    taxNumber: firstFilled(profile.taxNumber, profile.nif, profile.vatNumber, personal.taxNumber, personal.nif),
    mobile: firstFilled(
      profile.mobile,
      profile.phone,
      profile.telephone,
      profile.telemovel,
      personal.mobile,
      personal.phone
    ),
    country: firstFilled(
      profile.country,
      profile.countryOfResidence,
      profile.residenceCountry,
      profile.paisResidencia,
      personal.country
    ),
    profession: firstFilled(
      profile.profession,
      profile.professionCode,
      profile.profissao,
      professional.profession,
      professional.code
    ),
    institution: firstFilled(
      profile.institution,
      profile.organization,
      profile.organisation,
      profile.instituicao,
      professional.institution,
      professional.organization
    ),
    professionalId: firstFilled(
      profile.professionalId,
      profile.professionalNumber,
      profile.licenseNumber,
      profile.cedulaProfissional,
      professional.professionalId,
      professional.licenseNumber
    ),
    billingAddress: firstFilled(
      profile.billingAddress,
      profile.invoiceAddress,
      profile.moradaFaturacao,
      billing.address,
      billing.streetAddress
    ),
    billingPostalCode: firstFilled(
      profile.billingPostalCode,
      profile.postalCode,
      profile.codigoPostal,
      billing.postalCode
    ),
    billingCity: firstFilled(
      profile.billingCity,
      profile.city,
      profile.localidade,
      billing.city,
      billing.locality
    ),
    billingCountry: firstFilled(
      profile.billingCountry,
      profile.invoiceCountry,
      profile.paisFaturacao,
      billing.country
    ),
  };
}

export function getProfileCompletion(profile = {}) {
  const normalized = normalizeParticipantProfile(profile);
  const countryValue = valueOrDefault(normalized.country, 'Portugal');
  const professionValue = valueOrDefault(normalized.profession, 'radiographer');
  const billingCountryValue = valueOrDefault(normalized.billingCountry, 'Portugal');
  const country = String(countryValue).trim().toLowerCase();
  const profession = String(professionValue).trim();
  const personalFields = [
    normalized.name,
    normalized.email,
    normalized.dateOfBirth,
    normalized.gender,
    normalized.taxNumber,
    normalized.mobile,
    countryValue,
  ];
  const professionalFields = [professionValue, normalized.institution];
  const billingFields = [
    normalized.billingAddress,
    normalized.billingPostalCode,
    normalized.billingCity,
    billingCountryValue,
  ];

  if (country === 'portugal' && profession === 'radiographer') {
    professionalFields.push(normalized.professionalId);
  }

  const fields = [...personalFields, ...professionalFields, ...billingFields];
  const completed = fields.filter((value) => String(value || '').trim().length > 0).length;

  return {
    completed,
    total: fields.length,
    percentage: Math.round((completed / fields.length) * 100),
  };
}
