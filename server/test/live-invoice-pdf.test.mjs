import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveInvoicePdfApi } from '../payments/live-invoice-pdf.mjs';
import { createToconlineLiveClient } from '../payments/toconline-live-client.mjs';
import { createWorker } from '../worker.mjs';

const id = '649d2dbd-6125-4212-bfa8-22035a3a55e7';
const env = { FIREBASE_PROJECT_ID: 'circ-test', LIVE_CHECKOUT_ENABLED: 'false', TOCONLINE_API_URL: 'https://api.example.test/api' };
const request = (path = `/api/checkout/live/orders/${id}/invoice.pdf`, options = {}) => new Request(`https://circ.test${path}`, { headers: { Authorization: 'Bearer user-token' }, ...options });
function fixture(overrides = {}) {
  const owner = { userId: 'user', eventId: 'circ-2027', registrationId: 'circ-2027-user', environment: 'production', id, amountCents: 9500 };
  const payment = { ...owner, status: 'paid', provider: 'eupago', fiscalStatus: 'issued', fiscalDocumentId: 321 };
  const document = { ...owner, status: 'issued', provider: 'toconline', type: 'invoice_receipt', issuedAt: '2026-11-01T09:45:00Z', providerDocumentId: 321 };
  let calls = 0;
  const api = createLiveInvoicePdfApi({ verify: async () => ({ sub: 'user', email_verified: true, ...overrides.claims }),
    storeFactory: options => { assert.equal(options.token, 'user-token'); return { registrationId: 'circ-2027-user',
      payment: async () => ({ data: { ...payment, ...overrides.payment } }), document: async () => ({ data: { ...document, ...overrides.document } }) }; },
    fiscalClient: { downloadSalesDocumentPdf: async (_, providerId) => { calls++; assert.equal(providerId, 321); return new TextEncoder().encode('%PDF-original'); } },
  });
  return { api, calls: () => calls };
}
test('owner downloads the existing PDF with creation disabled and no fiscal writes', async () => {
  const f = fixture(); const response = await f.api(request(), env);
  assert.equal(response.status, 200); assert.equal(await response.text(), '%PDF-original');
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.match(response.headers.get('Content-Disposition'), /attachment/);
  assert.match(response.headers.get('Cache-Control'), /no-store/); assert.equal(f.calls(), 1);
});
test('other owners, mismatched documents, test data and unissued jobs never reach TOConline', async () => {
  for (const overrides of [ { payment: { userId: 'other' } }, { document: { userId: 'other' } },
    { document: { registrationId: 'other-registration' } }, { payment: { environment: 'sandbox' } },
    { document: { status: 'outcome_unknown' } }, { payment: { fiscalStatus: 'pending_authorization' } },
    { document: { providerDocumentId: 322 } }, { document: { issuedAt: null } }, { document: { amountCents: 1 } } ]) {
    const f = fixture(overrides); assert.ok((await f.api(request(), env)).status >= 400); assert.equal(f.calls(), 0);
  }
});
test('authentication, method and arbitrary provider IDs cannot bypass the route', async () => {
  const f = fixture();
  assert.equal((await f.api(request(undefined, { headers: {} }), env)).status, 401);
  assert.equal((await fixture({ claims: { email_verified: false } }).api(request(), env)).status, 403);
  assert.equal((await f.api(request(undefined, { method: 'POST' }), env)).status, 405);
  assert.equal((await f.api(request(`/api/checkout/live/orders/${id}/invoice.pdf?documentId=123`), env)).status, 400);
  assert.equal(f.calls(), 0);
});
test('worker routes PDF reads independently of checkout activation', async () => {
  const response = await createWorker().fetch(request(undefined, { headers: {} }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'sign-in-required');
});

function clientFixture(location, pdfResponse = () => new Response('%PDF-original'), printResponse) {
  const calls = [];
  const client = createToconlineLiveClient({ now: () => 1000,
    sessionStore: { load: async () => ({ session: { accessToken: 'private-access', expiresAt: 999999 } }) },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? (printResponse?.() ?? Response.json(location)) : pdfResponse();
    },
  });
  return { client, calls };
}
test('print URL and PDF are GET-only and OAuth never follows the signed URL', async () => {
  const f = clientFixture({ data: { attributes: { scheme: 'https', host: 'app14.toconline.pt', path: '/public-file/original?signature=temporary' } } });
  assert.equal(new TextDecoder().decode(await f.client.downloadSalesDocumentPdf(env, 321)), '%PDF-original');
  assert.ok(f.calls[0].url.endsWith('/api/url_for_print/321?filter[type]=Document&filter[copies]=1'));
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer private-access');
  assert.equal(f.calls[1].options.headers.Authorization, undefined);
  assert.ok(f.calls.every(call => call.options.method === 'GET' && call.options.redirect === 'manual'));
});
test('untrusted print locations, unsafe redirects and non-PDF content are rejected', async () => {
  for (const location of [ { scheme: 'https', host: 'evil.test', path: '/public-file/a' }, { scheme: 'https', host: 'app.toconline.pt.evil.test', path: '/public-file/a' },
    { scheme: 'https', host: 'app.toconline.pt', path: '/admin/a' } ]) {
    const f = clientFixture(location); await assert.rejects(f.client.downloadSalesDocumentPdf(env, 321)); assert.equal(f.calls.length, 1);
  }
  const location = { scheme: 'https', host: 'app.toconline.pt', path: '/public-file/a' };
  const redirected = clientFixture(location, () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/public-file/a' } }));
  await assert.rejects(redirected.client.downloadSalesDocumentPdf(env, 321)); assert.equal(redirected.calls.length, 2);
  for (const response of [() => new Response('<html>Login</html>'), () => new Response('%PDF-', { headers: { 'Content-Length': String(9 * 1024 * 1024) } })]) {
    const f = clientFixture(location, response); await assert.rejects(f.client.downloadSalesDocumentPdf(env, 321));
  }
});
test('a singleton JSON:API collection also identifies the original PDF', async () => {
  const f = clientFixture({ data: [{ attributes: { scheme: 'https', host: 'app14.toconline.pt', path: '/public-file/original' } }] });
  assert.equal(new TextDecoder().decode(await f.client.downloadSalesDocumentPdf(env, 321)), '%PDF-original');
});
test('print URLs and nested URI attributes use the same strict HTTPS origin restriction', async () => {
  for (const response of [ 'https://app14.toconline.pt/public-file/original',
    { data: { attributes: { url: 'https://app14.toconline.pt/public-file/original' } } },
    { data: { attributes: { uri: { scheme: 'https:', host: 'app14.toconline.pt', path: '/public-file/original' } } } },
    { scheme: 'http', host: 'app14.toconline.pt', path: '/public-file/original' } ]) {
    const f = clientFixture(response);
    assert.equal(new TextDecoder().decode(await f.client.downloadSalesDocumentPdf(env, 321)), '%PDF-original');
    assert.ok(f.calls[1].url.startsWith('https://app14.toconline.pt/public-file/'));
    assert.equal(f.calls[1].options.headers.Authorization, undefined);
  }
  const f = clientFixture({ data: { attributes: { url: 'https://evil.test/public-file/original' } } });
  await assert.rejects(f.client.downloadSalesDocumentPdf(env, 321)); assert.equal(f.calls.length, 1);
});
