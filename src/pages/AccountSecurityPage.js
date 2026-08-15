import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import '../account.css';
import '../account-settings.css';

function friendlySecurityError(error, isEnglish) {
  const code = error?.code || error?.message || '';
  const messages = {
    'auth/wrong-password': isEnglish ? 'The current password is incorrect.' : 'A palavra-passe atual está incorreta.',
    'auth/invalid-credential': isEnglish ? 'The current password is incorrect.' : 'A palavra-passe atual está incorreta.',
    'auth/weak-password': isEnglish ? 'Use a stronger password.' : 'Utilize uma palavra-passe mais segura.',
    'auth/requires-recent-login': isEnglish ? 'For security, please sign in again and retry.' : 'Por segurança, volte a iniciar sessão e tente novamente.',
    'auth/popup-closed-by-user': isEnglish ? 'Google reauthentication was cancelled.' : 'A reautenticação Google foi cancelada.',
    'auth/popup-blocked': isEnglish ? 'Your browser blocked the Google window.' : 'O browser bloqueou a janela do Google.',
  };
  return messages[code] || (isEnglish ? 'The operation could not be completed. Please try again.' : 'Não foi possível concluir a operação. Tente novamente.');
}

export default function AccountSecurityPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const navigate = useNavigate();
  const { user, changePassword, deleteAccount } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [busy, setBusy] = useState(false);

  const providers = useMemo(() => user?.providerData?.map((item) => item.providerId) || [], [user]);
  const hasPasswordProvider = providers.includes('password');
  const hasGoogleProvider = providers.includes('google.com');

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordStatus('');

    if (newPassword.length < 8) {
      setPasswordError(isEnglish ? 'Use at least 8 characters.' : 'Utilize pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(isEnglish ? 'The new passwords do not match.' : 'As novas palavras-passe não coincidem.');
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus(isEnglish ? 'Password changed successfully.' : 'Palavra-passe alterada com sucesso.');
    } catch (error) {
      setPasswordError(friendlySecurityError(error, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError('');
    const requiredText = isEnglish ? 'DELETE' : 'ELIMINAR';
    if (confirmation.trim().toUpperCase() !== requiredText) {
      setDeleteError(isEnglish ? `Type ${requiredText} to confirm.` : `Escreva ${requiredText} para confirmar.`);
      return;
    }

    setBusy(true);
    try {
      await deleteAccount(deletePassword);
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(friendlySecurityError(error, isEnglish));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="account-page account-security-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">{isEnglish ? 'My CIRC · Security' : 'Área CIRC · Segurança'}</p>
          <h1>{isEnglish ? 'Account security' : 'Segurança da conta'}</h1>
          <p>{isEnglish ? 'Manage your password and account access.' : 'Gira a palavra-passe e o acesso à sua conta.'}</p>
        </div>
      </section>

      <nav className="account-subnav" aria-label={isEnglish ? 'Account navigation' : 'Navegação da conta'}>
        <Link to="/conta">{isEnglish ? 'Overview' : 'Visão geral'}</Link>
        <Link to="/conta/perfil">{isEnglish ? 'Profile' : 'Perfil'}</Link>
        <span aria-current="page">{isEnglish ? 'Security' : 'Segurança'}</span>
      </nav>

      <section className="account-security-grid">
        <article className="account-security-card">
          <p className="eyebrow">01</p>
          <h2>{isEnglish ? 'Password' : 'Palavra-passe'}</h2>
          {hasPasswordProvider ? (
            <form className="security-form" onSubmit={handlePasswordChange}>
              <label>
                <span>{isEnglish ? 'Current password' : 'Palavra-passe atual'}</span>
                <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              </label>
              <label>
                <span>{isEnglish ? 'New password' : 'Nova palavra-passe'}</span>
                <input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
              </label>
              <label>
                <span>{isEnglish ? 'Confirm new password' : 'Confirmar nova palavra-passe'}</span>
                <input type="password" autoComplete="new-password" minLength="8" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </label>
              {passwordError && <div className="auth-notice auth-notice--error" role="alert">{passwordError}</div>}
              {passwordStatus && <div className="auth-notice auth-notice--success" role="status">{passwordStatus}</div>}
              <button className="auth-primary-button" type="submit" disabled={busy}>{busy ? (isEnglish ? 'Saving…' : 'A guardar…') : (isEnglish ? 'Change password' : 'Alterar palavra-passe')}</button>
            </form>
          ) : (
            <div className="security-provider-note">
              <strong>{isEnglish ? 'Your account uses Google.' : 'A sua conta utiliza Google.'}</strong>
              <p>{isEnglish ? 'Password management is handled by your Google Account.' : 'A gestão da palavra-passe é efetuada na sua Conta Google.'}</p>
            </div>
          )}
        </article>

        <article className="account-security-card account-security-card--danger">
          <p className="eyebrow">02</p>
          <h2>{isEnglish ? 'Delete account' : 'Eliminar conta'}</h2>
          <p>{isEnglish ? 'Deleting the account is permanent and signs you out immediately.' : 'A eliminação da conta é permanente e termina a sessão de imediato.'}</p>

          {hasPasswordProvider && (
            <label className="security-danger-field">
              <span>{isEnglish ? 'Current password' : 'Palavra-passe atual'}</span>
              <input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
            </label>
          )}

          {hasGoogleProvider && !hasPasswordProvider && (
            <p className="security-provider-note">{isEnglish ? 'Google will ask you to confirm your identity before deletion.' : 'O Google pedirá a confirmação da sua identidade antes da eliminação.'}</p>
          )}

          <label className="security-danger-field">
            <span>{isEnglish ? 'Type DELETE to confirm' : 'Escreva ELIMINAR para confirmar'}</span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>

          {deleteError && <div className="auth-notice auth-notice--error" role="alert">{deleteError}</div>}
          <button className="account-danger-button" type="button" onClick={handleDelete} disabled={busy}>
            {busy ? (isEnglish ? 'Processing…' : 'A processar…') : (isEnglish ? 'Permanently delete account' : 'Eliminar conta permanentemente')}
          </button>
        </article>
      </section>
    </main>
  );
}
