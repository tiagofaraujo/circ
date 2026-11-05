import React, { useId, useMemo, useRef, useState } from 'react';
import { aggregateRegistrationAnalytics } from '../auth/registrationAnalytics';
import './RegistrationAnalytics.css';

const formatNumber = value => new Intl.NumberFormat('pt-PT').format(value);
const formatPercent = value => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(value);
const optionDetails = {
  onsite: { title: 'Congresso presencial', detail: '9–10 de abril · Coimbra', icon: '01' },
  virtual: { title: 'Congresso virtual', detail: '9–10 de abril · Online', icon: '02' },
  morningCourse: { title: 'Curso da manhã', detail: 'Pós-processamento em ressonância magnética', icon: '03' },
  afternoonCourse: { title: 'Curso da tarde', detail: 'Via Verde AVC', icon: '04' },
  dinnerQuantity: { title: 'Jantar do congresso', detail: 'Bilhetes de participantes e acompanhantes', icon: '05' },
  coursesOnly: { title: 'Só cursos pré-congresso', detail: 'Sem participação no congresso' },
};
const profileDetails = {
  uls: { title: 'Interno', detail: 'ULS Coimbra', className: 'internal' },
  external: { title: 'Externo', detail: 'Congressista externo', className: 'external' },
  student: { title: 'Aluno', detail: 'Estudante de IMR', className: 'student' },
  unknown: { title: 'Por identificar', detail: 'Perfil não registado', className: 'unknown' },
};

function Legend() {
  return <div className="registration-analytics__legend" aria-label="Legenda dos estados">
    <span><i className="is-paid" aria-hidden="true" />Pagas e confirmadas</span>
    <span><i className="is-pending" aria-hidden="true" />Pendentes</span>
  </div>;
}

function OfferingCard({ offering, featured = false }) {
  const details = optionDetails[offering.key];
  const isDinner = offering.key === 'dinnerQuantity';
  const paidShare = offering.limit ? Math.min(100, (offering.paid / offering.limit) * 100) : 0;
  return <article className={`registration-analytics__offering${featured ? ' is-featured' : ''}${isDinner ? ' is-dinner' : ''}`} aria-label={details.title}>
    <header>
      <span className="registration-analytics__index" aria-hidden="true">{details.icon}</span>
      <span className="registration-analytics__tag">{offering.limit ? `${formatNumber(offering.limit)} vagas` : isDinner ? 'Bilhetes' : 'Sem limite'}</span>
    </header>
    <div className="registration-analytics__offering-title"><h4>{details.title}</h4><p>{details.detail}</p></div>
    <dl className="registration-analytics__offering-counts">
      <div><dt>Pagas e confirmadas</dt><dd>{formatNumber(offering.paid)}</dd></div>
      <div className="is-pending"><dt>Pendentes</dt><dd>{formatNumber(offering.pending)}</dd></div>
    </dl>
    {offering.limit ? <div className="registration-analytics__occupancy">
      <div className="registration-analytics__track" aria-hidden="true"><span style={{ width: `${paidShare}%` }} /></div>
      <p><span><strong>{formatNumber(offering.remaining)}</strong> vagas disponíveis</span><span>{formatPercent(paidShare)}% ocupadas</span></p>
    </div> : <p className="registration-analytics__offering-note">{isDinner ? 'A contagem inclui todos os bilhetes pagos, incluindo compras adicionais.' : 'A participação virtual não está sujeita a lotação.'}</p>}
  </article>;
}

function Overview({ analytics }) {
  const { overview, offerings } = analytics;
  return <div>
    <div className="registration-analytics__kpis">
      <article><span>Inscrições ativas</span><strong>{formatNumber(overview.total)}</strong><small>registos de participantes</small></article>
      <article><span>Pagas</span><strong>{formatNumber(overview.paid)}</strong><small>pagamento recebido</small></article>
      <article><span>Pendentes</span><strong>{formatNumber(overview.pending)}</strong><small>a aguardar pagamento ou validação</small></article>
    </div>
    <div className="registration-analytics__section-heading"><div><h3>Participação e lotação</h3><p>Os lugares disponíveis consideram apenas as inscrições pagas e confirmadas.</p></div><Legend /></div>
    <div className="registration-analytics__offerings">
      {['onsite', 'virtual', 'dinnerQuantity', 'morningCourse', 'afternoonCourse'].map(key => {
        const offering = offerings.find(item => item.key === key);
        return offering ? <OfferingCard key={key} offering={offering} featured={key === 'onsite'} /> : null;
      })}
    </div>
    <p className="registration-analytics__footnote">Uma pessoa pode estar inscrita no congresso e nos cursos. O jantar é contado em bilhetes, não em participantes. Os pedidos pendentes não reservam vagas.</p>
    {analytics.pendingSupplementary > 0 && <p className="registration-analytics__supplements">Inclui {formatNumber(analytics.pendingSupplementary)} pedido(s) complementar(es) pendente(s) nas opções acima. Estes pedidos não criam uma segunda inscrição.</p>}
  </div>;
}

