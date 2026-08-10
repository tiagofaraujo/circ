import React from 'react';
import { Link } from 'react-router-dom';
import ContactForm from '../components/js/ContactForm';

function PageHero({ eyebrow, title, lead, status }) {
  return (
    <section className="page-hero">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="page-hero__aside">
        {status && <span className="status-chip">{status}</span>}
        <p>{lead}</p>
      </div>
    </section>
  );
}

function StatusBlock({ number, title, status, children }) {
  return (
    <article className="status-block">
      <span className="status-block__number">{number}</span>
      <div>
        <p className="eyebrow">{status}</p>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </article>
  );
}

export function ProgramPage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="CIRC 2027 · 8–10 abril"
        title="Programa"
        status="Em preparação"
        lead="O CIRC 2027 integra um Curso Pré-Congresso a 8 de abril e o Congresso Internacional nos dias 9 e 10. Os conteúdos são publicados apenas após confirmação."
      />

      <section className="programme-phases">
        <article className="programme-phase programme-phase--course">
          <span className="programme-phase__date">08</span>
          <div>
            <p className="eyebrow">Abril · Pré-Congresso</p>
            <h2>Curso Pré-Congresso</h2>
            <span className="status-chip">Tema e programa a anunciar</span>
            <p>
              Um dia dedicado a formação estruturada antes da abertura oficial do congresso. O tema, formato, corpo docente e condições de participação serão publicados após validação final.
            </p>
          </div>
        </article>

        <article className="programme-phase programme-phase--congress">
          <span className="programme-phase__date">09—10</span>
          <div>
            <p className="eyebrow">Abril · CIRC 2027</p>
            <h2>Congresso Internacional</h2>
            <span className="status-chip">Programa científico em desenvolvimento</span>
            <p>
              Dois dias de sessões científicas, mesas-redondas, atualização profissional, inovação e encontro entre participantes, oradores e parceiros.
            </p>
          </div>
        </article>
      </section>

      <section className="status-list">
        <StatusBlock number="01" title="Programa científico" status="Em desenvolvimento">
          A estrutura das sessões e os conteúdos científicos serão apresentados neste espaço assim que estiverem consolidados.
        </StatusBlock>
        <StatusBlock number="02" title="Oradores e convidados" status="Por anunciar">
          Não existem ainda convidados publicados. As confirmações serão adicionadas progressivamente, com biografia, tema e sessão.
        </StatusBlock>
        <StatusBlock number="03" title="Programa detalhado" status="Por publicar">
          Horários, salas e versão final do programa serão disponibilizados para consulta online e em formato de fácil leitura.
        </StatusBlock>
      </section>

      <section className="callout">
        <div>
          <p className="eyebrow">Save the date</p>
          <h2>8–10 de abril de 2027 · Coimbra</h2>
          <p>8 abril · Curso Pré-Congresso &nbsp;·&nbsp; 9–10 abril · CIRC 2027</p>
        </div>
        <Link className="button button--dark" to="/participar">Participar</Link>
      </section>
    </main>
  );
}

export function ParticipatePage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="Participar"
        title="Inscrições e trabalhos"
        status="Ainda não aberto"
        lead="As inscrições e a submissão de trabalhos ainda não têm data pública de abertura. Esta página será a referência oficial para prazos e condições do Curso Pré-Congresso e do CIRC 2027."
      />

      <section className="editorial-grid editorial-grid--three">
        <article className="info-card info-card--course">
          <p className="eyebrow">8 abril · Curso Pré-Congresso</p>
          <h2>Inscrição a anunciar</h2>
          <p>
            O formato de inscrição, eventuais vagas, condições e relação com a inscrição no congresso serão divulgados quando estiverem definidos.
          </p>
        </article>
        <article className="info-card">
          <p className="eyebrow">9–10 abril · CIRC 2027</p>
          <h2>Inscrições a anunciar</h2>
          <p>
            Categorias, valores, condições e política de cancelamento serão publicados antes da abertura das inscrições.
          </p>
        </article>
        <article className="info-card info-card--accent">
          <p className="eyebrow">Trabalhos científicos</p>
          <h2>Regulamento em preparação</h2>
          <p>
            Prazos, formatos, critérios de avaliação e informação sobre comunicações e posters serão disponibilizados quando aprovados.
          </p>
        </article>
      </section>

      <section className="callout callout--soft">
        <div>
          <p className="eyebrow">Agora</p>
          <h2>Reserve 8, 9 e 10 de abril de 2027.</h2>
          <p>Três dias de experiência CIRC, com um dia de formação pré-congresso e dois dias de congresso.</p>
        </div>
      </section>
    </main>
  );
}

