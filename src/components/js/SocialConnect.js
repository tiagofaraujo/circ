import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import '../css/SocialConnect.css';

const LINKEDIN_URL = 'https://www.linkedin.com/company/circ-chuc/';
const INSTAGRAM_URL = 'https://www.instagram.com/circ.chuc/';
const FACEBOOK_URL = 'https://www.facebook.com/circ.chuc/';

function SocialIcon({ name }) {
  if (name === 'Instagram') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.6" r="1.15" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'Facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4v2.2H7.3v3.2h2.8V22h3.4z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M6.4 8.3H3.2V21h3.2V8.3zM4.8 3A1.9 1.9 0 1 0 4.8 6.8 1.9 1.9 0 0 0 4.8 3zM20.9 13.8c0-3.9-2.1-5.8-4.9-5.8-2.2 0-3.2 1.2-3.8 2.1V8.3H9V21h3.2v-6.3c0-1.7.3-3.3 2.4-3.3 2 0 2.1 1.9 2.1 3.4V21h3.2v-7.2z" />
    </svg>
  );
}

const socialNetworks = [
  { name: 'Facebook', label: 'CIRC · Imaging Scientific Talks', url: FACEBOOK_URL },
  { name: 'Instagram', label: '@circ.chuc', url: INSTAGRAM_URL },
  { name: 'LinkedIn', label: 'CIRC — Imaging Scientific Talks', url: LINKEDIN_URL },
];

function SocialConnect() {
  const [shareStatus, setShareStatus] = useState('');
  const { language } = useLanguage();
  const en = language === 'en';

  const getShareUrl = () =>
    typeof window !== 'undefined' ? window.location.href : 'https://circ-coimbra.org/';

  const handleShare = async () => {
    const shareData = {
      title: en ? 'CIRC 2027 · 8–10 April · Coimbra' : 'CIRC 2027 · 8–10 abril · Coimbra',
      text: en
        ? 'CIRC 2027 — 8 April: two Pre-Congress Courses, morning and afternoon · 9–10 April: Coimbra International Radiology Congress.'
        : 'CIRC 2027 — 8 abril: dois Cursos Pré-Congresso, manhã e tarde · 9–10 abril: Congresso Internacional de Radiologia de Coimbra.',
      url: getShareUrl(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus(en ? 'Shared' : 'Partilhado');
        return;
      }

      await navigator.clipboard.writeText(getShareUrl());
      setShareStatus(en ? 'Link copied' : 'Ligação copiada');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareStatus(en ? 'Unable to share' : 'Não foi possível partilhar');
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setShareStatus(en ? 'Link copied' : 'Ligação copiada');
    } catch (error) {
      setShareStatus(en ? 'Unable to copy' : 'Não foi possível copiar');
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
        <p className="eyebrow">{en ? 'CIRC · ONLINE' : 'CIRC · EM REDE'}</p>
        <h2 id="social-connect-title">
          {en ? 'The conversation starts before April.' : 'A conversa começa antes de abril.'}
        </h2>
        <p>
          {en
            ? 'Follow the development of CIRC 2027, share the Save the Date and stay connected with the community as new congress updates are released.'
            : 'Acompanhe a construção do CIRC 2027, partilhe o Save the Date e mantenha-se ligado à comunidade entre cada novidade do congresso.'}
        </p>
        <div className="social-connect__hashtags" aria-label={en ? 'Official hashtags' : 'Hashtags oficiais'}>
          <span>#CIRC2027</span>
          <span>#CIRCoimbra</span>
          <span>#Radiologia</span>
        </div>
      </div>

      <div className="social-connect__card">
        <div className="social-connect__profile">
          <div className="social-connect__brand-mark" aria-hidden="true">C</div>
          <div>
            <span className="social-connect__label">
              {en ? 'CIRC · digital presence' : 'CIRC · presença digital'}
            </span>
            <strong>CIRC — Imaging Scientific Talks</strong>
          </div>
        </div>

        <div className="social-connect__network-list" aria-label={en ? 'CIRC social networks' : 'Redes sociais do CIRC'}>
          {socialNetworks.map((network) => (
            <a
              className={`social-connect__network social-connect__network--${network.name.toLowerCase()}`}
              href={network.url}
              target="_blank"
              rel="noopener noreferrer"
              key={network.name}
            >
              <span className="social-connect__network-mark" aria-hidden="true">
                <SocialIcon name={network.name} />
              </span>
              <span className="social-connect__network-copy">
                <small>{network.name}</small>
                <strong>{network.label}</strong>
              </span>
              <span className="social-connect__network-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>

        <div className="social-connect__share-row">
          <span className="social-connect__share-label">
            {en ? 'Share CIRC 2027' : 'Partilhar o CIRC 2027'}
          </span>
          <a href={facebookShareUrl} target="_blank" rel="noopener noreferrer">Facebook</a>
          <a href={linkedInShareUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <button type="button" onClick={handleShare}>{en ? 'More options' : 'Mais opções'}</button>
          <button type="button" onClick={handleCopy}>{en ? 'Copy link' : 'Copiar ligação'}</button>
        </div>

        <div className="social-connect__signal" aria-live="polite">
          <span className="social-connect__pulse" aria-hidden="true" />
          <span>
            {shareStatus || (en ? 'Follow · share · stay connected with CIRC 2027' : 'Siga · partilhe · acompanhe o CIRC 2027')}
          </span>
        </div>
      </div>

      <div className="social-connect__tag" aria-hidden="true">#CIRC2027</div>
    </section>
  );
}

export default SocialConnect;
