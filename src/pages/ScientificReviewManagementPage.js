import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { subscribeToSubmissions } from '../auth/adminOperationsStore';
import {
  MAX_REVIEWERS,
  reviewCriteria,
  reviewErrorMessage,
  reviewMean,
  reviewStatusLabels,
  reviewTotal,
} from '../auth/scientificReview';
import {
  assignScientificReviewers,
  saveScientificReviewer,
  subscribeReviewAssignment,
  subscribeReviewers,
  subscribeReviewerWork,
  updateScientificDecision,
  useScientificReviewConfig,
} from '../auth/scientificReviewStore';
import {
  confirmReviewSwitch,
  ReviewAbstract,
  ReviewAvailability,
  reviewNumber,
  ReviewStatus,
  useReviewDraftGuard,
} from '../components/ScientificReviewShared';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../scientificReview.css';

function ReviewerDirectory({ reviewers, user, en }) {
  const [name, setName] = useState(''),
    [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(null);
  const save = async (event, record) => {
    event?.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await saveScientificReviewer(user, record || { name, email, active: true });
      if (!record) {
        setName('');
        setEmail('');
      }
      setFeedback({ ok: true, text: en ? 'Reviewer updated.' : 'Revisor atualizado.' });
    } catch (error) {
      setFeedback({ ok: false, text: reviewErrorMessage(error, en) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="review-directory">
      <summary>
        {en ? 'Manage reviewers' : 'Gerir revisores'}{' '}
        <span>
          {reviewers.filter((r) => r.active).length} {en ? 'active' : 'ativos'}
        </span>
      </summary>
      <div className="review-directory__body">
        <p>
          {en
            ? 'Add the email used by the reviewer to sign in to My CIRC. The account must have a verified email. No email is sent automatically.'
            : 'Adicione o email que o revisor utiliza para entrar no My CIRC. A conta deve ter o email verificado. Não é enviado nenhum email automaticamente.'}
        </p>
        <form className="review-directory__form" onSubmit={(event) => save(event)}>
          <label>
            {en ? 'Reviewer name' : 'Nome do revisor'}
            <input
              required
              minLength="2"
              maxLength="160"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              maxLength="254"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="review-button" type="submit" disabled={busy}>
            {en ? 'Add reviewer' : 'Adicionar revisor'}
          </button>
        </form>
        <ul className="review-directory__list">
          {reviewers.map((reviewer) => (
            <li key={reviewer.id}>
              <div>
                <strong>{reviewer.name}</strong>
                <span>{reviewer.email}</span>
              </div>
              <span>
                {reviewer.active ? (en ? 'Active' : 'Ativo') : en ? 'Inactive' : 'Inativo'}
              </span>
              <button
                className="review-text-button"
                type="button"
                disabled={busy}
                onClick={() => save(null, { ...reviewer, active: !reviewer.active })}
              >
                {reviewer.active ? (en ? 'Deactivate' : 'Desativar') : en ? 'Activate' : 'Ativar'}
              </button>
            </li>
          ))}
        </ul>
        {feedback && (
          <p
            className={`review-feedback ${feedback.ok ? 'is-success' : 'is-error'}`}
            role={feedback.ok ? 'status' : 'alert'}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </details>
  );
}

function ReviewComparison({ emails, reviewers, submission, onWorks, en }) {
  const [records, setRecords] = useState({}),
    [errors, setErrors] = useState({});
  const emailKey = JSON.stringify(emails);
  useEffect(() => {
    setRecords({});
    setErrors({});
    let active = true;
    const unsubscribers = JSON.parse(emailKey).map((email) =>
      subscribeReviewerWork(
        email,
        submission.id,
        (work) => {
          if (active) {
            setRecords((current) => ({ ...current, [email]: work }));
            setErrors((current) => ({ ...current, [email]: false }));
          }
        },
        () => {
          if (active) {
            setRecords((current) => ({ ...current, [email]: null }));
            setErrors((current) => ({ ...current, [email]: true }));
          }
        },
      ),
    );
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [emailKey, submission.id]);
  useEffect(() => {
    onWorks(Object.values(records).filter(Boolean));
  }, [records, onWorks]);
  return (
    <div className="review-comparison">
      <h3>{en ? 'Reviewer evaluations' : 'Avaliações dos revisores'}</h3>
      {!emails.length ? (
        <p>
          {en
            ? 'Assign reviewers to start the evaluation.'
            : 'Atribua revisores para iniciar a avaliação.'}
        </p>
      ) : (
        <div className="review-table-wrap">
          <table className="review-table">
            <caption>
              {en
                ? 'Scores by reviewer. A dash means no saved evaluation.'
                : 'Pontuações por revisor. O travessão indica ausência de avaliação guardada.'}
            </caption>
            <thead>
              <tr>
                <th>{en ? 'Reviewer' : 'Revisor'}</th>
                {reviewCriteria.map(([key, pt, english], index) => (
                  <th key={key} title={en ? english : pt}>
                    C{index + 1}
                  </th>
                ))}
                <th>{en ? 'Total' : 'Total'} / 50</th>
                <th>{en ? 'Average' : 'Média'} / 10</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => {
                const record = records[email],
                  person = reviewers.find((r) => r.email === email);
                const evaluation = record?.evaluation,
                  total = evaluation ? reviewTotal(evaluation.scores) : null;
                return (
                  <React.Fragment key={email}>
                    <tr>
                      <th scope="row">
                        <strong>{person?.name || email}</strong>
                        <small>
                          {errors[email]
                            ? en
                              ? 'Could not load'
                              : 'Erro ao carregar'
                            : !(email in records)
                              ? en
                                ? 'Loading…'
                                : 'A carregar…'
                              : evaluation
                                ? en
                                  ? 'Evaluated'
                                  : 'Avaliado'
                                : en
                                  ? 'Pending'
                                  : 'Pendente'}
                          {person?.active === false
                            ? en
                              ? ' · Inactive reviewer'
                              : ' · Revisor inativo'
                            : ''}
                        </small>
                      </th>
                      {reviewCriteria.map(([key]) => (
                        <td key={key}>{reviewNumber(evaluation?.scores[key], en)}</td>
                      ))}
                      <td>
                        <strong>{reviewNumber(total, en)}</strong>
                      </td>
                      <td>{reviewNumber(total === null ? null : total / 5, en)}</td>
                    </tr>
                    <tr className="review-table__comment">
                      <td colSpan="8">
                        <strong>
                          {en ? 'Comment' : 'Comentário'} · {person?.name || email}
                        </strong>
                        <p>{evaluation?.comment || (en ? 'No comment.' : 'Sem comentário.')}</p>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="review-mobile-evaluations">
        {emails.map((email) => {
          const record = records[email],
            person = reviewers.find((r) => r.email === email);
          const evaluation = record?.evaluation,
            total = evaluation ? reviewTotal(evaluation.scores) : null;
          return (
            <section key={email} className="review-mobile-evaluation">
              <header>
                <h4>{person?.name || email}</h4>
                <span>
                  {errors[email]
                    ? en
                      ? 'Could not load'
                      : 'Erro ao carregar'
                    : !(email in records)
                      ? en
                        ? 'Loading…'
                        : 'A carregar…'
                      : evaluation
                        ? en
                          ? 'Evaluated'
                          : 'Avaliado'
                        : en
                          ? 'Pending'
                          : 'Pendente'}
                  {person?.active === false ? (en ? ' · Inactive' : ' · Inativo') : ''}
                </span>
              </header>
              <dl className="review-mobile-scores">
                {reviewCriteria.map(([key, pt, english], index) => (
                  <div key={key}>
                    <dt>
                      <span aria-hidden="true">C{index + 1}</span>
                      <span className="review-sr-only">{en ? english : pt}</span>
                    </dt>
                    <dd>{reviewNumber(evaluation?.scores[key], en)}</dd>
                  </div>
                ))}
              </dl>
              <div className="review-mobile-total">
                <span>
                  Total <strong>{reviewNumber(total, en)}</strong> / 50
                </span>
                <span>
                  {en ? 'Average' : 'Média'}{' '}
                  <strong>{reviewNumber(total === null ? null : total / 5, en)}</strong> / 10
                </span>
              </div>
              <div className="review-mobile-comment">
                <strong>{en ? 'Comment' : 'Comentário'}</strong>
                <p>{evaluation?.comment || (en ? 'No comment.' : 'Sem comentário.')}</p>
              </div>
            </section>
          );
        })}
      </div>
      <ol className="review-criteria-key">
        {reviewCriteria.map(([key, pt, english], i) => (
          <li key={key}>
            <strong>C{i + 1}</strong> {en ? english : pt}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SubmissionReviewManagement({ submission, reviewers, user, en, onDirtyChange }) {
  const [control, setControl] = useState(null),
    [selectedEmails, setSelectedEmails] = useState([]);
  const [edited, setEdited] = useState(false),
    [records, setRecords] = useState([]);
  const [status, setStatus] = useState(submission.status),
    [note, setNote] = useState(submission.review?.note || '');
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(null),
    [assignmentError, setAssignmentError] = useState(false);
  useReviewDraftGuard(
    edited || status !== submission.status || note !== (submission.review?.note || ''),
    onDirtyChange,
  );
  useEffect(
    () =>
      subscribeReviewAssignment(
        submission.id,
        (data) => {
          setControl(data);
          setAssignmentError(false);
        },
        () => setAssignmentError(true),
      ),
    [submission.id],
  );
  useEffect(() => {
    if (!edited && control) setSelectedEmails(control.reviewerEmails || []);
  }, [control, edited]);
  useEffect(() => {
    setStatus(submission.status);
    setNote(submission.review?.note || '');
  }, [submission.status, submission.review?.note]);
  const activeEmails = control?.reviewerEmails || [];
  const activeRecords = records.filter((w) => w.active);
  const mean = reviewMean(activeRecords);
  const run = async (operation, success) => {
    setBusy(true);
    setFeedback(null);
    try {
      await operation();
      setFeedback({ ok: true, text: success });
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
            {submission.code || submission.id}
            {submission.isTest ? ' · TESTE' : ''}
          </p>
          <h2>{submission.title}</h2>
        </div>
        <ReviewStatus status={submission.status} en={en} />
      </header>
      <details className="review-abstract-toggle">
        <summary>{en ? 'Read the abstract' : 'Ler o resumo'}</summary>
        <ReviewAbstract work={submission} en={en} />
      </details>
      <section className="review-assign">
        <header>
          <h3>{en ? 'Assign reviewers' : 'Atribuir revisores'}</h3>
          <span>
            {selectedEmails.length} / {MAX_REVIEWERS}
          </span>
        </header>
        <p>
          {en
            ? 'Choose the reviewers who can access this submission. Deactivated or unassigned reviewers lose access.'
            : 'Escolha os revisores que podem aceder a este trabalho. Um revisor desativado ou removido deixa de ter acesso.'}
        </p>
        {assignmentError ? (
          <p className="review-feedback is-error" role="alert">
            {en
              ? 'Could not load the assignment. Reload before making changes.'
              : 'Não foi possível carregar a atribuição. Atualize a página antes de alterar.'}
          </p>
        ) : (
          <fieldset disabled={busy || !control}>
            <legend className="review-sr-only">{en ? 'Reviewers' : 'Revisores'}</legend>
            {reviewers.map((reviewer) => (
              <label className="review-reviewer-choice" key={reviewer.id}>
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(reviewer.email)}
                  disabled={
                    !selectedEmails.includes(reviewer.email) &&
                    (!reviewer.active || selectedEmails.length >= MAX_REVIEWERS)
                  }
                  onChange={(event) => {
                    setEdited(true);
                    setSelectedEmails((current) =>
                      event.target.checked
                        ? [...current, reviewer.email]
                        : current.filter((e) => e !== reviewer.email),
                    );
                  }}
                />
                <span>
                  <strong>
                    {reviewer.name}
                    {!reviewer.active ? (en ? ' · Inactive' : ' · Inativo') : ''}
                  </strong>
                  <small>{reviewer.email}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {!reviewers.length && (
          <p>
            {en
              ? 'Add reviewers using “Manage reviewers” above.'
              : 'Adicione revisores em «Gerir revisores», acima.'}
          </p>
        )}
        <button
          className="review-button"
          type="button"
          disabled={busy || !edited || !control || assignmentError}
          onClick={() =>
            run(
              async () => {
                await assignScientificReviewers(user, submission.id, selectedEmails);
                setEdited(false);
              },
              en ? 'Assignments saved.' : 'Atribuições guardadas.',
            )
          }
        >
          {en ? 'Save assignments' : 'Guardar atribuições'}
        </button>
      </section>
      <div className="review-total review-total--summary">
        <span>
          {en ? 'Completed evaluations' : 'Avaliações concluídas'}{' '}
          <b>
            {activeRecords.filter((w) => w.evaluation).length} / {activeEmails.length}
          </b>
        </span>
        <span>
          {en ? 'Overall average' : 'Média global'}{' '}
          <strong>
            {reviewNumber(mean, en)} <small>/ 10</small>
          </strong>
        </span>
      </div>
      <ReviewComparison
        emails={activeEmails}
        reviewers={reviewers}
        submission={submission}
        onWorks={setRecords}
        en={en}
      />
      <form
        className="review-decision"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => updateScientificDecision(user, submission, status, note),
            en ? 'Decision saved.' : 'Decisão guardada.',
          );
        }}
      >
        <h3>{en ? 'Supervisor decision' : 'Decisão do superavaliador'}</h3>
        <p>
          {en
            ? 'Acceptance reveals the authors to assigned reviewers. Acceptance and rejection close scoring; an “Under review” status reopens it.'
            : 'A aceitação revela os autores aos revisores atribuídos. Aceitar ou não aceitar encerra a pontuação; o estado «Em avaliação» permite reabri-la.'}
        </p>
        <label>
          {en ? 'Status' : 'Estado'}
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
            {Object.entries(reviewStatusLabels).map(([key, labels]) => (
              <option key={key} value={key}>
                {labels[en ? 1 : 0]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {en ? 'Decision note' : 'Nota da decisão'}
          <textarea
            rows="3"
            maxLength="1000"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <small>{en ? 'This note is accessible to the submission author.' : 'Esta nota é acessível ao autor do trabalho.'}</small>
        </label>
        <button
          className="review-button"
          type="submit"
          disabled={
            busy || (status === submission.status && note === (submission.review?.note || ''))
          }
        >
          {en ? 'Save decision' : 'Guardar decisão'}
        </button>
      </form>
      {feedback && (
        <p
          className={`review-feedback ${feedback.ok ? 'is-success' : 'is-error'}`}
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.text}
        </p>
      )}
    </article>
  );
}

export default function ScientificReviewManagementPage() {
  const { user } = useAuth(),
    { language } = useLanguage();
  const en = language === 'en',
    config = useScientificReviewConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviewers, setReviewers] = useState([]),
    [submissions, setSubmissions] = useState([]);
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setReviewers([]);
    setSubmissions([]);
    setLoading(true);
    setError('');
    if (!config.enabled) return undefined;
    let active = true;
    const fail = () => {
      if (active) {
        active = false;
        setSubmissions([]);
        setReviewers([]);
        setLoading(false);
        setError(
          en
            ? 'Could not load the review area. Reload to try again.'
            : 'Não foi possível carregar a área de avaliação. Atualize a página para tentar novamente.',
        );
      }
    };
    const stopReviewers = subscribeReviewers((items) => {
      if (active) setReviewers(items);
    }, fail);
    const stopSubmissions = subscribeToSubmissions((items) => {
      if (active) {
        setSubmissions(items);
        setLoading(false);
      }
    }, fail);
    return () => {
      active = false;
      stopReviewers();
      stopSubmissions();
    };
  }, [config.enabled, en]);
  const selectedId = searchParams.get('trabalho') || '';
  const selected = submissions.find((s) => s.id === selectedId);
  const filtered = submissions.filter((s) =>
    `${s.code || ''} ${s.title || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className="scientific-review-page review-manager">
      <header className="review-page-header">
        <p className="review-eyebrow">MY CIRC · {en ? 'Supervisor' : 'Superavaliador'}</p>
        <h1>{en ? 'Scientific evaluation' : 'Avaliação científica'}</h1>
        <p>
          {en
            ? 'Assign submissions, compare scores and record the final decision.'
            : 'Distribua os trabalhos, compare pontuações e registe a decisão final.'}
        </p>
      </header>
      <AdminModuleNav />
      {!config.enabled ? (
        <ReviewAvailability loading={config.loading} en={en} />
      ) : (
        <>
          <ReviewerDirectory reviewers={reviewers} user={user} en={en} />
          {error && (
            <p className="review-feedback is-error" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">{en ? 'Loading submissions…' : 'A carregar trabalhos…'}</p>
          ) : (
            <div className="review-layout">
              <aside>
                <label className="review-search">
                  {en ? 'Find submission' : 'Procurar trabalho'}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={en ? 'Code or title' : 'Código ou título'}
                  />
                </label>
                <nav className="review-work-list" aria-label={en ? 'Submissions' : 'Trabalhos'}>
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-current={s.id === selectedId ? 'true' : undefined}
                      onClick={() => {
                        if (selectedId !== s.id && confirmReviewSwitch(dirty, en))
                          setSearchParams({ trabalho: s.id });
                      }}
                    >
                      <small>
                        {s.code || s.id}
                        {s.isTest ? ' · TESTE' : ''}
                      </small>
                      <strong>{s.title}</strong>
                      <ReviewStatus status={s.status} en={en} />
                    </button>
                  ))}
                </nav>
                {!filtered.length && (
                  <p>{en ? 'No submissions found.' : 'Sem trabalhos para apresentar.'}</p>
                )}
              </aside>
              {selected ? (
                <SubmissionReviewManagement
                  key={selected.id}
                  submission={selected}
                  reviewers={reviewers}
                  user={user}
                  en={en}
                  onDirtyChange={setDirty}
                />
              ) : (
                <div className="review-empty">
                  <h2>{en ? 'Select a submission' : 'Selecione um trabalho'}</h2>
                  <p>
                    {en
                      ? 'Assign up to three reviewers and compare their evaluations.'
                      : 'Atribua até três revisores e compare as suas avaliações.'}
                  </p>
                  <Link to="/admin/submissoes">
                    {en ? 'Submission management' : 'Gestão de submissões'} →
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
