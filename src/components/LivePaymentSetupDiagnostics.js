import React, { useEffect, useState } from 'react';

export default function LivePaymentSetupDiagnostics({ user, en = false }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const t = (pt, english) => en ? english : pt;

  async function read(signal) {
    setBusy(true);
    setFailed(false);
    try {
      const token = await user.getIdToken();
      if (signal.aborted) return;
      const response = await fetch('/api/checkout/live/diagnostics', {
        method: 'GET', cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('diagnostics-unavailable');
      const result = await response.json();
      if (!result.checks || typeof result.liveCheckoutEnabled !== 'boolean') throw new Error('invalid-response');
      if (!signal.aborted) setData(result);
    } catch (error) {
      if (!signal.aborted) { setData(null); setFailed(true); }
    } finally { if (!signal.aborted) setBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, revision]);

  return <section className="sandbox-checkout__panel" aria-labelledby="live-payment-setup-title" aria-busy={busy}>
    <h2 id="live-payment-setup-title">{t('Preparação EuPago — produção', 'EuPago setup — production')}</h2>
    <p>{t('Esta consulta verifica apenas a presença das configurações no servidor. Não valida as chaves na EuPago, a aprovação da conta nem a entrega de notificações. Não cria pagamentos nem emite documentos fiscais.',
      'This check only verifies that server settings are present. It does not validate EuPago keys, account approval or notification delivery. It creates no payments and issues no fiscal documents.')}</p>
    {data && <>
      <p><strong>{t('Pagamentos reais:', 'Live payments:')} {data.liveCheckoutEnabled
        ? t('ATIVOS', 'ENABLED') : t('desativados', 'disabled')}</strong></p>
      {data.privatePilot && <p>{t('Ensaio exclusivo da administração: presencial, Multibanco, 95 €. Fecho automático da criação:',
        'Admin-only pilot: onsite, Multibanco, €95. Reference creation closes automatically:')}{' '}
        {data.pilotUntil ? new Date(data.pilotUntil).toLocaleString(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' })
          : t('prazo inválido — criação bloqueada', 'invalid deadline — creation blocked')}
        {' '}{t('(hora de Lisboa). As confirmações de pagamentos existentes continuam disponíveis.',
          '(Lisbon time). Existing payment confirmations remain available.')}</p>}
      <p>{t('Nome do canal:', 'Channel name:')} {data.channelMatchesExpected
        ? 'CIRC 2027' : t('por confirmar — o servidor deve usar exatamente «CIRC 2027»', 'unconfirmed — the server must use exactly “CIRC 2027”')}</p>
      <ul>{Object.entries(data.checks).map(([name, present]) => <li key={name}>
        <code>{name}</code>: {present === true ? t('presente', 'present') : t('em falta', 'missing')}
      </li>)}</ul>
      <p className="sandbox-checkout__muted">{t('Presente não significa validado. A sessão segura TOConline é verificada na secção «Ligação TOConline» abaixo. Os valores dos segredos não são apresentados.',
        'Present does not mean validated. The secure TOConline session is checked in “TOConline connection” below. Secret values are never displayed.')}</p>
    </>}
    {failed && <p className="sandbox-checkout__error">{t('Não foi possível consultar a configuração. Tente novamente; nenhum pagamento foi criado.', 'Could not read settings. Try again; no payment was created.')}</p>}
    <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>
      {busy ? t('A verificar configuração…', 'Checking settings…') : t('Atualizar diagnóstico EuPago', 'Refresh EuPago diagnosis')}
    </button>
  </section>;
}
