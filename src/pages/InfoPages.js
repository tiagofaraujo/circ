import React from 'react';
import { Link } from 'react-router-dom';
import ContactForm from '../components/js/ContactForm';
import { useLanguage } from '../context/LanguageContext';

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
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'CIRC 2027 · 8–10 April' : 'CIRC 2027 · 8–10 abril'}
        title={en ? 'Programme' : 'Programa'}
        status={en ? 'In preparation' : 'Em preparação'}
        lead={
          en
            ? 'CIRC 2027 includes a Pre-Congress Course on 8 April and the International Congress on 9 and 10 April. Content is published only after confirmation.'
            : 'O CIRC 2027 integra um Curso Pré-Congresso a 8 de abril e o Congresso Internacional nos dias 9 e 10. Os conteúdos são publicados apenas após confirmação.'
        }
      />

      <section className="programme-phases">
        <article className="programme-phase programme-phase--course">
          <span className="programme-phase__date">08</span>
          <div>
            <p className="eyebrow">{en ? 'April · Pre-Congress' : 'Abril · Pré-Congresso'}</p>
            <h2>{en ? 'Pre-Congress Course' : 'Curso Pré-Congresso'}</h2>
            <span className="status-chip">
              {en ? 'Theme and programme to be announced' : 'Tema e programa a anunciar'}
            </span>
            <p>
              {en
                ? 'A full day of structured training before the official opening of the congress. The theme, format, faculty and participation details will be published after final validation.'
                : 'Um dia dedicado a formação estruturada antes da abertura oficial do congresso. O tema, formato, corpo docente e condições de participação serão publicados após validação final.'}
            </p>
          </div>
        </article>

        <article className="programme-phase programme-phase--congress">
          <span className="programme-phase__date">09—10</span>
          <div>
            <p className="eyebrow">{en ? 'April · CIRC 2027' : 'Abril · CIRC 2027'}</p>
            <h2>{en ? 'International Congress' : 'Congresso Internacional'}</h2>
            <span className="status-chip">
              {en ? 'Scientific programme in development' : 'Programa científico em desenvolvimento'}
            </span>
            <p>
              {en
                ? 'Two days of scientific sessions, round tables, professional updates, innovation and exchange between participants, speakers and partners.'
                : 'Dois dias de sessões científicas, mesas-redondas, atualização profissional, inovação e encontro entre participantes, oradores e parceiros.'}
            </p>
          </div>
        </article>
      </section>

      <section className="status-list">
        <StatusBlock
          number="01"
          title={en ? 'Scientific programme' : 'Programa científico'}
          status={en ? 'In development' : 'Em desenvolvimento'}
        >
          {en
            ? 'The session structure and scientific content will be presented here as soon as they are consolidated.'
            : 'A estrutura das sessões e os conteúdos científicos serão apresentados neste espaço assim que estiverem consolidados.'}
        </StatusBlock>
        <StatusBlock
          number="02"
          title={en ? 'Speakers and guests' : 'Oradores e convidados'}
          status={en ? 'To be announced' : 'Por anunciar'}
        >
          {en
            ? 'No speakers have been published yet. Confirmations will be added progressively, including biography, topic and session.'
            : 'Não existem ainda convidados publicados. As confirmações serão adicionadas progressivamente, com biografia, tema e sessão.'}
        </StatusBlock>
        <StatusBlock
          number="03"
          title={en ? 'Detailed programme' : 'Programa detalhado'}
          status={en ? 'To be published' : 'Por publicar'}
        >
          {en
            ? 'Times, rooms and the final programme will be made available online in an easy-to-read format.'
            : 'Horários, salas e versão final do programa serão disponibilizados para consulta online e em formato de fácil leitura.'}
        </StatusBlock>
      </section>

      <section className="callout">
        <div>
          <p className="eyebrow">Save the Date</p>
          <h2>{en ? '8–10 April 2027 · Coimbra' : '8–10 de abril de 2027 · Coimbra'}</h2>
          <p>
            {en
              ? '8 April · Pre-Congress Course · 9–10 April · CIRC 2027'
              : '8 abril · Curso Pré-Congresso · 9–10 abril · CIRC 2027'}
          </p>
        </div>
        <Link className="button button--dark" to="/participar">
          {en ? 'Attend' : 'Participar'}
        </Link>
      </section>
    </main>
  );
}

