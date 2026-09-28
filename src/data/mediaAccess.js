import { useEffect, useState } from 'react';
import media from './mediaCenter.json';
export const mediaPreview = process.env.REACT_APP_MEDIA_PREVIEW === 'true';
export const mediaVisible = media.published || mediaPreview;

export function useMediaAccess() {
  const [allowed, setAllowed] = useState(mediaPreview);
  useEffect(() => {
    if (mediaPreview || typeof fetch !== 'function') return;
    let active = true;
    fetch('/media-access', {credentials:'same-origin', cache:'no-store'})
      .then(r => r.ok ? r.json() : null)
      .then(data => { if(active) setAllowed(data?.authenticated === true); })
      .catch(() => { if(active) setAllowed(false); });
    return () => { active = false; };
  }, []);
  return mediaVisible && allowed;
}
