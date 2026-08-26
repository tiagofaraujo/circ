function valueOrDefault(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

export function getProfileCompletion(profile = {}) {
  const countryValue = valueOrDefault(profile.country, 'Portugal');
  const professionValue = valueOrDefault(profile.profession, 'radiographer');
  const billingCountryValue = valueOrDefault(profile.billingCountry, 'Portugal');
  const country = String(countryValue).trim().toLowerCase();
  const profession = String(professionValue).trim();
  const personalFields = [
    profile.name,
    profile.email,
    profile.dateOfBirth,
    profile.gender,
    profile.taxNumber,
    profile.mobile,
    countryValue,
  ];
  const professionalFields = [professionValue, profile.institution];
  const billingFields = [
    profile.billingAddress,
    profile.billingPostalCode,
    profile.billingCity,
    billingCountryValue,
  ];

  if (country === 'portugal' && profession === 'radiographer') {
    professionalFields.push(profile.professionalId);
  }

  const fields = [...personalFields, ...professionalFields, ...billingFields];
  const completed = fields.filter((value) => String(value || '').trim().length > 0).length;

  return {
    completed,
    total: fields.length,
    percentage: Math.round((completed / fields.length) * 100),
  };
}