export function ParticipatePage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Attend' : 'Participar'}
        title={en ? 'Registration and submissions' : 'Inscrições e trabalhos'}
        status={en ? 'Not open yet' : 'Ainda não aberto'}
        lead={
          en
            ? 'Registration and scientific submissions do not yet have a public opening date. This page will be the official reference for deadlines and conditions for the Pre-Congress Course and CIRC 2027.'
            : 'As inscrições e a submissão de trabalhos ainda não têm data pública de abertura. Esta página será a referência oficial para prazos e condições do Curso Pré-Congresso e do CIRC 2027.'
        }
      />

      <section className="editorial-grid editorial-grid--three">
        <article className="info-card info-card--course">
          <p className="eyebrow">{en ? '8 April · Pre-Congress Course' : '8 abril · Curso Pré-Congresso'}</p>
          <h2>{en ? 'Registration to be announced' : 'Inscrição a anunciar'}</h2>
          <p>
            {en
              ? 'Registration format, possible capacity limits, conditions and the relationship with congress registration will be announced once defined.'
              : 'O formato de inscrição, eventuais vagas, condições e relação com a inscrição no congresso serão divulgados quando estiverem definidos.'}
          </p>
        </article>
        <article className="info-card">
          <p className="eyebrow">{en ? '9–10 April · CIRC 2027' : '9–10 abril · CIRC 2027'}</p>
          <h2>{en ? 'Registration to be announced' : 'Inscrições a anunciar'}</h2>
          <p>
            {en
              ? 'Categories, fees, conditions and the cancellation policy will be published before registration opens.'
              : 'Categorias, valores, condições e política de cancelamento serão publicados antes da abertura das inscrições.'}
          </p>
        </article>
        <article className="info-card info-card--accent">
          <p className="eyebrow">{en ? 'Scientific submissions' : 'Trabalhos científicos'}</p>
          <h2>{en ? 'Guidelines in preparation' : 'Regulamento em preparação'}</h2>
          <p>
            {en
              ? 'Deadlines, formats, evaluation criteria and information about oral communications and posters will be published once approved.'
              : 'Prazos, formatos, critérios de avaliação e informação sobre comunicações e posters serão disponibilizados quando aprovados.'}
          </p>
        </article>
      </section>

      <section className="callout callout--soft">
        <div>
          <p className="eyebrow">{en ? 'Now' : 'Agora'}</p>
          <h2>{en ? 'Save 8, 9 and 10 April 2027.' : 'Reserve 8, 9 e 10 de abril de 2027.'}</h2>
          <p>
            {en
              ? 'Three days of CIRC: one day of pre-congress training and two days of congress.'
              : 'Três dias de experiência CIRC, com um dia de formação pré-congresso e dois dias de congresso.'}
          </p>
        </div>
      </section>
    </main>
  );
}

export function PartnersPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Partners' : 'Parceiros'}
        title={en ? 'Sponsorship and exhibition' : 'Patrocínio e exposição'}
        status={en ? 'In preparation' : 'Em preparação'}
        lead={
          en
            ? 'CIRC 2027 will provide dedicated information for institutional partners, industry and commercial exhibition.'
            : 'O CIRC 2027 irá disponibilizar informação dedicada a parceiros institucionais, indústria e exposição comercial.'
        }
      />

      <section className="split-content">
        <div>
          <p className="eyebrow">{en ? 'CIRC 2027 · 8–10 April' : 'CIRC 2027 · 8–10 abril'}</p>
          <h2>{en ? 'A dedicated area for partners.' : 'Uma área própria para parceiros.'}</h2>
        </div>
        <div>
          <p>
            {en
              ? 'The sponsorship dossier, participation models, benefits and commercial exhibition information will be published once the commercial proposal is finalised.'
              : 'O dossier de patrocínio, modalidades de participação, contrapartidas e informação da exposição comercial serão publicados quando a proposta comercial estiver fechada.'}
          </p>
          <p>
            {en
              ? 'Until then, this page avoids reusing prices or conditions from the previous edition, keeping commercial communication accurate.'
              : 'Até lá, esta página evita reutilizar preços ou condições da edição anterior, mantendo a comunicação comercial rigorosa.'}
          </p>
          <Link className="button button--outline" to="/contactos">
            {en ? 'Contact the organisation' : 'Contactar organização'}
          </Link>
        </div>
      </section>

      <section className="support-strip support-strip--page">
        <div className="municipal-support">
          <span>{en ? 'With the support of' : 'Com apoio de'}</span>
          <img src="/cmc-logo-color.png" alt="Câmara Municipal de Coimbra" />
        </div>
      </section>
    </main>
  );
}