export function PartnersPage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="Parceiros"
        title="Patrocínio e exposição"
        status="Em preparação"
        lead="O CIRC 2027 irá disponibilizar informação dedicada a parceiros institucionais, indústria e exposição comercial."
      />

      <section className="split-content">
        <div>
          <p className="eyebrow">CIRC 2027 · 8–10 abril</p>
          <h2>Uma área própria para parceiros.</h2>
        </div>
        <div>
          <p>
            O dossier de patrocínio, modalidades de participação, contrapartidas e informação da exposição comercial serão publicados quando a proposta comercial estiver fechada.
          </p>
          <p>
            Até lá, esta página evita reutilizar preços ou condições da edição anterior, mantendo a comunicação comercial rigorosa.
          </p>
          <Link className="button button--outline" to="/contactos">Contactar organização</Link>
        </div>
      </section>

      <section className="support-strip support-strip--page">
        <p>Com apoio do Município de Coimbra</p>
      </section>
    </main>
  );
}

export function CoimbraPage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="Coimbra"
        title="Local e estadia"
        status="Informação em atualização"
        lead="O CIRC 2027 decorre entre 8 e 10 de abril, com Curso Pré-Congresso no dia 8 e congresso nos dias 9 e 10. O Convento São Francisco recebe o congresso principal."
      />

      <section className="venue-feature venue-feature--2027">
        <div className="venue-feature__date">
          <span className="venue-feature__course">08</span>
          <span>09—10</span>
          <small>ABR · 2027</small>
        </div>
        <div className="venue-feature__copy">
          <p className="eyebrow">Venue</p>
          <h2>Convento São Francisco</h2>
          <p>Coimbra · Portugal</p>
          <p>
            A página será complementada com informação prática para participantes: acessos, estacionamento, transportes, hotelaria e restauração. A localização específica do Curso Pré-Congresso será indicada quando confirmada.
          </p>
        </div>
      </section>
    </main>
  );
}

export function Archive2025Page() {
  return (
    <main className="page">
      <PageHero
        eyebrow="Arquivo"
        title="CIRC 2025"
        status="Edição concluída"
        lead="A edição de 2025 decorreu em Coimbra entre 3 e 5 de abril e afirmou a continuidade do CIRC como espaço de atualização, debate e ligação entre profissionais."
      />

      <section className="archive-page">
        <div className="archive-page__image">
          <img src="/cartaz_v2.jpg" alt="Cartaz oficial CIRC 2025" />
        </div>
        <div className="archive-page__copy">
          <p className="eyebrow">Eyes on the Future</p>
          <h2>Inovação, inteligência artificial e sustentabilidade.</h2>
          <p>
            Em 2025, o CIRC destacou a Inteligência Artificial aplicada à Radiologia, inovação tecnológica, prática clínica e a transição para hospitais e cuidados de saúde mais sustentáveis.
          </p>
          <p>
            Esta área preserva a identidade e os principais conteúdos da edição anterior sem confundir informação histórica com as condições do CIRC 2027.
          </p>

          <div className="archive-tags" aria-label="Temas CIRC 2025">
            <span>Inteligência Artificial</span>
            <span>Radiologia</span>
            <span>Hospitais Verdes</span>
            <span>Inovação</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ContactPage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="Contactos"
        title="Fale com a organização"
        lead="Utilize o formulário para assuntos gerais relacionados com o congresso. Pedidos específicos serão encaminhados para a área responsável."
      />

      <section className="contact-layout">
        <div>
          <p className="eyebrow">CIRC 2027</p>
          <h2>Congresso Internacional de Radiologia de Coimbra</h2>
          <p>8–10 abril 2027 · Coimbra</p>
          <p>8 abril · Curso Pré-Congresso &nbsp;·&nbsp; 9–10 abril · Congresso</p>
          <p className="contact-layout__note">
            Para inscrições, programa e submissão de trabalhos, consulte primeiro as páginas dedicadas: são atualizadas assim que existe informação confirmada.
          </p>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="page">
      <PageHero
        eyebrow="404"
        title="Página não encontrada"
        lead="O endereço que tentou abrir não existe ou foi alterado durante a atualização do website."
      />
      <section className="callout">
        <div>
          <h2>Voltar ao CIRC 2027</h2>
        </div>
        <Link className="button button--dark" to="/">Página inicial</Link>
      </section>
    </main>
  );
}
