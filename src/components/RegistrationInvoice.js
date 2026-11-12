import React, { useEffect, useRef, useState } from 'react';
import { subscribeToRegistrationInvoices, downloadRegistrationInvoice } from '../auth/invoiceStore';

export default function RegistrationInvoice({ user, registration, en = false }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadStarted, setDownloadStarted] = useState(false);
  const download = useRef(null);
  const uid = user?.uid;
  const registrationId = registration.id;
  useEffect(() => {
    setDocuments([]); setLoading(true); setLoadError(false); setBusy(''); setDownloadError(''); setDownloadStarted(false);
    return subscribeToRegistrationInvoices({ uid }, registrationId, data => {
      setDocuments(data); setLoading(false); setLoadError(false);
    }, () => { setLoading(false); setLoadError(true); });
  }, [uid, registrationId, revision]);
  useEffect(() => () => { download.current?.abort(); download.current = null; }, [uid, registrationId]);

  async function getPdf(document) {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setBusy(document.id); setDownloadError(''); setDownloadStarted(false);
    try {
      await downloadRegistrationInvoice(user, document, controller.signal);
      if (!controller.signal.aborted) setDownloadStarted(true);
    }
    catch (error) {
      if (!controller.signal.aborted) {
        const code = typeof error?.code === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(error.code)
          ? error.code : 'invoice-download-unavailable';
        setDownloadError(code);
      }
    }
    finally { if (download.current === controller) download.current = null; if (!controller.signal.aborted) setBusy(''); }
  }

  return <div className="registration-invoice" role="region" aria-label={en ? 'Invoice-receipt' : 'Fatura-recibo'}>
    <h3>{en ? 'Invoice-receipt' : 'Fatura-recibo'}</h3>
    {loading && <p role="status">{en ? 'Loading billing documents…' : 'A consultar os documentos de faturação…'}</p>}
    {loadError && <p role="alert">{en ? 'Billing documents could not be loaded.' : 'Não foi possível consultar os documentos de faturação.'} <button type="button" onClick={() => setRevision(value => value + 1)}>{en ? 'Try again' : 'Tentar novamente'}</button></p>}
    {!loading && !loadError && !documents.some(document => !document.registrationArchiveId) && <p>{en ? 'The invoice-receipt for your current registration will appear here after issuance.' : 'A fatura-recibo da inscrição atual ficará disponível aqui após a emissão.'}</p>}
    {documents.map(document => <div key={document.id} role="group" aria-label={document.registrationArchiveId ? (en ? 'Previous registration document' : 'Documento da inscrição anterior') : (en ? 'Current registration document' : 'Documento da inscrição atual')}>
      <p><small>{document.registrationArchiveId ? (en ? 'Previous registration — preserved document' : 'Inscrição anterior — documento preservado') : (en ? 'Current registration' : 'Inscrição atual')}</small></p>
      <p><strong>{document.providerDocumentNo || (en ? 'Invoice-receipt issued' : 'Fatura-recibo emitida')}</strong></p>
      <button type="button" className="button button--dark" disabled={Boolean(busy)} onClick={() => getPdf(document)}>
        {busy === document.id ? (en ? 'Downloading PDF…' : 'A descarregar PDF…') : (en ? 'Download invoice-receipt (PDF)' : 'Descarregar fatura-recibo (PDF)')}
      </button>
    </div>)}
    {downloadError && <p role="alert">
      {en ? 'The PDF could not be downloaded. Try again shortly or contact the organisers. The issued invoice remains unchanged.' : 'Não foi possível descarregar o PDF. Tente novamente dentro de instantes ou contacte a organização. A fatura emitida mantém-se válida.'}
      <br /><small>{en ? 'Support code' : 'Código de apoio'} <code>{downloadError}</code></small>
    </p>}
    {downloadStarted && <p role="status">{en ? 'PDF download started. Check your browser downloads.' : 'Transferência do PDF iniciada. Consulte as transferências do navegador.'}</p>}
  </div>;
}