export function CoimbraPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow="Coimbra"
        title={en ? 'Venue and accommodation' : 'Local e estadia'}
        status={en ? 'Information being updated' : 'Informação em atualização'}
        lead={
          en
            ? 'CIRC 2027 takes place from 8 to 10 April, with the Pre-Congress Course on the 8th and the congress on the 9th and 10th. Convento São Francisco hosts the main congress.'
            : 'O CIRC 2027 decorre entre 8 e 10 de abril, com Curso Pré-Congresso no dia 8 e congresso nos dias 9 e 10. O Convento São Francisco recebe o congresso principal.'
        }
      />

      <section className="venue-feature venue-feature--2027">
        <div className="venue-feature__date">
          <span className="venue-feature__course">08</span>
          <span>09—10</span>
          <small>{en ? 'APR · 2027' : 'ABR · 2027'}</small>
        </div>
        <div className="venue-feature__copy">
          <p className="eyebrow">Venue</p>
          <h2>Convento São Francisco</h2>
          <p>Coimbra · Portugal</p>
          <p>
            {en
              ? 'This page will be expanded with practical information for participants: access, parking, transport, hotels and restaurants. The specific location of the Pre-Congress Course will be announced once confirmed.'
              : 'A página será complementada com informação prática para participantes: acessos, estacionamento, transportes, hotelaria e restauração. A localização específica do Curso Pré-Congresso será indicada quando confirmada.'}
          </p>
        </div>
      </section>
    </main>
  );
}

export function Archive2025Page() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Archive' : 'Arquivo'}
        title="CIRC 2025"
        status={en ? 'Completed edition' : 'Edição concluída'}
        lead={
          en
            ? 'The 2025 edition took place in Coimbra from 3 to 5 April and reinforced CIRC as a space for professional updates, debate and connection.'
            : 'A edição de 2025 decorreu em Coimbra entre 3 e 5 de abril e afirmou a continuidade do CIRC como espaço de atualização, debate e ligação entre profissionais.'
        }
      />

      <section className="archive-page">
        <div className="archive-page__image">
          <img src="/cartaz_v2.jpg" alt={en ? 'Official CIRC 2025 poster' : 'Cartaz oficial CIRC 2025'} />
        </div>
        <div className="archive-page__copy">
          <p className="eyebrow">Eyes on the Future</p>
          <h2>
            {en
              ? 'Innovation, artificial intelligence and sustainability.'
              : 'Inovação, inteligência artificial e sustentabilidade.'}
          </h2>
          <p>
            {en
              ? 'In 2025, CIRC highlighted Artificial Intelligence applied to Radiology, technological innovation, clinical practice and the transition towards more sustainable hospitals and healthcare.'
              : 'Em 2025, o CIRC destacou a Inteligência Artificial aplicada à Radiologia, inovação tecnológica, prática clínica e a transição para hospitais e cuidados de saúde mais sustentáveis.'}
          </p>
          <p>
            {en
              ? 'This area preserves the identity and main content of the previous edition without mixing historical information with the conditions of CIRC 2027.'
              : 'Esta área preserva a identidade e os principais conteúdos da edição anterior sem confundir informação histórica com as condições do CIRC 2027.'}
          </p>

          <div className="archive-tags" aria-label={en ? 'CIRC 2025 themes' : 'Temas CIRC 2025'}>
            <span>{en ? 'Artificial Intelligence' : 'Inteligência Artificial'}</span>
            <span>{en ? 'Radiology' : 'Radiologia'}</span>
            <span>{en ? 'Green Hospitals' : 'Hospitais Verdes'}</span>
            <span>{en ? 'Innovation' : 'Inovação'}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ContactPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Contact' : 'Contactos'}
        title={en ? 'Contact the organisation' : 'Fale com a organização'}
        lead={
          en
            ? 'Use the form for general enquiries about the congress. Specific requests will be forwarded to the relevant area.'
            : 'Utilize o formulário para assuntos gerais relacionados com o congresso. Pedidos específicos serão encaminhados para a área responsável.'
        }
      />

      <section className="contact-layout">
        <div>
          <p className="eyebrow">CIRC 2027</p>
          <h2>{en ? 'Coimbra International Radiology Congress' : 'Congresso Internacional de Radiologia de Coimbra'}</h2>
          <p>{en ? '8–10 April 2027 · Coimbra' : '8–10 abril 2027 · Coimbra'}</p>
          <p>
            {en
              ? '8 April · Pre-Congress Course · 9–10 April · Congress'
              : '8 abril · Curso Pré-Congresso · 9–10 abril · Congresso'}
          </p>
          <p className="contact-layout__note">
            {en
              ? 'For registration, programme and scientific submissions, please consult the dedicated pages first. They are updated whenever confirmed information becomes available.'
              : 'Para inscrições, programa e submissão de trabalhos, consulte primeiro as páginas dedicadas: são atualizadas assim que existe informação confirmada.'}
          </p>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}

export function NotFoundPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow="404"
        title={en ? 'Page not found' : 'Página não encontrada'}
        lead={
          en
            ? 'The address you tried to open does not exist or was changed during the website update.'
            : 'O endereço que tentou abrir não existe ou foi alterado durante a atualização do website.'
        }
      />
      <section className="callout">
        <div>
          <h2>{en ? 'Return to CIRC 2027' : 'Voltar ao CIRC 2027'}</h2>
        </div>
        <Link className="button button--dark" to="/">
          {en ? 'Home' : 'Página inicial'}
        </Link>
      </section>
    </main>
  );
}
