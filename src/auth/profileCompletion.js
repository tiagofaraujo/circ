export function getProfessionalProfileCompletion(profile = {}) {
  const country = String(profile.country || 'Portugal').trim().toLowerCase();
  const profession = String(profile.profession || 'radiographer').trim();
  const fields = [profession, profile.institution];

  if (country === 'portugal' && profession === 'radiographer') {
    fields.push(profile.professionalId);
  }

  const completed = fields.filter((value) => String(value || '').trim().length > 0).length;

  return {
    completed,
    total: fields.length,
    percentage: Math.round((completed / fields.length) * 100),
  };
}
