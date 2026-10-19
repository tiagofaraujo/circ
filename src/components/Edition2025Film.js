import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './Edition2025Film.css';

const VIDEO_ID = 'bvVn2Bl3BRw';
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const copy = {
  pt: {
    eyebrow: 'A experiência CIRC',
    title: 'CIRC 2025,',
    titleEnd: 'em filme.',
    introduction: 'Antes do próximo encontro, recorde a edição de 2025. Um olhar sobre os momentos que fazem parte da história do CIRC.',
    archive: 'Explorar a edição de 2025',
    play: 'Ver vídeo',
    playLabel: 'Reproduzir o vídeo do CIRC 2025 no YouTube',
    poster: 'Fotografia da edição CIRC 2025',
    edition: 'Edição anterior',
    titlePlayer: 'Vídeo da edição CIRC 2025 — Eyes on the Future',
    privacy: 'Ao reproduzir, é estabelecida uma ligação ao YouTube. O vídeo não é carregado antes do seu clique.',
    external: 'Ver no YouTube',
    newWindow: 'abre numa nova janela',
    close: 'Fechar vídeo',
  },
  en: {
    eyebrow: 'The CIRC experience',
    title: 'CIRC 2025,',
    titleEnd: 'on film.',
    introduction: 'Before our next meeting, revisit the 2025 edition. A look back at the moments that are part of the CIRC story.',
    archive: 'Explore the 2025 edition',
    play: 'Watch video',
    playLabel: 'Play the CIRC 2025 video on YouTube',
    poster: 'Photograph from the CIRC 2025 edition',
    edition: 'Previous edition',
    titlePlayer: 'CIRC 2025 edition video — Eyes on the Future',
    privacy: 'Playing the video connects to YouTube. The video is not loaded until you click.',
    external: 'Watch on YouTube',
    newWindow: 'opens in a new window',
    close: 'Close video',
  },
};

// The cover is an existing, first-party congress photograph, not an external thumbnail.
// No iframe, YouTube script, preconnect or third-party image exists before activation.
export default function Edition2025Film() {
  const { language } = useLanguage();
  const text = copy[language] || copy.pt;
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(null);
  const triggerRef = useRef(null);
  const previouslyOpened = useRef(false);

  useEffect(() => {
    if (playing) {
      previouslyOpened.current = true;
      frameRef.current?.focus();
    } else if (previouslyOpened.current) {
      triggerRef.current?.focus();
    }
  }, [playing]);

  return (
    <section className="section edition-film" id="circ2025-video" aria-labelledby="circ2025-film-title">
      <header className="edition-film__header">
        <div>
          <p className="edition-film__eyebrow">{text.eyebrow}</p>
          <h2 id="circ2025-film-title">{text.title} <span>{text.titleEnd}</span></h2>
        </div>
        <div className="edition-film__introduction">
          <p>{text.introduction}</p>
          <Link className="edition-film__link" to="/2025">
            {text.archive} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <figure className="edition-film__figure">
        <div className="edition-film__screen">
          {playing ? (
            <iframe
              ref={frameRef}
              title={text.titlePlayer}
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&playsinline=1&rel=0&hl=${language === 'en' ? 'en' : 'pt'}`}
              width="1280"
              height="720"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              ref={triggerRef}
              type="button"
              className="edition-film__cover"
              aria-label={text.playLabel}
              aria-describedby="circ2025-film-privacy"
              onClick={() => setPlaying(true)}
            >
              <img src="/circ2025/hero-auditorium.webp" alt={text.poster} width="1280" height="720" loading="lazy" decoding="async" />
              <span className="edition-film__shade" aria-hidden="true" />
              <span className="edition-film__edition">{text.edition} <span aria-hidden="true">/</span> 2025</span>
              <span className="edition-film__play">
                <span className="edition-film__play-icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" focusable="false"><path d="M8 5v14l11-7Z" fill="currentColor" /></svg>
                </span>
                <span>{text.play}</span>
              </span>
              <span className="edition-film__signature"><strong>CIRC 2025</strong><span>Eyes on the Future.</span></span>
            </button>
          )}
        </div>
        <figcaption className="edition-film__footer">
          <div className="edition-film__note">
            <span className="edition-film__caption">CIRC 2025 · Eyes on the Future.</span>
            <p id="circ2025-film-privacy">{text.privacy}</p>
          </div>
          <div className="edition-film__actions">
            {playing && <button className="edition-film__link" type="button" onClick={() => setPlaying(false)}>{text.close} <span aria-hidden="true">×</span></button>}
            <a className="edition-film__link" href={WATCH_URL} target="_blank" rel="noopener noreferrer" aria-label={`${text.external} — ${text.newWindow}`}>
              {text.external} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </figcaption>
      </figure>
    </section>
  );
}
