import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getProfessionalProfileCompletion } from '../auth/profileCompletion';
import { loadParticipantProfile, saveParticipantProfile } from '../auth/profileStore';
import { useLanguage } from '../context/LanguageContext';
import '../account.css';
import '../account-settings.css';
import '../profile-photo.css';

const professionOptions = [
  ['radiographer', 'TSDT — Radiologia', 'Radiographer / Radiologic Technologist'],
  ['radiologist', 'Médico / Radiologista', 'Physician / Radiologist'],
  ['nurse', 'Enfermeiro', 'Nurse'],
  ['medical-physicist', 'Físico Médico', 'Medical Physicist'],
  ['engineer', 'Engenheiro', 'Engineer'],
  ['student', 'Estudante', 'Student'],
  ['researcher', 'Investigador', 'Researcher'],
  ['industry', 'Indústria', 'Industry'],
  ['other', 'Outra', 'Other'],
];

const genderOptions = [
  ['', 'Selecionar', 'Select'],
  ['female', 'Feminino', 'Female'],
  ['male', 'Masculino', 'Male'],
  ['other', 'Outro', 'Other'],
  ['prefer-not-to-say', 'Prefiro não indicar', 'Prefer not to say'],
];

function emptyForm(user) {
  return {
    name: user?.displayName || '',
    email: user?.email || '',
    dateOfBirth: '',
    gender: '',
    taxNumber: '',
    mobile: '',
    country: 'Portugal',
    profession: 'radiographer',
    institution: '',
    professionalId: '',
    billingAddress: '',
    billingPostalCode: '',
    billingCity: '',
    billingCountry: 'Portugal',
  };
}

