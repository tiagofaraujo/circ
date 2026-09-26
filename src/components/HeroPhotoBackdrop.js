import React, { useEffect, useRef, useState } from 'react';

const photos = [
  { src: '/circ2025/hero-auditorium.webp', position: 'auditorium', width: 2400, height: 1400 },
  { src: '/circ2025/venue-auditorium.webp', position: 'audience', width: 2400, height: 1400 },
  { src: '/exhibition/exhibition-16.jpg', position: 'exhibition', width: 1560, height: 1040 },
];

export default function HeroPhotoBackdrop({ en }) {
  const backdrop = useRef(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval;
    let visible = true;
    const updatePlayback = () => {
      window.clearInterval(interval);
      if (!paused && !motion.matches && !document.hidden && visible) {
        interval = window.setInterval(() => {
          setActivePhoto(current => (current + 1) % photos.length);
        }, 9000);
      }
    };
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        updatePlayback();
      })
      : null;
    if (observer && backdrop.current) observer.observe(backdrop.current);
    motion.addEventListener('change', updatePlayback);
    document.addEventListener('visibilitychange', updatePlayback);
    updatePlayback();
    return () => {
      window.clearInterval(interval);
      observer?.disconnect();
      motion.removeEventListener('change', updatePlayback);
      document.removeEventListener('visibilitychange', updatePlayback);
    };
  }, [paused]);

  const label = en
    ? (paused ? 'Resume background slideshow' : 'Pause background slideshow')
    : (paused ? 'Retomar animação de fundo' : 'Parar animação de fundo');

  return <>
    <div className="event-hero__photos" ref={backdrop} aria-hidden="true">
      {photos.map((photo, index) => <img
        className={`event-hero__photo event-hero__photo--${photo.position}${index === activePhoto ? ' is-active' : ''}`}
        key={photo.src}
        src={photo.src}
        alt=""
        width={photo.width}
        height={photo.height}
        decoding="async"
        fetchPriority="low"
      />)}
    </div>
    <button className="event-hero__motion" type="button" onClick={() => setPaused(value => !value)} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
        {paused ? <path d="M8 5v14l11-7z" /> : <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>}
      </svg>
    </button>
  </>;
}
