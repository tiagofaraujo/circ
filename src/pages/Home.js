import React from 'react';
import { Link } from 'react-router-dom';
import SocialConnect from '../components/js/SocialConnect';
import { useLanguage } from '../context/LanguageContext';

const content = {
  pt: {
    updates: [
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
    ],
    heroEyebrow: 'Congresso Internacional de Radiologia de Coimbra',
    heroLead: '8, 9 e 10 de abril de 2027. Três dias de formação, ciência, inovação e encontro profissional em Coimbra.',
    courseDate: '08 ABR',
    course: 'Curso Pré-Congresso',
    congressDate: '09—10 ABR',
    congress: 'Congresso Internacional',
    followProgramme: 'Acompanhar o programa',
    myCircLogin: 'My CIRC · Login',
    myCircLoginHint: 'Participantes e administração',
    revisit2025: 'Rever a edição de 2025',
    factsLabel: 'Informação principal do CIRC 2027',
    experience: 'Experiência CIRC',
    eventDate: '8–10 abril 2027',
    local: 'Local',
    formatEyebrow: 'CIRC 2027 · 3 dias · 2 formatos',
    formatTitle: 'Formação antes do congresso. Ciência e encontro profissional nos dois dias seguintes.',
    aprilPre: 'Abril · Pré-Congresso',
    courseDescription: 'Um dia de formação estruturada integrado na experiência CIRC. O tema e o programa serão divulgados após confirmação.',
    aprilCongress: 'Abril · Congresso',
    congressDescription: 'Dois dias de programa científico, partilha profissional, inovação e ligação entre participantes, oradores e parceiros.',
    officialInfo: 'Informação oficial',
    officialTitle: 'Um evento em construção, com informação clara desde o primeiro dia.',
    officialText: 'Nesta fase, o website assume-se como ponto oficial de atualização da próxima edição. Publicamos apenas informação confirmada e assinalamos de forma transparente o que ainda está em preparação.',
    programmeStatus: 'Ver estado do programa',
    updatesEyebrow: 'Próximas atualizações',
    updatesTitle: 'O que vai encontrar aqui',
    archive: 'Arquivo · CIRC 2025',
    archiveTitle: 'Eyes on the Future.',
    archiveText1: 'A edição de 2025 colocou em destaque a Inteligência Artificial na Radiologia, a inovação tecnológica e a transição para práticas de saúde mais sustentáveis.',
    archiveText2: 'O arquivo de 2025 permanece acessível como memória do congresso e base para acompanhar a evolução do CIRC.',
    explore2025: 'Explorar CIRC 2025',
    posterAlt: 'Cartaz da edição CIRC 2025',
    venueLocal: 'Local do Congresso',
    venueTitle: 'Um encontro no centro de Coimbra.',
    venueText: 'O CIRC 2027 realiza-se no Convento São Francisco nos dias 9 e 10. A localização específica do Curso Pré-Congresso de 8 de abril será indicada quando confirmada. Informação sobre acessos, estadia e restauração será atualizada progressivamente.',
    prepareVisit: 'Preparar a visita',
    congressDateLabel: 'abril 2027 · Congresso',
  },
  en: {
    updates: [
      {
        index: '01',
        eyebrow: 'Pre-Congress Course',
        title: '8 April',
        text: 'A full day of structured training before the congress opens. The theme, programme and participation details will be announced.',
        to: '/programa',
      },
      {
        index: '02',
        eyebrow: 'Scientific programme',
        title: '9–10 April',
        text: 'The scientific structure, sessions and themes for the 2027 edition will be published progressively.',
        to: '/programa',
      },
      {
        index: '03',
        eyebrow: 'Attendance',
        title: 'Registration not yet open',
        text: 'Registration dates, categories and conditions for both the course and congress will be announced on this website.',
        to: '/participar',
      },
      {
        index: '04',
        eyebrow: 'Partners',
        title: 'Sponsorship and exhibition',
        text: 'Commercial information for CIRC 2027 is being prepared for companies and institutional partners.',
        to: '/parcerias',
      },
    ],
    heroEyebrow: 'Coimbra International Radiology Congress',
    heroLead: '8, 9 and 10 April 2027. Three days of education, science, innovation and professional exchange in Coimbra.',
    courseDate: '08 APR',
    course: 'Pre-Congress Course',
    congressDate: '09—10 APR',
    congress: 'International Congress',
    followProgramme: 'Follow the programme',
    myCircLogin: 'My CIRC · Login',
    myCircLoginHint: 'Participants and administration',
    revisit2025: 'Revisit the 2025 edition',
    factsLabel: 'Key CIRC 2027 information',
    experience: 'CIRC Experience',
    eventDate: '8–10 April 2027',
    local: 'Location',
    formatEyebrow: 'CIRC 2027 · 3 days · 2 formats',
    formatTitle: 'Training before the congress. Science and professional exchange over the following two days.',
    aprilPre: 'April · Pre-Congress',
    courseDescription: 'A full day of structured training integrated into the CIRC experience. The theme and programme will be announced once confirmed.',
    aprilCongress: 'April · Congress',
    congressDescription: 'Two days of scientific sessions, professional exchange, innovation and connection between participants, speakers and partners.',
    officialInfo: 'Official information',
    officialTitle: 'An event in development, with clear information from the start.',
    officialText: 'At this stage, the website is the official reference point for the next edition. We publish only confirmed information and clearly identify what is still being prepared.',
    programmeStatus: 'View programme status',
    updatesEyebrow: 'Next updates',
    updatesTitle: 'What you will find here',
    archive: 'Archive · CIRC 2025',
    archiveTitle: 'Eyes on the Future.',
    archiveText1: 'The 2025 edition highlighted Artificial Intelligence in Radiology, technological innovation and the transition towards more sustainable healthcare practices.',
    archiveText2: 'The 2025 archive remains available as part of the congress history and as a reference for following the evolution of CIRC.',
    explore2025: 'Explore CIRC 2025',
    posterAlt: 'Official CIRC 2025 poster',
    venueLocal: 'Congress Venue',
    venueTitle: 'A meeting in the heart of Coimbra.',
    venueText: 'CIRC 2027 will take place at Convento São Francisco on 9 and 10 April. The specific location of the Pre-Congress Course on 8 April will be announced once confirmed. Access, accommodation and dining information will be updated progressively.',
    prepareVisit: 'Plan your visit',
    congressDateLabel: 'April 2027 · Congress',
  },
};

