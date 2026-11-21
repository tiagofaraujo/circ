import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { announcementsRequest } from '../pwa/announcements';

export default function AnnouncementFeed({ refreshKey = 0, admin = false }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [items, setItems] = useState([]), [busy, setBusy] = useState(true), [error, setError] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setBusy(true); setError(false);
    announcementsRequest(user).then(data => { if (current) setItems(data.notifications || []); })
      .catch(() => { if (current) setError(true); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [user, reload, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') setReload(n => n + 1); };
    const message = event => { if (event.data?.type === 'CIRC_NOTIFICATION') refresh(); };
    window.addEventListener('focus', refresh);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => { window.removeEventListener('focus', refresh); navigator.serviceWorker?.removeEventListener('message', message); };
  }, []);
  return <section className="account-card circ-announcements" aria-labelledby="announcement-feed-title">
    <div className="circ-announcement-heading"><h2 id="announcement-feed-title">{en ? 'Latest announcements' : 'Avisos recentes da organização'}</h2>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => setReload(n => n + 1)}>{en ? 'Refresh announcements' : 'Atualizar avisos'}</button></div>
    {busy && <p role="status">{en ? 'Loading announcements…' : 'A consultar avisos…'}</p>}
    {error && <p role="alert">{en ? 'Announcements could not be loaded. Try refreshing.' : 'Não foi possível consultar os avisos. Tente atualizar.'}</p>}
    {!busy && !error && items.length === 0 && <p>{en ? 'No announcements have been published yet.' : 'Ainda não foram publicados avisos.'}</p>}
    {items.map(item => <article className="circ-announcement" key={item.id}>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(en ? 'en-GB' : 'pt-PT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Lisbon' })}</time>
      <h3>{item.title}</h3><p className="circ-announcement-body">{item.body}</p>
      {admin && item.dispatch && <p className="circ-notification-note">{item.dispatch.expired ? (en ? 'Sending window ended.' : 'Prazo de envio terminado.') : item.dispatch.pending ? (en ? 'Automatic delivery queued or in progress.' : 'Envio automático em fila ou em curso.') : (en ? 'Processing completed.' : 'Processamento concluído.')}{' '}
        {en ? 'Accepted by push services' : 'Aceites pelos serviços de notificações'}: {item.dispatch.accepted}.{' '}
        {en ? 'Failed or uncertain attempts' : 'Tentativas falhadas ou sem confirmação'}: {item.dispatch.failed}.</p>}
    </article>)}
  </section>;
}
