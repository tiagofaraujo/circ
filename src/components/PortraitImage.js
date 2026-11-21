import React, { useState } from 'react';

export default function PortraitImage({ image, name, initials, compact = false }) {
  const [failed, setFailed] = useState(null);
  if (image && failed !== image) return <img src={`/speakers/${image}`} alt={compact ? '' : name}
    width={compact ? 52 : 350} height={compact ? 52 : 350} loading="lazy" decoding="async" onError={() => setFailed(image)} />;
  return <span className={compact ? 'schedule-speaker__initials' : 'guest-initials'}
    aria-label={compact ? undefined : name} aria-hidden={compact ? 'true' : undefined}>{initials}</span>;
}
