import React, { useState } from 'react';
import '../css/SocialConnect.css';

const LINKEDIN_URL = 'https://www.linkedin.com/company/circ-chuc/';

function SocialConnect() {
  const [shareStatus, setShareStatus] = useState('');

  const getShareUrl = () =>
    typeof window !== 'undefined' ? window.location.href : 'https://circ-coimbra.org/';

  const handleShare = async () => {
    const shareData = {
      title: 'CIRC 2027 · 8–10 abril · Coimbra',
      text: 'CIRC 2027 — 8 abril: Curso Pré-Congresso · 9–10 abril: Congresso Internacional de Radiologia de Coimbra.',
      url: getShareUrl(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('Partilhado');
        return;
      }

      await navigator.clipboard.writeText(getShareUrl());
      setShareStatus('Ligação copiada');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareStatus('Não foi possível partilhar');
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setShareStatus('Ligação copiada');
    } catch (error) {
      setShareStatus('Não foi possível copiar');
    }
  };

  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    'https://circ-coimbra.org/'
  )}`;

  return (
    <section className="social-connect" aria-labelledby="social-connect-title">
      <div className="social-connect__rail" aria-hidden="true">
        <span>FOLLOW</span>
        <span>SHARE</span>
        <span>CONNECT</span>
      </div>

      <div className="social-connect__statement">
        <p className="eyebrow">CIRC · EM REDE</p>
        <h2 id="social-connect-title">A conversa começa antes de abril.</h2>
        <p>
          Acompanhe a construção do CIRC 2027, partilhe o Save the Date e leve a discussão
          sobre Radiologia para a sua rede profissional.
        </p>
        <div className="social-connect__hashtags" aria-label="Hashtags oficiais">
          <span>#CIRC2027</span>
          <span>#CIRCoimbra</span>
          <span>#Radiologia</span>
        </div>
      </div>

      <div className="social-connect__card">
        <div className="social-connect__profile">
          <div className="social-connect__linkedin-mark" aria-hidden="true">in</div>
          <div>
            <span className="social-connect__label">Perfil oficial</span>
            <strong>CIRC — Imaging Scientific Talks</strong>
          </div>
        </div>

        <a
          className="social-connect__primary"
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Seguir no LinkedIn <span aria-hidden="true">↗</span>
        </a>

        <div className="social-connect__share-row">
          <a
            href={linkedInShareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Partilhar no LinkedIn
          </a>
          <button type="button" onClick={handleShare}>Partilhar</button>
          <button type="button" onClick={handleCopy}>Copiar ligação</button>
        </div>

        <div className="social-connect__signal" aria-live="polite">
          <span className="social-connect__pulse" aria-hidden="true" />
          <span>{shareStatus || '8–10 abril 2027 · Coimbra'}</span>
        </div>
      </div>

      <div className="social-connect__tag" aria-hidden="true">#CIRC2027</div>
    </section>
  );
}

export default SocialConnect;
