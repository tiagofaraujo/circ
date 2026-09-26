import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  emptyReviewScores,
  reviewableStatuses,
  reviewCriteria,
  reviewErrorMessage,
  REVIEW_COMMENT_LIMIT,
  reviewTotal,
} from '../auth/scientificReview';
import {
  saveScientificEvaluation,
  subscribeAcceptedIdentity,
  subscribeReviewerWorks,
  useScientificReviewConfig,
} from '../auth/scientificReviewStore';
import {
  confirmReviewSwitch,
  ReviewAbstract,
  ReviewAvailability,
  ReviewIdentity,
  reviewNumber,
  ReviewStatus,
  useReviewDraftGuard,
} from '../components/ScientificReviewShared';
import '../scientificReview.css';

function AssignedWork({ work, user, en, onDirtyChange }) {
  const [scores, setScores] = useState(work.evaluation?.scores || emptyReviewScores());
  const [comment, setComment] = useState(work.evaluation?.comment || '');
  const [basis, setBasis] = useState(work);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [identityError, setIdentityError] = useState(false);
  const total = reviewTotal(scores);
  const locked = !reviewableStatuses.includes(work.status);
  useReviewDraftGuard(dirty && !locked, onDirtyChange);
  useEffect(() => {
    if (!dirty) {
      setScores(work.evaluation?.scores || emptyReviewScores());
      setComment(work.evaluation?.comment || '');
      setBasis(work);
    }
  }, [work, dirty]);
  useEffect(() => {
    setIdentity(null);
    setIdentityError(false);
    if (work.status !== 'accepted') return undefined;
    let active = true;
    const unsubscribe = subscribeAcceptedIdentity(
      work.submissionId,
      (value) => {
        if (active) setIdentity(value);
      },
      () => {
        if (active) {
          setIdentity(null);
          setIdentityError(true);
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [work.submissionId, work.status]);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await saveScientificEvaluation(user, basis, scores, comment);
      setDirty(false);
      setFeedback({ ok: true, text: en ? 'Evaluation saved.' : 'Avaliação guardada.' });
    } catch (error) {
      setFeedback({ ok: false, text: reviewErrorMessage(error, en) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="review-work">
      <header className="review-work__heading">
        <div>
          <p className="review-eyebrow">
            {work.code} ·{' '}
            {work.type === 'poster' ? 'Poster' : en ? 'Oral communication' : 'Comunicação livre'}
            {work.isTest ? ' · TESTE' : ''}
          </p>
          <h2>{work.title}</h2>
        </div>
        <ReviewStatus status={work.status} en={en} />
      </header>
      {work.status !== 'accepted' && (
        <p className="review-anonymous">
          {en
            ? 'Anonymous review · author identities are available after acceptance.'
            : 'Avaliação anónima · a identidade dos autores fica disponível após a aceitação.'}
        </p>
      )}
      {work.status === 'accepted' && identity && <ReviewIdentity identity={identity} en={en} />}
      {work.status === 'accepted' && identityError && (
        <p role="status">
          {en
            ? 'Author details are currently unavailable. Reload to try again.'
            : 'Os dados dos autores não estão disponíveis. Atualize a página para tentar novamente.'}
        </p>
      )}
      <ReviewAbstract work={work} en={en} />
      <form className="review-form" onSubmit={save}>
        <header>
          <p className="review-eyebrow">{en ? 'Your evaluation' : 'A sua avaliação'}</p>
          <h2>{en ? 'Scoring grid' : 'Grelha de avaliação'}</h2>
          <p>
            {en
              ? 'Score each criterion from 0 to 10. All five criteria have equal weight.'
              : 'Pontue cada critério de 0 a 10. Os cinco critérios têm o mesmo peso.'}
          </p>
        </header>
        <fieldset disabled={busy || locked}>
          <legend className="review-sr-only">
            {en ? 'Evaluation criteria' : 'Critérios de avaliação'}
          </legend>
          {reviewCriteria.map(([key, pt, english], index) => (
            <label className="review-score-row" key={key}>
              <span>
                <small>{String(index + 1).padStart(2, '0')}</small>
                {en ? english : pt}
              </span>
              <span className="review-score-input">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="10"
                  step="0.01"
                  required
                  value={scores[key] ?? ''}
                  onChange={(e) => {
                    setScores((current) => ({ ...current, [key]: e.target.value }));
                    setDirty(true);
                    setFeedback(null);
                  }}
                  aria-label={en ? english : pt}
                />
                <span aria-hidden="true">/ 10</span>
              </span>
            </label>
          ))}
          <label className="review-comment">
            <span>
              {en ? 'Comment' : 'Comentário'}{' '}
              <small>
                {en ? '(optional · for the supervisor)' : '(opcional · para o superavaliador)'}
              </small>
            </span>
            <textarea
              rows="5"
              maxLength={REVIEW_COMMENT_LIMIT}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setDirty(true);
                setFeedback(null);
              }}
              placeholder={
                en
                  ? 'Explain your assessment, strengths and points to improve…'
                  : 'Fundamente a avaliação, os pontos fortes e os aspetos a melhorar…'
              }
            />
            <small>
              {comment.length} / {REVIEW_COMMENT_LIMIT}
            </small>
          </label>
        </fieldset>
        <div className="review-total">
          <span>{en ? 'Total score' : 'Pontuação total'}</span>
          <strong>
            {reviewNumber(total, en)} <small>/ 50</small>
          </strong>
          <span>
            {en ? 'Average' : 'Média'}: <b>{reviewNumber(total === null ? null : total / 5, en)}</b>{' '}
            / 10
          </span>
        </div>
        {locked ? (
          <p className="review-notice">
            {en
              ? 'Evaluation closed. The supervisor can reopen it if needed.'
              : 'Avaliação encerrada. O superavaliador pode reabri-la, se necessário.'}
          </p>
        ) : (
          <div className="review-form__actions">
            <button
              className="review-button"
              type="submit"
              disabled={busy || total === null || (!dirty && Boolean(work.evaluation))}
            >
              {busy
                ? en
                  ? 'Saving…'
                  : 'A guardar…'
                : en
                  ? 'Save evaluation'
                  : 'Guardar avaliação'}
            </button>
            <small>
              {dirty
                ? en
                  ? 'Unsaved changes'
                  : 'Alterações por guardar'
                : work.evaluation
                  ? en
                    ? 'Saved'
                    : 'Guardada'
                  : en
                    ? 'Not evaluated yet'
                    : 'Ainda não avaliado'}
            </small>
          </div>
        )}
        {feedback && (
          <p
            className={`review-feedback ${feedback.ok ? 'is-success' : 'is-error'}`}
            role={feedback.ok ? 'status' : 'alert'}
          >
            {feedback.text}
          </p>
        )}
      </form>
    </article>
  );
}

export default function ScientificReviewerPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const config = useScientificReviewConfig();
  const [works, setWorks] = useState([]),
    [selected, setSelected] = useState('');
  const [state, setState] = useState('loading'),
    [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setWorks([]);
    setSelected('');
    setState('loading');
    if (!config.enabled) return undefined;
    let active = true;
    const unsubscribe = subscribeReviewerWorks(
      user.email,
      (items) => {
        if (active) {
          setWorks(items);
          setState('ready');
        }
      },
      () => {
        if (active) {
          setWorks([]);
          setSelected('');
          setState('error');
        }
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [config.enabled, user.uid, user.email, reload]);
  const selectedWork = works.find((work) => work.id === selected);
  return (
    <main className="scientific-review-page">
      <header className="review-page-header">
        <p className="review-eyebrow">MY CIRC · {en ? 'Reviewer' : 'Revisor'}</p>
        <h1>{en ? 'My evaluations' : 'As minhas avaliações'}</h1>
        <p>
          {en
            ? 'Read and evaluate the submissions assigned to you.'
            : 'Consulte e avalie os trabalhos que lhe foram atribuídos.'}
        </p>
      </header>
      {!config.enabled ? (
        <ReviewAvailability loading={config.loading} en={en} />
      ) : (
        <>
          <div className="review-stats">
            <span>
              <strong>{works.length}</strong>
              {en ? 'assigned' : 'atribuídos'}
            </span>
            <span>
              <strong>{works.filter((w) => w.evaluation).length}</strong>
              {en ? 'evaluated' : 'avaliados'}
            </span>
            <span>
              <strong>{works.filter((w) => !w.evaluation).length}</strong>
              {en ? 'to evaluate' : 'por avaliar'}
            </span>
          </div>
          {state === 'loading' && (
            <p role="status">
              {en ? 'Loading assigned submissions…' : 'A carregar os trabalhos atribuídos…'}
            </p>
          )}
          {state === 'error' && (
            <div className="review-empty" role="alert">
              <p>
                {en
                  ? 'Could not load your assignments.'
                  : 'Não foi possível carregar os trabalhos atribuídos.'}
              </p>
              <button className="review-button" onClick={() => setReload((n) => n + 1)}>
                {en ? 'Try again' : 'Tentar novamente'}
              </button>
            </div>
          )}
          {state === 'ready' && !works.length && (
            <div className="review-empty">
              <h2>{en ? 'No submissions assigned yet' : 'Ainda não tem trabalhos atribuídos'}</h2>
              <p>
                {en
                  ? 'Your supervisor will assign submissions to you here.'
                  : 'O superavaliador irá atribuir-lhe trabalhos nesta área.'}
              </p>
            </div>
          )}
          {works.length > 0 && (
            <div className="review-layout">
              <nav
                className="review-work-list"
                aria-label={en ? 'Assigned submissions' : 'Trabalhos atribuídos'}
              >
                {works.map((work) => (
                  <button
                    type="button"
                    key={work.id}
                    onClick={() => {
                      if (selected !== work.id && confirmReviewSwitch(dirty, en))
                        setSelected(work.id);
                    }}
                    aria-current={selected === work.id ? 'true' : undefined}
                  >
                    <small>
                      {work.code}
                      {work.isTest ? ' · TESTE' : ''}
                    </small>
                    <strong>{work.title}</strong>
                    <span>
                      {work.evaluation
                        ? en
                          ? 'Evaluated'
                          : 'Avaliado'
                        : en
                          ? 'To evaluate'
                          : 'Por avaliar'}{' '}
                      <b>
                        {reviewNumber(
                          work.evaluation ? reviewTotal(work.evaluation.scores) : null,
                          en,
                        )}{' '}
                        / 50
                      </b>
                    </span>
                  </button>
                ))}
              </nav>
              {selectedWork ? (
                <AssignedWork
                  key={selectedWork.id}
                  work={selectedWork}
                  user={user}
                  en={en}
                  onDirtyChange={setDirty}
                />
              ) : (
                <div className="review-empty">
                  <h2>{en ? 'Select a submission' : 'Selecione um trabalho'}</h2>
                  <p>
                    {en
                      ? 'Its abstract and scoring grid will open here.'
                      : 'O resumo e a grelha de avaliação serão apresentados aqui.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
