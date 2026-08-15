import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  loadParticipantProfile,
  saveParticipantProfile,
  validateProfilePhoto,
} from '../auth/profileStore';
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
    photoURL: user?.photoURL || '',
  };
}

function photoErrorMessage(error, isEnglish) {
  const code = error?.code || error?.message || '';
  const messages = {
    'profile/photo-type': isEnglish ? 'Use a JPG, PNG or WEBP image.' : 'Utilize uma imagem JPG, PNG ou WEBP.',
    'profile/photo-size': isEnglish ? 'The photo must be no larger than 2 MB.' : 'A fotografia não pode exceder 2 MB.',
    'profile/storage-not-configured': isEnglish ? 'Photo storage is not active yet.' : 'O armazenamento de fotografias ainda não está ativo.',
    'storage/unauthorized': isEnglish ? 'You do not have permission to change this photo.' : 'Não tem permissão para alterar esta fotografia.',
  };
  return messages[code] || (isEnglish ? 'The photo could not be updated.' : 'Não foi possível atualizar a fotografia.');
}

export default function ParticipantProfileFirebasePage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { user, updateDisplayName, uploadProfilePhoto, removeProfilePhoto } = useAuth();
  const [form, setForm] = useState(() => emptyForm(user));
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const providers = useMemo(() => user?.providerData?.map((item) => item.providerId) || [], [user]);
  const hasPasswordProvider = providers.includes('password');
  const selectedProfession = useMemo(() => professionOptions.find(([value]) => value === form.profession), [form.profession]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadParticipantProfile(user).then((profile) => {
      if (!active) return;
      setForm((current) => ({ ...current, ...profile, email: user?.email || profile.email || '', photoURL: profile.photoURL || user?.photoURL || '' }));
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
      const next = { ...form, professionLabel, photoURL: user?.photoURL || form.photoURL || '' };
      if (form.name.trim() && form.name.trim() !== user?.displayName) await updateDisplayName(form.name.trim());
      await saveParticipantProfile(user, next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError('');
    try {
      validateProfilePhoto(file);
      setPhotoBusy(true);
      const photoURL = await uploadProfilePhoto(file);
      setForm((current) => ({ ...current, photoURL }));
    } catch (error) {
      setPhotoError(photoErrorMessage(error, isEnglish));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError('');
    setPhotoBusy(true);
    try {
      await removeProfilePhoto();
      setForm((current) => ({ ...current, photoURL: '' }));
    } catch (error) {
      setPhotoError(photoErrorMessage(error, isEnglish));
    } finally {
      setPhotoBusy(false);
    }
  };

  const showPortugueseRadiographerId = form.country === 'Portugal' && form.profession === 'radiographer';
  const avatarText = (form.name || user?.email || 'C').trim().charAt(0).toUpperCase();

  return (
    <main className="account-page participant-profile-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Participant' : 'Área CIRC · Participante'}</p>
          <h1>{isEnglish ? 'Personal and professional details' : 'Dados pessoais e profissionais'}</h1>
          <p>{isEnglish ? 'Keep the information used for registration and billing up to date.' : 'Mantenha atualizados os dados utilizados na inscrição e faturação.'}</p>
        </div>
        <div className="profile-photo-preview profile-photo-preview--hero">
          {(form.photoURL || user?.photoURL) ? <img src={form.photoURL || user.photoURL} alt="" /> : <span aria-hidden="true">{avatarText}</span>}
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
            <div className="profile-section-heading">
              <p className="eyebrow">00</p>
              <h2>{isEnglish ? 'Profile photo' : 'Fotografia de perfil'}</h2>
            </div>

            <div className="profile-photo-manager">
              <div className="profile-photo-preview">
                {(form.photoURL || user?.photoURL) ? <img src={form.photoURL || user.photoURL} alt="" /> : <span aria-hidden="true">{avatarText}</span>}
              </div>
              <div className="profile-photo-manager__content">
                {hasPasswordProvider ? (
                  <>
                    <p>{isEnglish ? 'Add a photo to personalise your CIRC account. You can replace or remove it at any time.' : 'Adicione uma fotografia para personalizar a sua conta CIRC. Pode substituí-la ou removê-la a qualquer momento.'}</p>
                    <div className="profile-photo-actions">
                      <label className="profile-photo-upload-button" htmlFor="profile-photo-file">{photoBusy ? (isEnglish ? 'Uploading…' : 'A carregar…') : (isEnglish ? 'Choose photo' : 'Escolher fotografia')}</label>
                      <input id="profile-photo-file" className="profile-photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} disabled={photoBusy} />
                      {(form.photoURL || user?.photoURL) && <button className="profile-photo-remove-link" type="button" onClick={handleRemovePhoto} disabled={photoBusy}>{isEnglish ? 'Remove photo' : 'Remover fotografia'}</button>}
                    </div>
                    <small>{isEnglish ? 'JPG, PNG or WEBP · maximum 2 MB.' : 'JPG, PNG ou WEBP · máximo 2 MB.'}</small>
                  </>
                ) : (
                  <p>{isEnglish ? 'This photo comes from your Google Account and is updated through Google.' : 'Esta fotografia provém da sua Conta Google e é atualizada através da Google.'}</p>
                )}
                {photoError && <div className="auth-notice auth-notice--error" role="alert">{photoError}</div>}
              </div>
            </div>

            <div className="profile-section-heading profile-section-heading--spaced"><p className="eyebrow">01</p><h2>{isEnglish ? 'Personal details' : 'Dados pessoais'}</h2></div>
            <div className="account-form-grid">
              <label><span>{isEnglish ? 'Full name' : 'Nome completo'}</span><input name="name" autoComplete="name" value={form.name || ''} onChange={updateField} required /></label>
              <label><span>Email</span><input name="email" type="email" value={form.email || ''} readOnly aria-readonly="true" /><small>{isEnglish ? 'The account email is managed in authentication.' : 'O email da conta é gerido pela autenticação.'}</small></label>
              <label><span>{isEnglish ? 'Date of birth' : 'Data de nascimento'}</span><input name="dateOfBirth" type="date" value={form.dateOfBirth || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Gender' : 'Sexo / género'}</span><select name="gender" value={form.gender || ''} onChange={updateField}>{genderOptions.map(([value, pt, en]) => <option key={value || 'empty'} value={value}>{isEnglish ? en : pt}</option>)}</select></label>
              <label><span>{isEnglish ? 'Tax identification number / VAT' : 'N.º de contribuinte / NIF'}</span><input name="taxNumber" inputMode="numeric" value={form.taxNumber || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Mobile phone' : 'Telemóvel'}</span><input name="mobile" type="tel" autoComplete="tel" value={form.mobile || ''} onChange={updateField} placeholder="+351 9xx xxx xxx" /></label>
              <label><span>{isEnglish ? 'Country of residence' : 'País de residência'}</span><input name="country" autoComplete="country-name" value={form.country || ''} onChange={updateField} /></label>
            </div>

            <div className="profile-section-heading profile-section-heading--spaced"><p className="eyebrow">02</p><h2>{isEnglish ? 'Professional details' : 'Dados profissionais'}</h2></div>
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
              <Link className="text-link" to="/conta">{isEnglish ? 'Back to My CIRC' : 'Voltar à Área CIRC'}</Link>
              {saved && <span className="account-save-message">{isEnglish ? 'Saved.' : 'Guardado.'}</span>}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