export default function ParticipantProfileFirebasePage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, updateDisplayName } = useAuth();
  const [form, setForm] = useState(() => emptyForm(user));
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProfession = useMemo(
    () => professionOptions.find(([value]) => value === form.profession),
    [form.profession]
  );
  const professionalCompletion = useMemo(
    () => getProfessionalProfileCompletion(form),
    [form]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadParticipantProfile(user).then((profile) => {
      if (!active) return;
      setForm((current) => ({
        ...current,
        ...profile,
        email: user?.email || profile.email || '',
      }));
      setLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const professionLabel = selectedProfession ? (isEnglish ? selectedProfession[2] : selectedProfession[1]) : '';
      const next = {
        ...form,
        professionLabel,
        photoURL: user?.photoURL || '',
      };
      if (form.name.trim() && form.name.trim() !== user?.displayName) {
        await updateDisplayName(form.name.trim());
      }
      await saveParticipantProfile(user, next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const showPortugueseRadiographerId = form.country === 'Portugal' && form.profession === 'radiographer';
  const avatarText = (form.name || user?.email || 'C').trim().charAt(0).toUpperCase();

  return (
    <main className="account-page participant-profile-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Participant' : 'My CIRC · Participante'}</p>
          <h1>{isEnglish ? 'Personal and professional details' : 'Dados pessoais e profissionais'}</h1>
          <p>{isEnglish ? 'Keep the information used for registration and billing up to date.' : 'Mantenha atualizados os dados utilizados na inscrição e faturação.'}</p>
        </div>
        <div className="profile-photo-preview profile-photo-preview--hero">
          {user?.photoURL ? <img src={user.photoURL} alt="" /> : <span aria-hidden="true">{avatarText}</span>}
        </div>
      </section>

      <nav className="account-subnav" aria-label={isEnglish ? 'Account navigation' : 'Navegação da conta'}>
        <Link to="/conta">{isEnglish ? 'Overview' : 'Visão geral'}</Link>
        <span aria-current="page">{isEnglish ? 'Profile' : 'Perfil'}</span>
        <Link to="/conta/seguranca">{isEnglish ? 'Security' : 'Segurança'}</Link>
      </nav>

      <section className="account-form-section participant-form-section">
        {loading ? <p>{isEnglish ? 'Loading profile…' : 'A carregar perfil…'}</p> : (
          <form className="account-profile-form" onSubmit={handleSubmit}>
            <div className="profile-avatar-note">
              <div className="profile-photo-preview">
                {user?.photoURL ? <img src={user.photoURL} alt="" /> : <span aria-hidden="true">{avatarText}</span>}
              </div>
              <p>
                {user?.photoURL
                  ? (isEnglish ? 'Your profile photo comes from your Google Account.' : 'A fotografia de perfil provém da sua Conta Google.')
                  : (isEnglish ? 'Profile photo uploads are paused for now. Your initials are used as your avatar.' : 'O carregamento de fotografias está suspenso nesta fase. As suas iniciais são utilizadas como avatar.')}
              </p>
            </div>

            <div className="profile-section-heading profile-section-heading--spaced">
              <p className="eyebrow">01</p>
              <h2>{isEnglish ? 'Personal details' : 'Dados pessoais'}</h2>
            </div>
            <div className="account-form-grid">
              <label><span>{isEnglish ? 'Full name' : 'Nome completo'}</span><input name="name" autoComplete="name" value={form.name || ''} onChange={updateField} required /></label>
              <label><span>Email</span><input name="email" type="email" value={form.email || ''} readOnly aria-readonly="true" /><small>{isEnglish ? 'The account email is managed in authentication.' : 'O email da conta é gerido pela autenticação.'}</small></label>
              <label><span>{isEnglish ? 'Date of birth' : 'Data de nascimento'}</span><input name="dateOfBirth" type="date" value={form.dateOfBirth || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Gender' : 'Sexo / género'}</span><select name="gender" value={form.gender || ''} onChange={updateField}>{genderOptions.map(([value, pt, en]) => <option key={value || 'empty'} value={value}>{isEnglish ? en : pt}</option>)}</select></label>
              <label><span>{isEnglish ? 'Tax identification number / VAT' : 'N.º de contribuinte / NIF'}</span><input name="taxNumber" inputMode="numeric" value={form.taxNumber || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Mobile phone' : 'Telemóvel'}</span><input name="mobile" type="tel" autoComplete="tel" value={form.mobile || ''} onChange={updateField} placeholder="+351 9xx xxx xxx" /></label>
              <label><span>{isEnglish ? 'Country of residence' : 'País de residência'}</span><input name="country" autoComplete="country-name" value={form.country || ''} onChange={updateField} /></label>
            </div>

            <div className="profile-section-heading profile-section-heading--spaced profile-section-heading--with-completion">
              <div>
                <p className="eyebrow">02</p>
                <h2>{isEnglish ? 'Professional details' : 'Dados profissionais'}</h2>
              </div>
              {professionalCompletion.percentage < 100 && (
                <div className="profile-completion" role="status" aria-label={isEnglish ? `Professional profile ${professionalCompletion.percentage}% complete` : `Perfil profissional ${professionalCompletion.percentage}% completo`}>
                  <div className="profile-completion__label">
                    <span>{isEnglish ? 'Profile complete' : 'Perfil completo'}</span>
                    <strong>{professionalCompletion.percentage}%</strong>
                  </div>
                  <div className="profile-completion__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={professionalCompletion.percentage}>
                    <span style={{ width: `${professionalCompletion.percentage}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="account-form-grid">
              <label><span>{isEnglish ? 'Profession' : 'Profissão'}</span><select name="profession" value={form.profession || 'radiographer'} onChange={updateField}>{professionOptions.map(([value, pt, en]) => <option key={value} value={value}>{isEnglish ? en : pt}</option>)}</select></label>
              <label><span>{isEnglish ? 'Institution / organisation' : 'Instituição / organização'}</span><input name="institution" value={form.institution || ''} onChange={updateField} /></label>
              {showPortugueseRadiographerId && <label className="account-form-grid__wide"><span>{isEnglish ? 'Professional licence number' : 'N.º de cédula profissional'}</span><input name="professionalId" value={form.professionalId || ''} onChange={updateField} /></label>}
            </div>

            <div className="profile-section-heading profile-section-heading--spaced"><p className="eyebrow">03</p><h2>{isEnglish ? 'Billing address' : 'Morada de faturação'}</h2></div>
            <div className="account-form-grid">
              <label className="account-form-grid__wide"><span>{isEnglish ? 'Address' : 'Morada'}</span><textarea name="billingAddress" rows="3" autoComplete="street-address" value={form.billingAddress || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Postal code' : 'Código postal'}</span><input name="billingPostalCode" autoComplete="postal-code" value={form.billingPostalCode || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'City' : 'Localidade'}</span><input name="billingCity" autoComplete="address-level2" value={form.billingCity || ''} onChange={updateField} /></label>
              <label className="account-form-grid__wide"><span>{isEnglish ? 'Billing country' : 'País de faturação'}</span><input name="billingCountry" autoComplete="country-name" value={form.billingCountry || ''} onChange={updateField} /></label>
            </div>

            <div className="account-form-actions">
              <button className="button account-primary-button" type="submit" disabled={saving}>{saving ? (isEnglish ? 'Saving…' : 'A guardar…') : (isEnglish ? 'Save details' : 'Guardar dados')}</button>
              <Link className="text-link" to="/conta">{isEnglish ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
              {saved && <span className="account-save-message">{isEnglish ? 'Saved.' : 'Guardado.'}</span>}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
