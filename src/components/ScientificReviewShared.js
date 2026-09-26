import React, { useEffect } from 'react';
import { reviewAbstractLabels, reviewStatusLabels } from '../auth/scientificReview';

export function ReviewAvailability({ loading, en = false }) {
  return (
    <section className="review-empty" role="status">
      <h2>
        {loading
          ? en
            ? 'Loading review area…'
            : 'A carregar a área de avaliação…'
          : en
            ? 'Review area awaiting activation'
            : 'Área de avaliação por ativar'}
      </h2>
      <p>
        {loading
          ? ''
          : en
            ? 'The organisation is preparing access to this area.'
            : 'A organização está a preparar o acesso a esta área.'}
      </p>
    </section>
  );
}
export function ReviewAbstract({ work, en = false }) {
  return (
    <div className="review-abstract">
      {work.abstractSections ? (
        reviewAbstractLabels.map(([key, pt, english]) => (
          <section key={key}>
            <h3>{en ? english : pt}</h3>
            <p>{work.abstractSections[key] || '—'}</p>
          </section>
        ))
      ) : (
        <section>
          <h3>{en ? 'Abstract' : 'Resumo'}</h3>
          <p>{work.abstract || '—'}</p>
        </section>
      )}
    </div>
  );
}
export function ReviewStatus({ status, en = false }) {
  return (
    <span className={`review-status is-${status}`}>
      {reviewStatusLabels[status]?.[en ? 1 : 0] || status}
    </span>
  );
}
export function ReviewIdentity({ identity, en = false }) {
  return (
    <section className="review-identity">
      <h3>{en ? 'Authors · accepted submission' : 'Autores · trabalho aceite'}</h3>
      <p>{identity.authors || identity.contactName || '—'}</p>
      {identity.affiliation && <p>{identity.affiliation}</p>}
    </section>
  );
}
export function reviewNumber(value, en = false) {
  return value === null || value === undefined
    ? '—'
    : Number(value).toLocaleString(en ? 'en-GB' : 'pt-PT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export function useReviewDraftGuard(dirty, onDirtyChange) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

export function confirmReviewSwitch(dirty, en) {
  return (
    !dirty ||
    window.confirm(
      en
        ? 'You have unsaved changes. Discard them and open another submission?'
        : 'Tem alterações por guardar. Pretende descartá-las e abrir outro trabalho?',
    )
  );
}
