import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { currentPushSubscription, disablePush, enablePush, loadPushConfig, needsHomeScreen, pushRequest, pushSupported } from '../pwa/pushNotifications';
import '../account.css';
import AnnouncementFeed from '../components/AnnouncementFeed';

export default function NotificationsPage() {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [config, setConfig] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [active, setActive] = useState(false);
  const [birthday, setBirthday] = useState(false);
  const [savedBirthday, setSavedBirthday] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const supported = pushSupported();
  const homeScreen = needsHomeScreen();
  const permission = typeof Notification === 'undefined' ? 'default' : Notification.permission;

  useEffect(() => {
    let current = true;
    setBusy(true); setConfig(null); setActive(false); setSubscription(null); setError(''); setBirthday(false); setSavedBirthday(false);
    Promise.all([loadPushConfig(), currentPushSubscription()]).then(async ([settings, device]) => {
      const saved = device ? await pushRequest(user, 'status', { endpoint: device.endpoint }) : { subscribed: false };
      if (current) { setConfig(settings); setSubscription(device); setActive(saved.subscribed);
        setBirthday(saved.birthdayEnabled === true); setSavedBirthday(saved.birthdayEnabled === true); }
    }).catch(() => { if (current) setError('load'); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [user, reload]);

  async function run(action) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); }
    catch (e) {
      setError(e.message || 'failed');
      const device = await currentPushSubscription().catch(() => null);
      setSubscription(device);
      if (!device) setActive(false);
    } finally { setBusy(false); }
  }
  const allowed = config?.enabled && (!config.testOnly || isAdmin);
  const messages = {
    'permission-not-granted': t('A autorização não foi concedida. Pode tentar novamente ou rever as permissões do navegador.', 'Permission was not granted. Try again or review browser permissions.'),
    'test-rate-limited': t('Aguarde um minuto antes de repetir o teste.', 'Wait one minute before another test.'),
    'subscription-expired': t('A autorização deste dispositivo expirou. Desative e volte a ativar as notificações.', 'This device subscription expired. Turn notifications off and on again.'),
    'device-linked-to-another-account': t('Este dispositivo está associado a outra conta. Desative as notificações e volte a ativá-las nesta conta.', 'This device is linked to another account. Turn notifications off and on again for this account.'),
    'birthday-profile-required': t('Para receber as felicitações, preencha uma data de nascimento válida no seu perfil e volte a guardar esta opção.', 'To receive birthday greetings, enter a valid date of birth in your profile and save this option again.'),
  };

  return <main className="account-page circ-notifications">
    <p className="account-eyebrow">My CIRC</p>
    <h1>{t('Notificações', 'Notifications')}</h1>
    <AnnouncementFeed />
    {isAdmin && <p><Link to="/admin/notificacoes">{t('Criar e gerir avisos da organização', 'Create and manage announcements')}</Link></p>}
    <section className="account-card" aria-labelledby="push-device-title">
      <h2 id="push-device-title">{t('Este dispositivo', 'This device')}</h2>
      <p>{t('Ative para receber automaticamente os novos avisos publicados pela organização. A receção é opcional e depende da sua autorização neste dispositivo. Pode desativá-la aqui ou nas definições do navegador.', 'Enable notifications to receive new organiser announcements automatically. Delivery is optional and requires permission on this device. Turn it off here or in your browser settings.')}</p>
      {busy && <p role="status">{t('A verificar…', 'Checking…')}</p>}
      {config && !allowed && <p role="status">{t('As notificações ainda não estão disponíveis para os participantes. A organização está a preparar a ativação.', 'Notifications are not yet available to participants. The organisers are preparing activation.')}</p>}
      {config && allowed && <p>{active ? t('Notificações ativadas neste dispositivo.', 'Notifications enabled on this device.') : t('Notificações desativadas neste dispositivo.', 'Notifications disabled on this device.')}</p>}
      {homeScreen && <p>{t('No iPhone ou iPad (iOS 16.4 ou posterior): abra o site no Safari, escolha Partilhar → Adicionar ao ecrã principal e abra o My CIRC pelo novo ícone.', 'On iPhone or iPad (iOS 16.4 or later): open this site in Safari, choose Share → Add to Home Screen, then open My CIRC from the new icon.')}</p>}
      {!supported && !homeScreen && <p>{t('Este navegador não suporta notificações push. Use uma versão atualizada de Chrome, Firefox ou Safari num dispositivo compatível.', 'This browser does not support push notifications. Use an updated Chrome, Firefox or Safari on a compatible device.')}</p>}
      {permission === 'denied' && <p>{t('As notificações estão bloqueadas. Para permitir, altere a permissão do CIRC nas definições do navegador ou do dispositivo.', 'Notifications are blocked. Allow CIRC notifications in your browser or device settings.')}</p>}
      <fieldset className="circ-birthday-preference">
        <legend>{t('O seu aniversário', 'Your birthday')}</legend>
        <label><input type="checkbox" checked={birthday} disabled={busy || (!active && !allowed)} onChange={event => setBirthday(event.target.checked)} />{' '}{t('Quero receber uma mensagem privada no meu aniversário.', 'I would like a private greeting on my birthday.')}</label>
        <p>{t('Usamos a data de nascimento do seu perfil para lhe dar os parabéns a partir das 09h00, hora de Lisboa. A mensagem inclui apenas o primeiro nome, sem idade nem data de nascimento, e é enviada apenas para os dispositivos que autorizar. Pode aparecer no ecrã bloqueado.', 'We use your profile date of birth to wish you a happy birthday from 09:00 Lisbon time. The greeting includes only your first name, with no age or birth date, and goes only to devices you authorise. It may appear on the lock screen.')}</p>
        <p className="circ-notification-note">{t('No máximo uma tentativa de envio por ano e por dispositivo. Para quem nasceu a 29 de fevereiro, enviamos a 28 nos anos não bissextos. A autorização de aniversário é válida por 400 dias, para cobrir o próximo aniversário; depois precisa de a renovar.', 'At most one delivery attempt per year and device. For 29 February birthdays, we use 28 February in non-leap years. Birthday authorisation lasts 400 days to cover your next birthday and then needs renewal.')}</p>
        <Link to="/conta/perfil">{t('Rever a data de nascimento no perfil', 'Review your profile date of birth')}</Link>
        {active && <div className="circ-notification-actions"><button className="button button-secondary" type="button" disabled={busy || birthday === savedBirthday || (birthday && !allowed)} onClick={() => run(async () => {
          await pushRequest(user, 'birthday', { endpoint: subscription.endpoint, enabled: birthday });
          setSavedBirthday(birthday); setStatus(birthday ? t('Preferência de aniversário guardada.', 'Birthday preference saved.') : t('Felicitações de aniversário desativadas neste dispositivo.', 'Birthday greetings disabled on this device.'));
        })}>{t('Guardar preferência de aniversário', 'Save birthday preference')}</button></div>}
      </fieldset>
      <div className="circ-notification-actions">
        {!active && allowed && supported && !homeScreen && <button className="button" type="button" disabled={busy || permission === 'denied'} onClick={() => {
          const consent = Notification.requestPermission();
          run(async () => { const device = await enablePush(user, config.publicKey, language, consent, birthday); setSubscription(device); setActive(true); setSavedBirthday(birthday); });
        }}>{t('Ativar notificações', 'Enable notifications')}</button>}
        {subscription && <button className="button" type="button" disabled={busy} onClick={() => run(async () => {
          await disablePush(user); setSubscription(null); setActive(false); setBirthday(false); setSavedBirthday(false); setStatus(t('Notificações desativadas.', 'Notifications disabled.'));
        })}>{t('Desativar neste dispositivo', 'Disable on this device')}</button>}
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>{t('Verificar estado', 'Check status')}</button>
      </div>
      {error && <p role="alert">{messages[error] || t('Não foi possível concluir. Verifique a ligação e tente novamente.', 'Could not complete the request. Check your connection and try again.')}</p>}
      {status && <p role="status">{status}</p>}
      <p className="circ-notification-note">{t('A autorização aplica-se apenas a este navegador ou instalação. Ao terminar sessão, as notificações deste dispositivo são desligadas. ', 'Permission applies only to this browser or installation. Signing out turns notifications off on this device. ')}<Link to="/privacidade">{t('Privacidade', 'Privacy')}</Link></p>
    </section>
    {isAdmin && <section className="account-card" aria-labelledby="push-admin-title">
      <h2 id="push-admin-title">{t('Preparação pela organização', 'Organiser preparation')}</h2>
      <p>{config?.enabled ? (config.testOnly ? t('Modo de teste: adesão reservada à conta do congresso.', 'Test mode: only the congress account may subscribe.') : t('Adesão aberta aos participantes.', 'Participant opt-in is open.')) : t('Envio desligado. Configure as chaves de envio e ative primeiro o modo de teste no servidor.', 'Sending is disabled. Configure the delivery keys and enable server test mode first.')}</p>
      <p>{t('O teste envia apenas uma mensagem genérica para este dispositivo. A aceitação pelo serviço de envio não comprova a apresentação no telemóvel; confirme a receção no ecrã.', 'The test sends a generic message only to this device. Provider acceptance does not prove display on the phone; confirm it on screen.')}</p>
      <button className="button" type="button" disabled={busy || !allowed || !active} onClick={() => run(async () => {
        await pushRequest(user, 'test', { endpoint: subscription.endpoint });
        setStatus(t('Teste aceite pelo serviço de envio. Confirme a notificação neste dispositivo.', 'Test accepted by the push service. Check this device for the notification.'));
      })}>{t('Enviar teste para este dispositivo', 'Send test to this device')}</button>
      <p className="circ-notification-note">{t('Primeiro aviso preparado: felicitações privadas de aniversário, com consentimento próprio. O envio automático tem uma ativação separada no servidor.', 'First notification prepared: private birthday greetings, with separate consent. Automatic delivery requires a separate server activation.')}</p>
    </section>}
  </main>;
}