function Home() {
  const { language } = useLanguage();
  const copy = content[language];

  return (
    <main>
      <section className="hero hero--official hero--without-artwork" id="save-the-date">
        <div className="hero__copy">
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h1>
            CIRC
            <span>2027</span>
          </h1>
          <p className="hero__lead">{copy.heroLead}</p>

          <div className="hero__format-list" aria-label={copy.factsLabel}>
            <div>
              <span>{copy.courseDate}</span>
              <strong>{copy.course}</strong>
            </div>
            <div>
              <span>{copy.congressDate}</span>
              <strong>{copy.congress}</strong>
            </div>
          </div>

          <div className="hero__actions hero__actions--with-login">
            <div className="hero__action-stack">
              <Link className="button button--dark" to="/programa">
                {copy.followProgramme}
              </Link>
              <Link className="hero__login-link" to="/login" aria-label={`${copy.myCircLogin} — ${copy.myCircLoginHint}`}>
                <span>
                  <strong>{copy.myCircLogin}</strong>
                  <small>{copy.myCircLoginHint}</small>
                </span>
                <b aria-hidden="true">→</b>
              </Link>
            </div>
            <Link className="text-link" to="/2025">
              {copy.revisit2025} <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="fact-strip" aria-label={copy.factsLabel}>
        <div>
          <span>{copy.experience}</span>
          <strong>{copy.eventDate}</strong>
        </div>
        <div>
          <span>{language === 'en' ? '8 April' : '8 abril'}</span>
          <strong>{copy.course}</strong>
        </div>
        <div>
          <span>{language === 'en' ? '9–10 April' : '9–10 abril'}</span>
          <strong>CIRC 2027</strong>
        </div>
        <div>
          <span>{copy.local}</span>
          <strong>Coimbra, Portugal</strong>
        </div>
      </section>

      <section className="section event-format">
        <div className="section-heading">
          <p className="eyebrow">{copy.formatEyebrow}</p>
          <h2>{copy.formatTitle}</h2>
        </div>

        <div className="event-format__grid">
          <article className="event-format__card event-format__card--course">
            <div className="event-format__date">08</div>
            <div>
              <p className="eyebrow">{copy.aprilPre}</p>
              <h3>{copy.course}</h3>
              <p>{copy.courseDescription}</p>
            </div>
          </article>

          <article className="event-format__card event-format__card--congress">
            <div className="event-format__date">09—10</div>
            <div>
              <p className="eyebrow">{copy.aprilCongress}</p>
              <h3>CIRC 2027</h3>
              <p>{copy.congressDescription}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="section section--intro">
        <div className="section-heading">
          <p className="eyebrow">{copy.officialInfo}</p>
          <h2>{copy.officialTitle}</h2>
        </div>
        <div className="section-copy">
          <p>{copy.officialText}</p>
          <Link className="text-link" to="/programa">
            {copy.programmeStatus} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section section--cards">
        <div className="section-heading section-heading--compact">
          <p className="eyebrow">{copy.updatesEyebrow}</p>
          <h2>{copy.updatesTitle}</h2>
        </div>

        <div className="editorial-grid">
          {copy.updates.map((item) => (
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
          <img src="/cartaz_v2.jpg" alt={copy.posterAlt} />
        </div>

        <div className="archive-teaser__content">
          <p className="eyebrow">{copy.archive}</p>
          <h2>{copy.archiveTitle}</h2>
          <p>{copy.archiveText1}</p>
          <p>{copy.archiveText2}</p>
          <Link className="button button--outline" to="/2025">
            {copy.explore2025}
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
            <p>{copy.congressDateLabel}</p>
          </div>
          <div className="venue-panel venue-panel--cream">
            <p className="eyebrow">{copy.venueLocal}</p>
            <h3>{copy.venueTitle}</h3>
            <p>{copy.venueText}</p>
            <Link className="text-link" to="/coimbra">
              {copy.prepareVisit} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Home;
