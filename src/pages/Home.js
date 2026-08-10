import React from 'react';
import { Link } from 'react-router-dom';

const updates = [
  {
    index: '01',
    eyebrow: 'Programa científico',
    title: 'Em preparação',
    text: 'A estrutura científica, sessões e temas da edição de 2027 serão publicados progressivamente.',
    to: '/programa',
  },
  {
    index: '02',
    eyebrow: 'Participação',
    title: 'Inscrições ainda não abertas',
    text: 'As datas, categorias e condições de inscrição serão anunciadas neste website.',
    to: '/participar',
  },
  {
    index: '03',
    eyebrow: 'Trabalhos científicos',
    title: 'Informação a anunciar',
    text: 'Prazos, regulamento e critérios de submissão serão disponibilizados quando estiverem fechados.',
    to: '/participar',
  },
  {
    index: '04',
    eyebrow: 'Parceiros',
    title: 'Patrocínio e exposição',
    text: 'A informação comercial do CIRC 2027 está em preparação para empresas e parceiros institucionais.',
    to: '/parcerias',
  },
];

function Home() {
  return (
    <main>
      <section className="hero" id="save-the-date">
        <div className="hero__copy">
          <p className="eyebrow">Congresso Internacional de Radiologia de Coimbra</p>
          <h1>
            CIRC
            <span>2027</span>
          </h1>
          <p className="hero__lead">
            Dois dias para reunir profissionais, investigadores, estudantes e parceiros
            da Radiologia e da Imagem Médica em Coimbra.
          </p>

          <div className="hero__actions">
            <Link className="button button--dark" to="/participar">
              Save the date
            </Link>
            <Link className="text-link" to="/2025">
              Rever a edição de 2025 <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <p className="hero__note">
            Programa, convidados e inscrições serão anunciados progressivamente.
          </p>
        </div>

        <div className="hero__visual" aria-label="CIRC 2027, 9 e 10 de abril, Coimbra">
          <div className="scan-orbit scan-orbit--one" />
          <div className="scan-orbit scan-orbit--two" />
          <div className="scan-orbit scan-orbit--three" />
          <div className="hero__date-card">
            <span className="hero__date-kicker">SAVE THE DATE</span>
            <strong>09 — 10</strong>
            <span>ABRIL · 2027</span>
            <small>Convento São Francisco · Coimbra</small>
          </div>
        </div>
      </section>

      <section className="fact-strip" aria-label="Informação principal do CIRC 2027">
        <div>
          <span>Quando</span>
          <strong>9–10 abril 2027</strong>
        </div>
        <div>
          <span>Onde</span>
          <strong>Convento São Francisco</strong>
        </div>
        <div>
          <span>Cidade</span>
          <strong>Coimbra, Portugal</strong>
        </div>
        <div>
          <span>Estado</span>
          <strong>Save the date</strong>
        </div>
      </section>

      <section className="section section--intro">
        <div className="section-heading">
          <p className="eyebrow">CIRC 2027</p>
          <h2>Um congresso em construção, com informação clara desde o primeiro dia.</h2>
        </div>
        <div className="section-copy">
          <p>
            Nesta fase, o website assume-se como ponto oficial de atualização da próxima
            edição. Publicamos apenas informação confirmada e assinalamos de forma
            transparente o que ainda está em preparação.
          </p>
          <Link className="text-link" to="/programa">
            Ver estado do programa <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section section--cards">
        <div className="section-heading section-heading--compact">
          <p className="eyebrow">Próximas atualizações</p>
          <h2>O que vai encontrar aqui</h2>
        </div>

        <div className="editorial-grid">
          {updates.map((item) => (
            <Link className="editorial-card" to={item.to} key={item.index}>
              <span className="editorial-card__index">{item.index}</span>
              <div>
                <p className="eyebrow">{item.eyebrow}</p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              <span className="editorial-card__arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section archive-teaser">
        <div className="archive-teaser__poster">
          <img src="/cartaz_v2.jpg" alt="Cartaz da edição CIRC 2025" />
        </div>

        <div className="archive-teaser__content">
          <p className="eyebrow">Arquivo · CIRC 2025</p>
          <h2>Eyes on the Future.</h2>
          <p>
            A edição de 2025 colocou em destaque a Inteligência Artificial na Radiologia,
            a inovação tecnológica e a transição para práticas de saúde mais sustentáveis.
          </p>
          <p>
            O arquivo de 2025 permanece acessível como memória do congresso e base para
            acompanhar a evolução do CIRC.
          </p>
          <Link className="button button--outline" to="/2025">
            Explorar CIRC 2025
          </Link>
        </div>
      </section>

      <section className="section venue-section">
        <div className="venue-section__header">
          <p className="eyebrow">Coimbra</p>
          <h2>Convento São Francisco</h2>
        </div>

        <div className="venue-section__grid">
          <div className="venue-panel venue-panel--blue">
            <span>09–10</span>
            <p>abril 2027</p>
          </div>
          <div className="venue-panel venue-panel--cream">
            <p className="eyebrow">Local</p>
            <h3>Um encontro no centro de Coimbra.</h3>
            <p>
              Informação sobre acessos, estadia e restauração será atualizada à medida
              que a organização fecha as condições para participantes.
            </p>
            <Link className="text-link" to="/coimbra">
              Preparar a visita <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="support-strip">
        <p>Organização · Associação Hemisfério Disciplinado</p>
        <p>Com apoio do Município de Coimbra</p>
      </section>
    </main>
  );
}

export default Home;
