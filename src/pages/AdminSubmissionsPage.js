import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  submissionStatuses,
  subscribeToSubmissions,
  updateSubmissionReview,
} from '../auth/adminOperationsStore';
import { normalizeAbstractSections } from '../auth/submissionAbstract';
import { exportSubmissionPdf } from '../auth/submissionPdf';
import AdminModuleNav from '../components/AdminModuleNav';
import '../admin.css';
import '../adminOperations.css';

const statusLabels = {
  draft: 'Rascunho',
  submitted: 'Por avaliar',
  under_review: 'Em revisão',
  revisions: 'Revisões pedidas',
  accepted: 'Aceite',
  rejected: 'Não aceite',
};

const typeLabels = {
  oral: 'Comunicação livre',
  poster: 'Poster',
};

const abstractSectionLabels = [
  ['introduction', 'Introdução'],
  ['objective', 'Objetivo'],
  ['methods', 'Métodos'],
  ['results', 'Resultados'],
  ['conclusion', 'Conclusão'],
  ['keywords', 'Palavras-chave'],
];

function getAbstractItems(submission) {
  if (submission.abstractSections && typeof submission.abstractSections === 'object') {
    const sections = normalizeAbstractSections(submission.abstractSections);
    return abstractSectionLabels.map(([key, label]) => ({
      key,
      label,
      value: sections[key] || '—',
    }));
  }

  return [{
    key: 'legacy',
    label: 'Resumo',
    value: submission.abstract || 'Resumo não disponível.',
  }];
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportSubmissions(items) {
  const header = [
    'Código',
    'Tipologia',
    'Título',
    'Autor de contacto',
    'Email',
    'Autores',
    'Instituição',
    'Introdução',
    'Objetivo',
    'Métodos',
    'Resultados',
    'Conclusão',
    'Palavras-chave',
    'Resumo legado',
    'Estado',
    'Submetido em',
    'Última atualização',
  ];
  const rows = items.map((item) => {
    const sections = normalizeAbstractSections(item.abstractSections);
    return [
      item.code || item.id,
      typeLabels[item.type] || item.type,
      item.title,
      item.contactName,
      item.contactEmail,
      String(item.authors || '').replace(/\n/g, ' · '),
      item.affiliation,
      sections.introduction,
      sections.objective,
      sections.methods,
      sections.results,
      sections.conclusion,
      sections.keywords,
      item.abstractSections ? '' : item.abstract,
      statusLabels[item.status] || item.status,
      formatDate(item.submittedAt),
      formatDate(item.updatedAt || item.createdAt),
    ];
  });
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `circ-2027-submissoes-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminSubmissionsPage() {
  const { user, access } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});
  const [savingId, setSavingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => subscribeToSubmissions(
    (items) => {
      setSubmissions(items);
      setLoading(false);
      setError('');
    },
    () => {
      setLoading(false);
      setError('Não foi possível carregar as submissões. Confirme as regras do Firestore.');
    }
  ), []);

  const visibleSubmissions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return submissions.filter((item) => {
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const abstractText = Object.values(normalizeAbstractSections(item.abstractSections)).join(' ');
      const haystack = `${item.code || item.id} ${item.title || ''} ${item.contactName || ''} ${item.contactEmail || ''} ${item.authors || ''} ${item.affiliation || ''} ${abstractText} ${item.abstract || ''}`.toLowerCase();
      return matchesType && matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [query, statusFilter, submissions, typeFilter]);

  const counts = useMemo(() => ({
    total: submissions.length,
    pending: submissions.filter((item) => item.status === 'submitted').length,
    review: submissions.filter((item) => ['under_review', 'revisions'].includes(item.status)).length,
    accepted: submissions.filter((item) => item.status === 'accepted').length,
  }), [submissions]);

  const saveReview = async (submission) => {
    const status = statusDrafts[submission.id] || submission.status || 'draft';
    const note = noteDrafts[submission.id] ?? submission.review?.note ?? '';
    setSavingId(submission.id);
    setError('');
    try {
      await updateSubmissionReview(user, submission, status, note);
    } catch (updateError) {
      setError('Não foi possível guardar a decisão. A alteração não foi registada.');
    } finally {
      setSavingId('');
    }
  };

  const exportPdf = (submission) => {
    setError('');
    try {
      exportSubmissionPdf(submission, { language: 'pt' });
    } catch (exportError) {
      setError('Não foi possível abrir o PDF. Confirme se o navegador bloqueou a nova janela.');
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CIRC 2027 · Administração científica</p>
          <h1>Gestão de submissões</h1>
          <p>Triagem, acompanhamento e decisão editorial num único espaço.</p>
        </div>
        <div className="admin-session admin-session--quiet">
          <span>Comissão e gestão</span>
          <strong>{user?.email}</strong>
          {access?.canTestSubmissions && (
            <Link className="admin-test-link" to="/conta/submissoes">Criar submissão de teste →</Link>
          )}
        </div>
      </header>

      <AdminModuleNav />

      <section className="admin-metrics" aria-label="Resumo das submissões">
        <article><span>Total</span><strong>{counts.total}</strong><small>trabalhos registados</small></article>
        <article><span>Por avaliar</span><strong>{counts.pending}</strong><small>aguardam triagem</small></article>
        <article><span>Em curso</span><strong>{counts.review}</strong><small>em revisão ou correção</small></article>
        <article><span>Aceites</span><strong>{counts.accepted}</strong><small>decisão favorável</small></article>
      </section>

      <section className="admin-workspace">
        <div className="admin-toolbar admin-toolbar--submissions">
          <label>
            <span>Pesquisar</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, título, autor ou instituição" />
          </label>
          <label>
            <span>Tipologia</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Todas</option>
              <option value="oral">Comunicação livre</option>
              <option value="poster">Poster</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              {submissionStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
          </label>
          <button type="button" className="admin-export" onClick={() => exportSubmissions(visibleSubmissions)} disabled={!visibleSubmissions.length}>Exportar CSV</button>
        </div>

        {error && <div className="admin-alert" role="alert">{error}</div>}
        {loading && <div className="admin-empty">A carregar submissões…</div>}
        {!loading && !error && !visibleSubmissions.length && (
          <div className="admin-empty">
            <strong>Ainda não existem trabalhos neste resultado.</strong>
            <p>As submissões criadas no Centro de Submissões surgirão aqui automaticamente.</p>
          </div>
        )}

        {!loading && visibleSubmissions.length > 0 && (
          <div className="admin-submission-list">
            {visibleSubmissions.map((submission) => {
              const currentStatus = statusDrafts[submission.id] || submission.status || 'draft';
              const currentNote = noteDrafts[submission.id] ?? submission.review?.note ?? '';
              const changed = currentStatus !== (submission.status || 'draft') || currentNote.trim() !== String(submission.review?.note || '').trim();
              const submittedAt = submission.submittedAt
                || (submission.status !== 'draft' ? submission.createdAt : null);

              return (
                <article className="admin-submission" key={submission.id}>
                  <div className="admin-submission__summary">
                    <div className="admin-submission__identity">
                      <div>
                        {submission.isTest && <span className="admin-test-badge">TESTE</span>}
                        <small>{submission.code || submission.id}</small>
                        <span>{typeLabels[submission.type] || submission.type || 'Sem tipologia'}</span>
                      </div>
                      <h2>{submission.title || 'Trabalho sem título'}</h2>
                    </div>
                    <div className="admin-submission__contact">
                      <span>Autor de contacto</span>
                      <strong>{submission.contactName || '—'}</strong>
                      <small>{submission.contactEmail || '—'}</small>
                      <small>{submission.affiliation || 'Instituição não indicada'}</small>
                    </div>
                    <label className="admin-submission__status">
                      <span>Estado científico</span>
                      <select className={`submission-status submission-status--${currentStatus}`} value={currentStatus} onChange={(event) => setStatusDrafts((current) => ({ ...current, [submission.id]: event.target.value }))} disabled={savingId === submission.id}>
                        {submissionStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                      </select>
                      <div className="admin-submission__timestamps">
                        <small>
                          <strong>{submittedAt ? 'Submetido em' : 'Rascunho criado em'}</strong>
                          {formatDate(submittedAt || submission.createdAt)}
                        </small>
                        <small>
                          <strong>Última atualização</strong>
                          {formatDate(submission.updatedAt || submission.createdAt)}
                        </small>
                      </div>
                    </label>
                  </div>

                  <details className="admin-submission__details">
                    <summary>Consultar trabalho e registar decisão <span>＋</span></summary>
                    <div className="admin-submission__content">
                      <div>
                        <span>Autores</span>
                        <p>{String(submission.authors || '—').split('\n').map((author, index) => <React.Fragment key={`${author}-${index}`}>{author}<br /></React.Fragment>)}</p>
                      </div>
                      <div className="admin-submission__abstract">
                        <span>{submission.abstractSections ? 'Resumo estruturado' : 'Resumo'}</span>
                        <div className="admin-submission__abstract-sections">
                          {getAbstractItems(submission).map((section) => (
                            <section key={section.key}>
                              <h3>{section.label}</h3>
                              <p>{section.value}</p>
                            </section>
                          ))}
                        </div>
                      </div>
                      <label>
                        <span>Nota da Comissão Científica</span>
                        <textarea rows="5" maxLength="1000" value={currentNote} onChange={(event) => setNoteDrafts((current) => ({ ...current, [submission.id]: event.target.value }))} placeholder="Registe aqui observações internas, pedido de revisão ou fundamento da decisão…" disabled={savingId === submission.id} />
                        <small>{currentNote.length}/1000</small>
                      </label>
                      <div className="admin-submission__actions">
                        <button type="button" className="admin-submission__pdf" onClick={() => exportPdf(submission)}>
                          Exportar PDF
                        </button>
                        <button type="button" className="admin-submission__save" onClick={() => saveReview(submission)} disabled={!changed || savingId === submission.id}>
                          {savingId === submission.id ? 'A guardar…' : changed ? 'Guardar decisão' : 'Decisão guardada'}
                        </button>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="admin-footer">
        <p>As notas e decisões ficam associadas ao trabalho e registadas no histórico administrativo.</p>
        <Link to="/conta">← Voltar ao My CIRC</Link>
      </footer>
    </main>
  );
}
