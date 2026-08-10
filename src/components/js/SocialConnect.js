import React, { useState } from 'react';
import '../css/SocialConnect.css';

const LINKEDIN_URL = 'https://www.linkedin.com/company/circ-chuc/';
const INSTAGRAM_URL = 'https://www.instagram.com/circ.chuc/';
const FACEBOOK_URL = 'https://www.facebook.com/circ.chuc/';

const socialNetworks = [
  {
    name: 'LinkedIn',
    label: 'CIRC — Imaging Scientific Talks',
    mark: 'in',
    url: LINKEDIN_URL,
  },
  {
    name: 'Instagram',
    label: '@circ.chuc',
    mark: 'ig',
    url: INSTAGRAM_URL,
  },
  {
    name: 'Facebook',
    label: 'CIRC · Imaging Scientific Talks',
    mark: 'f',
    url: FACEBOOK_URL,
  },
];

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

  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
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
          Acompanhe a construção do CIRC 2027, partilhe o Save the Date e mantenha-se
          ligado à comunidade entre cada novidade do congresso.
        </p>
        <div className="social-connect__hashtags" aria-label="Hashtags oficiais">
          <span>#CIRC2027</span>
          <span>#CIRCoimbra</span>
          <span>#Radiologia</span>
        </div>
      </div>

      <div className="social-connect__card">
        <div className="social-connect__profile">
          <div className="social-connect__brand-mark" aria-hidden="true">C</div>
          <div>
            <span className="social-connect__label">CIRC · presença digital</span>
            <strong>CIRC — Imaging Scientific Talks</strong>
          </div>
        </div>

        <div className="social-connect__network-list" aria-label="Redes sociais do CIRC">
          {socialNetworks.map((network) => (
            <a
              className={`social-connect__network social-connect__network--${network.name.toLowerCase()}`}
              href={network.url}
              target="_blank"
              rel="noopener noreferrer"
              key={network.name}
            >
              <span className="social-connect__network-mark" aria-hidden="true">{network.mark}</span>
              <span className="social-connect__network-copy">
                <small>{network.name}</small>
                <strong>{network.label}</strong>
              </span>
              <span className="social-connect__network-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        <div className="social-connect__share-row">
          <span className="social-connect__share-label">Partilhar o CIRC 2027</span>
          <a
            href={linkedInShareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a
            href={facebookShareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>
          <button type="button" onClick={handleShare}>Mais opções</button>
          <button type="button" onClick={handleCopy}>Copiar ligação</button>
        </div>

        <div className="social-connect__signal" aria-live="polite">
          <span className="social-connect__pulse" aria-hidden="true" />
          <span>{shareStatus || 'Siga · partilhe · acompanhe o CIRC 2027'}</span>
        </div>
      </div>

      <div className="social-connect__tag" aria-hidden="true">#CIRC2027</div>
    </section>
  );
}

export default SocialConnect;
