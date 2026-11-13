import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getProfileCompletion } from '../auth/profileCompletion';
import { loadParticipantProfileResult, saveParticipantProfile } from '../auth/profileStore';
import { useUlsEligibility } from '../auth/ulsEligibilityStore';
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
    billingName: '',
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
  const ulsEligibility = useUlsEligibility(user);
  // A cached miss, a failed lookup, or any existing eligibility document
  // keeps the field locked. Only a server-confirmed absence unlocks it.
  const ulsNameLocked = Boolean(user) && !ulsEligibility.confirmedAbsent;
  const [form, setForm] = useState(() => emptyForm(user));
  const [profileLoadState, setProfileLoadState] = useState('loading');
  const [profileReload, setProfileReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const selectedProfession = useMemo(
    () => professionOptions.find(([value]) => value === form.profession),
    [form.profession]
  );
  const profileCompletion = useMemo(
    () => getProfileCompletion(form),
    [form]
  );

  useEffect(() => {
    let active = true;
    setProfileLoadState('loading');
    loadParticipantProfileResult(user).then((result) => {
      if (!active) return;
      // Never offer editing when the saved billing data could not be verified
      // against Firestore; a local/cache fallback may be outdated.
      if (!result?.remoteAvailable || !result.profile) {
        setProfileLoadState('error');
        return;
      }
      const profile = result.profile;
      setForm((current) => ({
        ...current,
        ...profile,
        email: user?.email || profile.email || '',
      }));
      setProfileLoadState('ready');
    }).catch(() => { if (active) setProfileLoadState('error'); });
    return () => { active = false; };
  }, [user, profileReload]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaved(false);
    setSaveError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const professionLabel = selectedProfession ? (isEnglish ? selectedProfession[2] : selectedProfession[1]) : '';
      const next = {
        ...form,
        professionLabel,
        photoURL: user?.photoURL || '',
      };
      const savedProfile = await saveParticipantProfile(user, next);
      setForm((current) => ({ ...current, ...savedProfile }));
      setSaved(true);
      if (savedProfile.name && savedProfile.name !== user?.displayName) {
        try {
          await updateDisplayName(savedProfile.name);
        } catch {
          setSaveError(
            isEnglish
              ? 'The profile was saved, but the account display name could not be synchronised. Reload the page and try again.'
              : 'O perfil foi guardado, mas não foi possível sincronizar o nome da conta. Atualize a página e tente novamente.'
          );
        }
      }
    } catch {
      setSaveError(
        isEnglish
          ? 'The profile could not be saved to the database. Check your connection and try again.'
          : 'Não foi possível guardar o perfil na base de dados. Confirme a ligação e tente novamente.'
      );
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
        <p id="profile-payment-requirements">{isEnglish
          ? 'Fields marked * are required before payment and invoice issuance: full name, Portuguese tax number and billing address, postal code, city and country. You can save a partially completed profile and finish it later. The overall profile completion percentage includes other personal and professional details; it does not determine payment eligibility.'
          : 'Os campos assinalados com * são necessários antes do pagamento e da emissão da fatura: nome completo, NIF português, morada, código postal, localidade e país de faturação. Pode guardar o perfil parcialmente preenchido e completá-lo mais tarde. A percentagem de conclusão global inclui outros dados pessoais e profissionais; não é o critério para poder pagar.'}</p>
        {profileLoadState === 'loading' ? <p role="status">{isEnglish ? 'Loading profile…' : 'A carregar perfil…'}</p> : profileLoadState === 'error' ? (
          <div role="alert" className="account-save-message account-save-message--error">
            <p>{isEnglish
              ? 'We could not verify your saved profile. No changes have been made. Check your connection before editing your billing details.'
              : 'Não foi possível confirmar o perfil guardado. Nenhuma alteração foi efetuada. Verifique a ligação antes de editar os dados de faturação.'}</p>
            <button type="button" className="button account-primary-button" onClick={() => setProfileReload((current) => current + 1)}>
              {isEnglish ? 'Try again' : 'Tentar novamente'}
            </button>
          </div>
        ) : (
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

            {profileCompletion.percentage < 100 && (
              <div className="profile-overall-completion" role="status" aria-label={isEnglish ? `Profile ${profileCompletion.percentage}% complete` : `Perfil ${profileCompletion.percentage}% completo`}>
                <div className="profile-overall-completion__heading">
                  <div>
                    <span>{isEnglish ? 'Profile complete' : 'Perfil completo'}</span>
                    <small>{isEnglish ? 'Personal, professional and billing details' : 'Dados pessoais, profissionais e de faturação'}</small>
                  </div>
                  <strong>{profileCompletion.percentage}%</strong>
                </div>
                <div className="profile-completion__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={profileCompletion.percentage}>
                  <span style={{ width: `${profileCompletion.percentage}%` }} />
                </div>
              </div>
            )}

            <div className="profile-section-heading profile-section-heading--spaced">
              <p className="eyebrow">01</p>
              <h2>{isEnglish ? 'Personal details' : 'Dados pessoais'}</h2>
            </div>
            <div className="account-form-grid">
              <label>
                <span id="profile-name-label">{isEnglish ? 'Full name *' : 'Nome completo *'}</span>
                <input
                  name="name"
                  autoComplete="name"
                  aria-labelledby="profile-name-label"
                  aria-describedby="profile-name-help"
                  aria-required="true"
                  minLength="5"
                  maxLength="200"
                  value={form.name || ''}
                  onChange={updateField}
                  readOnly={ulsNameLocked}
                  aria-readonly={ulsNameLocked}
                  required
                />
                <small id="profile-name-help">{isEnglish ? 'Use your full personal name, between 5 and 200 characters.' : 'Indique o nome pessoal completo, entre 5 e 200 caracteres.'}</small>
                {ulsNameLocked && <small>{ulsEligibility.verified
                  ? (isEnglish
                    ? 'Locked after the ULS Coimbra match. Contact the secretariat if a correction is needed.'
                    : 'Bloqueado após a correspondência ULS Coimbra. Para corrigir, contacte o secretariado.')
                  : ulsEligibility.revoked
                    ? (isEnglish
                      ? 'The ULS match is no longer active. The name remains locked; contact the secretariat.'
                      : 'A correspondência ULS já não está ativa. O nome permanece bloqueado; contacte o secretariado.')
                    : ulsEligibility.status === 'error'
                      ? (isEnglish
                        ? 'The ULS status could not be confirmed. Reload the page before changing the name.'
                        : 'Não foi possível confirmar o estado ULS. Atualize a página antes de alterar o nome.')
                      : (isEnglish
                        ? 'Checking whether the name is locked…'
                        : 'A verificar se o nome está bloqueado…')}</small>}
              </label>
              <label><span>Email</span><input name="email" type="email" value={form.email || ''} readOnly aria-readonly="true" /><small>{isEnglish ? 'The account email is managed in authentication.' : 'O email da conta é gerido pela autenticação.'}</small></label>
              <label><span>{isEnglish ? 'Date of birth' : 'Data de nascimento'}</span><input name="dateOfBirth" type="date" value={form.dateOfBirth || ''} onChange={updateField} /></label>
              <label><span>{isEnglish ? 'Gender' : 'Sexo / género'}</span><select name="gender" value={form.gender || ''} onChange={updateField}>{genderOptions.map(([value, pt, en]) => <option key={value || 'empty'} value={value}>{isEnglish ? en : pt}</option>)}</select></label>
              <label><span id="profile-tax-number-label">{isEnglish ? 'Portuguese tax number / NIF *' : 'N.º de contribuinte / NIF português *'}</span><input name="taxNumber" inputMode="numeric" aria-labelledby="profile-tax-number-label" aria-describedby="profile-tax-number-help" aria-required="true" value={form.taxNumber || ''} onChange={updateField} placeholder="000000000" /><small id="profile-tax-number-help">{isEnglish ? 'Portuguese NIF with 9 digits. The server validates the number before payment.' : 'NIF português com 9 dígitos. O número é validado pelo servidor antes do pagamento.'}</small></label>
              <label><span>{isEnglish ? 'Mobile phone' : 'Telemóvel'}</span><input name="mobile" type="tel" autoComplete="tel" value={form.mobile || ''} onChange={updateField} placeholder="+351 9xx xxx xxx" /></label>
              <label><span>{isEnglish ? 'Country of residence' : 'País de residência'}</span><input name="country" autoComplete="country-name" value={form.country || ''} onChange={updateField} /></label>
            </div>

            <div className="profile-section-heading profile-section-heading--spaced"><p className="eyebrow">02</p><h2>{isEnglish ? 'Professional details' : 'Dados profissionais'}</h2></div>
            <div className="account-form-grid">
              <label><span>{isEnglish ? 'Profession' : 'Profissão'}</span><select name="profession" value={form.profession || 'radiographer'} onChange={updateField}>{professionOptions.map(([value, pt, en]) => <option key={value} value={value}>{isEnglish ? en : pt}</option>)}</select></label>
              <label><span>{isEnglish ? 'Institution / organisation' : 'Instituição / organização'}</span><input name="institution" value={form.institution || ''} onChange={updateField} /></label>
              {showPortugueseRadiographerId && <label className="account-form-grid__wide"><span>{isEnglish ? 'Professional licence number' : 'N.º de cédula profissional'}</span><input name="professionalId" value={form.professionalId || ''} onChange={updateField} /></label>}
            </div>

            <div id="faturacao" className="profile-section-heading profile-section-heading--spaced"><p className="eyebrow">03</p><h2>{isEnglish ? 'Billing address' : 'Morada de faturação'}</h2></div>
            <div className="account-form-grid">
              <label className="account-form-grid__wide"><span>{isEnglish ? 'Billing name / entity (optional)' : 'Nome / entidade para faturação (opcional)'}</span><input name="billingName" autoComplete="organization" maxLength="180" value={form.billingName || ''} onChange={updateField} placeholder={form.name || ''} /><small>{isEnglish ? 'Leave blank to use the participant name. Use the legal name when the invoice is for an organisation. Up to 180 characters.' : 'Se ficar vazio, será usado o nome do participante. Para faturação a uma entidade, indique a denominação legal. Até 180 caracteres.'}</small></label>
              <label className="account-form-grid__wide"><span>{isEnglish ? 'Address *' : 'Morada *'}</span><textarea name="billingAddress" rows="3" autoComplete="street-address" aria-required="true" maxLength="250" value={form.billingAddress || ''} onChange={updateField} /></label>
              <label><span id="profile-postal-code-label">{isEnglish ? 'Postal code *' : 'Código postal *'}</span><input name="billingPostalCode" autoComplete="postal-code" aria-labelledby="profile-postal-code-label" aria-describedby="profile-postal-code-help" aria-required="true" value={form.billingPostalCode || ''} onChange={updateField} placeholder="0000-000" /><small id="profile-postal-code-help">{isEnglish ? 'Portuguese format: 0000-000, including the hyphen.' : 'Formato português: 0000-000, incluindo o hífen.'}</small></label>
              <label><span>{isEnglish ? 'City *' : 'Localidade *'}</span><input name="billingCity" autoComplete="address-level2" aria-required="true" maxLength="100" value={form.billingCity || ''} onChange={updateField} /></label>
              <label className="account-form-grid__wide"><span id="profile-billing-country-label">{isEnglish ? 'Billing country *' : 'País de faturação *'}</span><input name="billingCountry" autoComplete="country-name" aria-labelledby="profile-billing-country-label" aria-describedby="profile-billing-country-help" aria-required="true" value={form.billingCountry || ''} onChange={updateField} /><small id="profile-billing-country-help">{isEnglish ? 'For payment, enter Portugal or PT. Billing is currently available for Portugal.' : 'Para pagar, indique Portugal ou PT. A faturação está disponível para Portugal nesta fase.'}</small></label>
            </div>

            <div className="account-form-actions">
              <button className="button account-primary-button" type="submit" disabled={saving}>{saving ? (isEnglish ? 'Saving…' : 'A guardar…') : (isEnglish ? 'Save details' : 'Guardar dados')}</button>
              <Link className="text-link" to="/conta">{isEnglish ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link>
              {saved && <span className="account-save-message" role="status">{isEnglish ? 'Saved to the database.' : 'Guardado na base de dados.'}</span>}
              {saveError && <span className="account-save-message account-save-message--error" role="alert">{saveError}</span>}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
