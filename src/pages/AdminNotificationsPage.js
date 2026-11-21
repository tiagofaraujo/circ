import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AnnouncementFeed from '../components/AnnouncementFeed';
import { announcementsRequest } from '../pwa/announcements';
import '../account.css';

function pendingNotice(key) {
  try { const data = JSON.parse(sessionStorage.getItem(key)); return data?.id && typeof data.title === 'string' && typeof data.body === 'string' ? data : null; }
  catch { return null; }
}

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = (pt, en) => language === 'en' ? en : pt;
  const storageKey = `circ-pending-announcement:${user.uid}`;
  const [attempt, setAttempt] = useState(() => pendingNotice(storageKey));
  const [title, setTitle] = useState(() => attempt?.title || ''), [body, setBody] = useState(() => attempt?.body || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(false), [revision, setRevision] = useState(0);
  const sending = useRef(false);
  async function publish(event) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(''); setSuccess(false);
    const notice = attempt || { id: window.crypto.randomUUID(), title: title.trim(), body: body.trim() };
    setAttempt(notice);
    try { sessionStorage.setItem(storageKey, JSON.stringify(notice)); } catch { /* In-memory retry still retains the same request. */ }
    try {
      await announcementsRequest(user, notice);
      try { sessionStorage.removeItem(storageKey); } catch { /* No browser storage available. */ }
      setTitle(''); setBody(''); setAttempt(null); setSuccess(true); setRevision(n => n + 1);
    } catch (e) {
      if (['invalid-notification', 'id-conflict'].includes(e.message)) {
        try { sessionStorage.removeItem(storageKey); } catch { /* No browser storage available. */ }
        setAttempt(null);
      }
      setError(e.message);
    }
    finally { sending.current = false; setBusy(false); }
  }
  return <main className="account-page circ-notifications">
    <p className="account-eyebrow">My CIRC · {t('Administração', 'Administration')}</p>
    <h1>{t('Notificações da organização', 'Organiser notifications')}</h1>
    <p>{t('Cada publicação fica disponível para todos no My CIRC e inicia automaticamente o envio para os dispositivos autorizados. Não depende de manter esta página aberta.', 'Every publication is available to everyone in My CIRC and automatically starts delivery to authorised devices. You can close this page afterwards.')}</p>
    <form className="account-card circ-announcement-form" onSubmit={publish}>
      <h2>{t('Criar notificação', 'Create notification')}</h2>
      <label htmlFor="announcement-title">{t('Título', 'Title')}</label>
      <input id="announcement-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required disabled={busy || Boolean(attempt)} />
      <label htmlFor="announcement-body">{t('Mensagem', 'Message')}</label>
      <textarea id="announcement-body" value={body} onChange={e => setBody(e.target.value)} maxLength={1000} required rows={5} disabled={busy || Boolean(attempt)} />
      <p className="circ-notification-note">{t('Destinatários: todos os utilizadores. No telemóvel, recebem apenas os dispositivos que já tenham autorizado notificações. Use avisos gerais, sem dados pessoais ou de pagamento.', 'Recipients: all users. Phone notifications only reach devices that have already opted in. Use general announcements, without personal or payment details.')}</p>
      {(title.trim() || body.trim()) && <section className="circ-announcement-preview" aria-label={t('Pré-visualização', 'Preview')}><strong>My CIRC</strong><p>{`${title.trim()}: ${body.trim()}`.slice(0, 240)}</p></section>}
      <button className="button" type="submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? t('A publicar…', 'Publishing…') : attempt ? t('Confirmar publicação pendente', 'Confirm pending publication') : t('Publicar e notificar todos', 'Publish and notify everyone')}</button>
      {error && <p role="alert">{['invalid-notification', 'id-conflict'].includes(error) ? t('A publicação foi rejeitada. Reveja o título e a mensagem e tente novamente; os campos estão disponíveis para correção.', 'Publication was rejected. Review the title and message and try again; the fields are available for correction.') : error === 'sending-disabled' ? t('O envio está temporariamente suspenso. Volte a confirmar a publicação quando estiver disponível.', 'Sending is temporarily paused. Confirm publication when it is available again.') : t('Não foi possível confirmar a publicação. Os dados foram mantidos: volte a confirmar para consultar ou concluir o mesmo pedido, sem duplicar.', 'Publication could not be confirmed. Your content is preserved: confirm again to check or finish the same request without duplicates.')}</p>}
      {success && <p role="status">{t('Notificação publicada. O envio automático foi colocado em fila.', 'Notification published. Automatic delivery has been queued.')}</p>}
    </form>
    <AnnouncementFeed admin refreshKey={revision} />
    <p className="circ-notification-note">{t('O envio decorre em lotes e pode demorar alguns minutos. A aceitação pelo serviço não garante a apresentação no ecrã.', 'Delivery runs in batches and may take several minutes. Provider acceptance does not guarantee display on screen.')}</p>
    <Link to="/conta/notificacoes">{t('Gerir notificações neste dispositivo', 'Manage notifications on this device')}</Link>
  </main>;
}
