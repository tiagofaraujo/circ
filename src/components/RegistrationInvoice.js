import React, { useEffect, useRef, useState } from 'react';
import { subscribeToRegistrationInvoices, downloadRegistrationInvoice } from '../auth/invoiceStore';

export default function RegistrationInvoice({ user, registration, en = false }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [downloadError, setDownloadError] = useState(false);
  const download = useRef(null);
  const uid = user?.uid;
  const registrationId = registration.id;
  useEffect(() => {
    setDocuments([]); setLoading(true); setLoadError(false); setBusy(''); setDownloadError(false);
    return subscribeToRegistrationInvoices({ uid }, registrationId, data => {
      setDocuments(data); setLoading(false); setLoadError(false);
    }, () => { setLoading(false); setLoadError(true); });
  }, [uid, registrationId, revision]);
  useEffect(() => () => { download.current?.abort(); download.current = null; }, [uid, registrationId]);

  async function getPdf(document) {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setBusy(document.id); setDownloadError(false);
    try { await downloadRegistrationInvoice(user, document, controller.signal); }
    catch (error) {
      if (!controller.signal.aborted) {
        setDownloadError(true);
        if (user.email === 'circ.chuc@gmail.com') console.warn('CIRC invoice PDF:', error.code || 'download-unavailable');
      }
    }
    finally { if (download.current === controller) download.current = null; if (!controller.signal.aborted) setBusy(''); }
  }

  return <div className="registration-invoice" role="region" aria-label={en ? 'Invoice-receipt' : 'Fatura-recibo'}>
    <h3>{en ? 'Invoice-receipt' : 'Fatura-recibo'}</h3>
    {loading && <p role="status">{en ? 'Loading billing documents…' : 'A consultar os documentos de faturação…'}</p>}
    {loadError && <p role="alert">{en ? 'Billing documents could not be loaded.' : 'Não foi possível consultar os documentos de faturação.'} <button type="button" onClick={() => setRevision(value => value + 1)}>{en ? 'Try again' : 'Tentar novamente'}</button></p>}
    {!loading && !loadError && documents.length === 0 && <p>{en ? 'Your invoice-receipt will appear here after issuance.' : 'A sua fatura-recibo ficará disponível aqui após a emissão.'}</p>}
    {documents.map(document => <div key={document.id}>
      <p><strong>{document.providerDocumentNo || (en ? 'Invoice-receipt issued' : 'Fatura-recibo emitida')}</strong></p>
      <button type="button" className="button button--dark" disabled={Boolean(busy)} onClick={() => getPdf(document)}>
        {busy === document.id ? (en ? 'Downloading PDF…' : 'A descarregar PDF…') : (en ? 'Download invoice-receipt (PDF)' : 'Descarregar fatura-recibo (PDF)')}
      </button>
    </div>)}
    {downloadError && <p role="alert">{en ? 'The PDF could not be downloaded. Try again shortly or contact the organisers. The issued invoice remains unchanged.' : 'Não foi possível descarregar o PDF. Tente novamente dentro de instantes ou contacte a organização. A fatura emitida mantém-se válida.'}</p>}
  </div>;
}
