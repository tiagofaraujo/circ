import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { currentPushSubscription, disablePush, enablePush, loadPushConfig, needsHomeScreen, pushRequest, pushSupported } from '../pwa/pushNotifications';
import '../account.css';

export default function NotificationsPage() {
  const { user, isAdmin } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const t = (pt, english) => en ? english : pt;
  const [config, setConfig] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const supported = pushSupported();
  const homeScreen = needsHomeScreen();
  const permission = typeof Notification === 'undefined' ? 'default' : Notification.permission;

  useEffect(() => {
    let current = true;
    setBusy(true); setConfig(null); setActive(false); setSubscription(null); setError('');
    Promise.all([loadPushConfig(), currentPushSubscription()]).then(async ([settings, device]) => {
      const saved = device ? await pushRequest(user, 'status', { endpoint: device.endpoint }) : { subscribed: false };
      if (current) { setConfig(settings); setSubscription(device); setActive(saved.subscribed); }
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
  };

  return <main className="account-page circ-notifications">
    <p className="account-eyebrow">My CIRC</p>
    <h1>{t('Notificações no telemóvel', 'Phone notifications')}</h1>
    <section className="account-card" aria-labelledby="push-device-title">
      <h2 id="push-device-title">{t('Este dispositivo', 'This device')}</h2>
      <p>{t('A receção de notificações é opcional e depende da sua autorização. Pode desativá-las aqui ou nas definições do navegador.', 'Notifications are optional and require your permission. Turn them off here or in your browser settings.')}</p>
      {busy && <p role="status">{t('A verificar…', 'Checking…')}</p>}
      {config && !allowed && <p role="status">{t('As notificações ainda não estão disponíveis para os participantes. A organização está a preparar a ativação.', 'Notifications are not yet available to participants. The organisers are preparing activation.')}</p>}
      {config && allowed && <p>{active ? t('Notificações ativadas neste dispositivo.', 'Notifications enabled on this device.') : t('Notificações desativadas neste dispositivo.', 'Notifications disabled on this device.')}</p>}
      {homeScreen && <p>{t('No iPhone ou iPad (iOS 16.4 ou posterior): abra o site no Safari, escolha Partilhar → Adicionar ao ecrã principal e abra o My CIRC pelo novo ícone.', 'On iPhone or iPad (iOS 16.4 or later): open this site in Safari, choose Share → Add to Home Screen, then open My CIRC from the new icon.')}</p>}
      {!supported && !homeScreen && <p>{t('Este navegador não suporta notificações push. Use uma versão atualizada de Chrome, Firefox ou Safari num dispositivo compatível.', 'This browser does not support push notifications. Use an updated Chrome, Firefox or Safari on a compatible device.')}</p>}
      {permission === 'denied' && <p>{t('As notificações estão bloqueadas. Para permitir, altere a permissão do CIRC nas definições do navegador ou do dispositivo.', 'Notifications are blocked. Allow CIRC notifications in your browser or device settings.')}</p>}
      <div className="circ-notification-actions">
        {!active && allowed && supported && !homeScreen && <button className="button" type="button" disabled={busy || permission === 'denied'} onClick={() => {
          const consent = Notification.requestPermission();
          run(async () => { const device = await enablePush(user, config.publicKey, language, consent); setSubscription(device); setActive(true); });
        }}>{t('Ativar notificações', 'Enable notifications')}</button>}
        {subscription && <button className="button" type="button" disabled={busy} onClick={() => run(async () => {
          await disablePush(user); setSubscription(null); setActive(false); setStatus(t('Notificações desativadas.', 'Notifications disabled.'));
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
      <p className="circ-notification-note">{t('Esta preparação não ativa envios em massa nem alertas automáticos de pagamentos ou sessões favoritas.', 'This preparation does not enable broadcasts or automatic payment or favourite session alerts.')}</p>
    </section>}
  </main>;
}
