import { getFirebaseFirestore } from './firebaseClient';

export function subscribeToRegistrationInvoices(user, registrationId, onData, onError) {
  const db = getFirebaseFirestore();
  if (!db || !user?.uid || registrationId !== `circ-2027-${user.uid}`) {
    onError(new Error('invoices/unavailable'));
    return () => {};
  }
  return db.collection('documents').where('userId', '==', user.uid).onSnapshot(snapshot => {
    onData(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(doc =>
      doc.userId === user.uid && doc.registrationId === registrationId && doc.eventId === 'circ-2027'
      && doc.environment === 'production' && doc.provider === 'toconline' && doc.type === 'invoice_receipt'
      && doc.status === 'issued' && doc.issuedAt && /^[1-9][0-9]{0,17}$/.test(String(doc.providerDocumentId))));
  }, onError);
}

export async function downloadRegistrationInvoice(user, document, signal) {
  if (!user?.uid || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(document.id)) throw new Error('invoices/unavailable');
  const token = await user.getIdToken();
  const response = await fetch(`/api/checkout/live/orders/${document.id}/invoice.pdf`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!response.ok || !/^application\/pdf(?:;|$)/i.test(response.headers.get('Content-Type') || '')) throw new Error('invoices/download-unavailable');
  const blob = await response.blob();
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `CIRC2027-${String(document.providerDocumentNo || 'fatura-recibo').replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow the browser to start the download before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
