import React from 'react';
import { Link } from 'react-router-dom';
import SocialConnect from '../components/js/SocialConnect';

const updates = [
  {
    index: '01',
    eyebrow: 'Curso Pré-Congresso',
    title: '8 de abril',
    text: 'Um dia dedicado a formação estruturada antes da abertura do congresso. Tema, programa e condições serão anunciados.',
    to: '/programa',
  },
  {
    index: '02',
    eyebrow: 'Programa científico',
    title: '9–10 de abril',
    text: 'A estrutura científica, sessões e temas da edição de 2027 serão publicados progressivamente.',
    to: '/programa',
  },
  {
    index: '03',
    eyebrow: 'Participação',
    title: 'Inscrições ainda não abertas',
    text: 'As datas, categorias e condições de inscrição do curso e do congresso serão anunciadas neste website.',
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
      <section className="hero hero--official" id="save-the-date">
        <div className="hero__copy">
          <p className="eyebrow">Congresso Internacional de Radiologia de Coimbra</p>
          <h1>
            CIRC
            <span>2027</span>
          </h1>
          <p className="hero__lead">
            8, 9 e 10 de abril de 2027. Três dias de formação, ciência, inovação e encontro profissional em Coimbra.
          </p>

          <div className="hero__format-list" aria-label="Estrutura do CIRC 2027">
            <div>
              <span>08 ABR</span>
              <strong>Curso Pré-Congresso</strong>
            </div>
            <div>
              <span>09—10 ABR</span>
              <strong>Congresso Internacional</strong>
            </div>
          </div>

          <div className="hero__actions">
            <Link className="button button--dark" to="/programa">
              Acompanhar o programa
            </Link>
            <Link className="text-link" to="/2025">
              Rever a edição de 2025 <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <p className="hero__note">
            Programa, convidados, inscrições e condições do curso serão anunciados progressivamente neste website.
          </p>
        </div>

        <figure className="hero__artwork">
          <img
            src="/save-the-date-2027.webp"
            alt="Save the Date CIRC 2027 — Coimbra, 8, 9 e 10 de abril de 2027"
          />
          <figcaption>Imagem oficial · Save the Date CIRC 2027</figcaption>
        </figure>
      </section>

      <section className="fact-strip" aria-label="Informação principal do CIRC 2027">
        <div>
          <span>Experiência CIRC</span>
          <strong>8–10 abril 2027</strong>
        </div>
        <div>
          <span>8 abril</span>
          <strong>Curso Pré-Congresso</strong>
        </div>
        <div>
          <span>9–10 abril</span>
          <strong>CIRC 2027</strong>
        </div>
        <div>
          <span>Local</span>
          <strong>Coimbra, Portugal</strong>
        </div>
      </section>

      <section className="section event-format">
        <div className="section-heading">
          <p className="eyebrow">CIRC 2027 · 3 dias · 2 formatos</p>
          <h2>Formação antes do congresso. Ciência e encontro profissional nos dois dias seguintes.</h2>
        </div>

        <div className="event-format__grid">
          <article className="event-format__card event-format__card--course">
            <div className="event-format__date">08</div>
            <div>
              <p className="eyebrow">Abril · Pré-Congresso</p>
              <h3>Curso Pré-Congresso</h3>
              <p>
                Um dia de formação estruturada integrado na experiência CIRC. O tema e o programa serão divulgados após confirmação.
              </p>
            </div>
          </article>

          <article className="event-format__card event-format__card--congress">
            <div className="event-format__date">09—10</div>
            <div>
              <p className="eyebrow">Abril · Congresso</p>
              <h3>CIRC 2027</h3>
              <p>
                Dois dias de programa científico, partilha profissional, inovação e ligação entre participantes, oradores e parceiros.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="section section--intro">
        <div className="section-heading">
          <p className="eyebrow">Informação oficial</p>
          <h2>Um evento em construção, com informação clara desde o primeiro dia.</h2>
        </div>
        <div className="section-copy">
          <p>
            Nesta fase, o website assume-se como ponto oficial de atualização da próxima edição. Publicamos apenas informação confirmada e assinalamos de forma transparente o que ainda está em preparação.
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

      <SocialConnect />

      <section className="section archive-teaser">
        <div className="archive-teaser__poster">
          <img src="/cartaz_v2.jpg" alt="Cartaz da edição CIRC 2025" />
        </div>

        <div className="archive-teaser__content">
          <p className="eyebrow">Arquivo · CIRC 2025</p>
          <h2>Eyes on the Future.</h2>
          <p>
            A edição de 2025 colocou em destaque a Inteligência Artificial na Radiologia, a inovação tecnológica e a transição para práticas de saúde mais sustentáveis.
          </p>
          <p>
            O arquivo de 2025 permanece acessível como memória do congresso e base para acompanhar a evolução do CIRC.
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
            <p>abril 2027 · Congresso</p>
          </div>
          <div className="venue-panel venue-panel--cream">
            <p className="eyebrow">Local do Congresso</p>
            <h3>Um encontro no centro de Coimbra.</h3>
            <p>
              O CIRC 2027 realiza-se no Convento São Francisco nos dias 9 e 10. A localização específica do Curso Pré-Congresso de 8 de abril será indicada quando confirmada. Informação sobre acessos, estadia e restauração será atualizada progressivamente.
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