function Profiles({ analytics }) {
  const [filter, setFilter] = useState('all');
  const profiles = analytics.profiles.filter(profile => profile.key !== 'unknown' || profile.total > 0);
  const activeTotal = profiles.reduce((total, profile) => total + profile.total, 0);
  const filteredTotal = profiles.reduce((total, profile) => total + (filter === 'all' ? profile.total : profile[filter]), 0);
  const scopeText = filter === 'paid' ? 'com pagamento recebido' : filter === 'pending' ? 'com pagamento pendente' : 'ativas';
  const matrixOptions = [...analytics.offerings.slice(0, 2), { key: 'coursesOnly' }, ...analytics.offerings.slice(2)];
  return <div>
    <div className="registration-analytics__section-heading registration-analytics__section-heading--profiles">
      <div><h3>Quem se inscreve no CIRC</h3><p>Perfil escolhido na inscrição e respetivas opções de participação.</p></div>
      <div className="registration-analytics__filters" role="group" aria-label="Estado das inscrições nos perfis">
        {[['all', 'Todas'], ['paid', 'Pagas'], ['pending', 'Pendentes']].map(([key, label]) => <button type="button" aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
    </div>
    <div className="registration-analytics__profile-cards">
      {profiles.map(profile => {
        const details = profileDetails[profile.key];
        const count = filter === 'all' ? profile.total : profile[filter];
        const denominator = filter === 'all' ? activeTotal : filteredTotal;
        const share = denominator ? Math.round((count / denominator) * 100) : 0;
        return <article key={profile.key} className={`registration-analytics__profile is-${details.className}`} aria-label={`Perfil ${details.title}`}>
          <header><div><h4>{details.title}</h4><p>{details.detail}</p></div><span>{share}%</span></header>
          <div className="registration-analytics__profile-count"><strong>{formatNumber(count)}</strong><span>inscrições<br />{scopeText}</span></div>
          <div className="registration-analytics__profile-track" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
          <dl><div><dt>Pagas</dt><dd>{formatNumber(profile.paid)}</dd></div><div><dt>Pendentes</dt><dd>{formatNumber(profile.pending)}</dd></div></dl>
        </article>;
      })}
    </div>
    <section className="registration-analytics__matrix" aria-label="Opções de inscrição por perfil">
      <header><div><h3>O que escolheu cada perfil</h3><p>Participações e bilhetes por categoria de congressista.</p></div>{filter === 'all' && <Legend />}</header>
      <div className="registration-analytics__table-scroll" tabIndex="0" role="region" aria-label="Tabela de opções por perfil; deslize horizontalmente em ecrãs pequenos">
        <table className={profiles.length > 3 ? 'has-extra-profile' : undefined}>
          <caption className="registration-analytics__sr-only">Opções de inscrição por perfil de congressista. As opções não são exclusivas.</caption>
          <thead><tr><th scope="col">Opção de inscrição</th>{profiles.map(profile => <th scope="col" key={profile.key}>{profileDetails[profile.key].title}<small>{profileDetails[profile.key].detail}</small></th>)}</tr></thead>
          <tbody>{matrixOptions.map(offering => <tr key={offering.key}>
            <th scope="row">{optionDetails[offering.key].title}<small>{offering.key === 'dinnerQuantity' ? 'Quantidade de bilhetes' : optionDetails[offering.key].detail}</small></th>
            {profiles.map(profile => {
              const values = profile.offerings[offering.key];
              return <td key={profile.key}>{filter === 'all' ? <div className="registration-analytics__cell-pair"><span className="is-paid"><b>{formatNumber(values.paid)}</b><small>pagas</small></span><span className="is-pending"><b>{formatNumber(values.pending)}</b><small>pendentes</small></span></div> : <span className={`registration-analytics__cell-value is-${filter}`}>{formatNumber(values[filter])}<small>{filter === 'paid' ? 'pagas e confirmadas' : 'pendentes'}</small></span>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="registration-analytics__footnote">Os cursos e o jantar podem acumular com qualquer modalidade. Os bilhetes de acompanhantes ficam associados ao perfil do congressista que os comprou. Os pendentes por opção incluem compras adicionais, mesmo quando a inscrição principal está paga. As opções pagas mostram apenas direitos confirmados.</p>
    </section>
  </div>;
}

export default function RegistrationAnalytics({ registrations = [], payments = [], loading = false, error = '', paymentsLoading = false, paymentsError = '', view, onViewChange }) {
  const [localView, setLocalView] = useState('geral');
  const activeView = ['geral', 'perfis'].includes(view) ? view : localView;
  const analytics = useMemo(() => aggregateRegistrationAnalytics(registrations, payments), [registrations, payments]);
  const id = useId();
  const tabRefs = useRef([]);
  // Pending registrations depend on the current provider order as well as the registration.
  // Wait for both sources instead of briefly presenting incomplete totals as final.
  const allLoading = loading || paymentsLoading;
  const unavailable = error || paymentsError;
  const changeView = next => { setLocalView(next); onViewChange?.(next); };
  const handleKeyDown = (event, index) => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    changeView(next === 0 ? 'geral' : 'perfis');
    tabRefs.current[next]?.focus();
  };
  return <section className="registration-analytics" aria-labelledby={`${id}-heading`}>
    <header className="registration-analytics__heading"><div><p className="registration-analytics__eyebrow">Gestão de inscrições</p><h2 id={`${id}-heading`}>O congresso em números</h2></div><span className={`registration-analytics__live${allLoading || unavailable ? ' is-unavailable' : ''}`}><i aria-hidden="true" />{allLoading ? 'A carregar' : unavailable ? 'Dados indisponíveis' : 'Atualização automática'}</span></header>
    <div className="registration-analytics__tabs" role="tablist" aria-label="Painéis de estatísticas">
      {[['geral', 'Visão geral', '01'], ['perfis', 'Perfis dos congressistas', '02']].map(([key, label, index], i) => <button type="button" role="tab" key={key} id={`${id}-tab-${key}`} aria-controls={`${id}-panel-${key}`} aria-selected={activeView === key} tabIndex={activeView === key ? 0 : -1} ref={element => { tabRefs.current[i] = element; }} onKeyDown={event => handleKeyDown(event, i)} onClick={() => changeView(key)}><span aria-hidden="true">{index}</span>{label}</button>)}
    </div>
    <div className="registration-analytics__panel" role="tabpanel" id={`${id}-panel-${activeView}`} aria-labelledby={`${id}-tab-${activeView}`} tabIndex="0" aria-busy={allLoading}>
      {allLoading ? <div className="registration-analytics__state" role="status"><span className="registration-analytics__loader" aria-hidden="true" /><h3>A carregar as estatísticas</h3><p>A consultar as inscrições e os pagamentos do CIRC 2027.</p></div>
        : unavailable ? <div className="registration-analytics__state is-error" role="alert"><h3>Não foi possível carregar as estatísticas</h3><p>Os totais serão apresentados quando a ligação às inscrições e aos pagamentos for restabelecida.</p></div>
          : <>
            {analytics.overview.total === 0 && <p className="registration-analytics__empty">Ainda não existem inscrições ativas. Os painéis serão atualizados automaticamente com os primeiros registos.</p>}
            {analytics.overview.review > 0 && <p className="registration-analytics__notice"><strong>{formatNumber(analytics.overview.review)} inscrição(ões) em conferência.</strong> Apenas os direitos já confirmados entram na ocupação. Consulte a lista de inscrições para acompanhar estes pedidos.</p>}
            {activeView === 'geral' ? <Overview analytics={analytics} /> : <Profiles analytics={analytics} />}
            {(analytics.overview.cancelled > 0 || analytics.overview.refunded > 0) && <p className="registration-analytics__inactive">Fora das opções ativas: {formatNumber(analytics.overview.cancelled)} cancelada(s) · {formatNumber(analytics.overview.refunded)} reembolsada(s).</p>}
            {analytics.overview.closedUnpaid > 0 && <p className="registration-analytics__inactive">{formatNumber(analytics.overview.closedUnpaid)} pedido(s) encerrado(s) sem pagamento, fora dos totais ativos.</p>}
            {analytics.overview.drafts > 0 && <p className="registration-analytics__inactive">{formatNumber(analytics.overview.drafts)} rascunho(s) ainda sem pedido de pagamento, fora dos totais ativos.</p>}
            {analytics.overview.excluded > 0 && <p className="registration-analytics__inactive">{formatNumber(analytics.overview.excluded)} registo(s) histórico(s) ou incompleto(s) fora das estatísticas. Consulte a lista de inscrições para os conferir.</p>}
          </>}
    </div>
  </section>;
}
