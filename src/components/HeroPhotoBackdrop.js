import React, { useEffect, useRef, useState } from 'react';

const photos = [
  {
    src: '/circ2025/hero-auditorium.webp',
    position: 'auditorium',
    width: 2400,
    height: 1400,
    pt: 'Auditório principal',
    en: 'Main auditorium',
  },
  {
    src: '/circ2025/venue-auditorium.webp',
    position: 'audience',
    width: 2400,
    height: 1400,
    pt: 'CIRC em Coimbra',
    en: 'CIRC in Coimbra',
  },
  {
    src: '/circ2025/scientific-programme.webp',
    position: 'programme',
    width: 2400,
    height: 1400,
    pt: 'Programa científico',
    en: 'Scientific programme',
  },
  {
    src: '/circ2025/medical-exhibition.webp',
    position: 'exhibition',
    width: 2400,
    height: 1400,
    pt: 'Medical Radiology Exhibition',
    en: 'Medical Radiology Exhibition',
  },
];

export default function HeroPhotoBackdrop({ en }) {
  const backdrop = useRef(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(!document.hidden);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(motion.matches);
    updateMotion();
    if (motion.addEventListener) motion.addEventListener('change', updateMotion);
    else motion.addListener?.(updateMotion);
    return () => {
      if (motion.removeEventListener) motion.removeEventListener('change', updateMotion);
      else motion.removeListener?.(updateMotion);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function' || !backdrop.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => setSectionVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(backdrop.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !sectionVisible || !pageVisible) return undefined;
    const timer = window.setTimeout(() => {
      setActivePhoto(current => (current + 1) % photos.length);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [activePhoto, pageVisible, paused, reducedMotion, sectionVisible]);

  const goTo = index => setActivePhoto((index + photos.length) % photos.length);
  const previous = () => goTo(activePhoto - 1);
  const next = () => goTo(activePhoto + 1);
  const current = photos[activePhoto];
  const slideshowLabel = en ? 'CIRC photo slideshow' : 'Apresentação de fotografias do CIRC';
  const pauseLabel = en
    ? (paused ? 'Resume photo slideshow' : 'Pause photo slideshow')
    : (paused ? 'Retomar apresentação de fotografias' : 'Pausar apresentação de fotografias');

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
        loading={index === 0 ? 'eager' : 'lazy'}
        fetchPriority={index === 0 ? 'high' : 'low'}
      />)}
    </div>

    <div className="event-hero__slideshow" role="group" aria-label={slideshowLabel}>
      <span className="event-hero__slide-label" aria-hidden="true">
        CIRC 2025 · {en ? current.en : current.pt}
      </span>
      <button className="event-hero__slide-control" type="button" onClick={previous} aria-label={en ? 'Previous photo' : 'Fotografia anterior'} title={en ? 'Previous photo' : 'Fotografia anterior'}>
        <span aria-hidden="true">‹</span>
      </button>
      <div className="event-hero__slide-dots" aria-label={en ? 'Choose photo' : 'Escolher fotografia'}>
        {photos.map((photo, index) => <button
          type="button"
          key={photo.src}
          className={index === activePhoto ? 'is-active' : ''}
          onClick={() => goTo(index)}
          aria-label={`${en ? 'Photo' : 'Fotografia'} ${index + 1}: ${en ? photo.en : photo.pt}`}
          aria-current={index === activePhoto ? 'true' : undefined}
          title={en ? photo.en : photo.pt}
        />)}
      </div>
      <span className="event-hero__slide-count" aria-hidden="true">{String(activePhoto + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span>
      <button className="event-hero__slide-control" type="button" onClick={next} aria-label={en ? 'Next photo' : 'Fotografia seguinte'} title={en ? 'Next photo' : 'Fotografia seguinte'}>
        <span aria-hidden="true">›</span>
      </button>
      <button className="event-hero__motion" type="button" onClick={() => setPaused(value => !value)} aria-label={pauseLabel} title={pauseLabel} aria-pressed={paused}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" focusable="false">
          {paused ? <path d="M8 5v14l11-7z" /> : <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>}
        </svg>
      </button>
    </div>
  </>;
}
