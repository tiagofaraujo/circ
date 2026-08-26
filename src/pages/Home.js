import React from 'react';
import { Link } from 'react-router-dom';
import SocialConnect from '../components/js/SocialConnect';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const content = {
  pt: {
    updates: [
      {
        index: '01',
        eyebrow: 'Curso Pré-Congresso',
        title: 'Formação especializada',
        text: 'Um dia dedicado ao aprofundamento técnico e à atualização profissional. O tema e o programa serão divulgados após confirmação.',
        to: '/programa',
      },
      {
        index: '02',
        eyebrow: 'Programa científico',
        title: 'Conteúdos em preparação',
        text: 'Sessões, temas e oradores serão apresentados progressivamente, à medida que o programa científico for confirmado.',
        to: '/programa',
      },
      {
        index: '03',
        eyebrow: 'Participação',
        title: 'Inscrições e tarifas',
        text: 'Consulte as modalidades de participação, os valores e as condições previstas para a edição de 2027.',
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
    heroLead: 'Formação, ciência, inovação e encontro profissional no centro de Coimbra.',
    courseDate: '08 ABR',
    course: 'Curso Pré-Congresso',
    congressDate: '09—10 ABR',
    congress: 'Congresso Internacional',
    followProgramme: 'Acompanhar o programa',
    myCircLogin: 'My CIRC · Login',
    myCircLoginHint: 'Participantes e administração',
    signedIn: 'Sessão iniciada',
    revisit2025: 'Rever a edição de 2025',
    factsLabel: 'Informação principal do CIRC 2027',
    officialInfo: 'Informação oficial',
    officialTitle: 'Um evento em construção, com informação clara desde o primeiro dia.',
    officialText: 'Nesta fase, o website assume-se como ponto oficial de atualização da próxima edição. Publicamos apenas informação confirmada e assinalamos de forma transparente o que ainda está em preparação.',
    programmeStatus: 'Ver estado do programa',
    updatesEyebrow: 'Próximas atualizações',
    updatesTitle: 'Programa, participação e parcerias',
    archive: 'Arquivo · CIRC 2025',
    archiveTitle: 'Eyes on the Future.',
    archiveText1: 'A edição de 2025 colocou em destaque a Inteligência Artificial na Radiologia, a inovação tecnológica e a transição para práticas de saúde mais sustentáveis.',
    archiveText2: 'O arquivo de 2025 permanece acessível como memória do congresso e base para acompanhar a evolução do CIRC.',
    explore2025: 'Explorar CIRC 2025',
    posterAlt: 'Cartaz da edição CIRC 2025',
    venueLocal: 'Local do Congresso',
    venueTitle: 'Um congresso ligado à cidade.',
    venueText: 'O Convento São Francisco recebe o CIRC 2027 num espaço preparado para ciência, formação, exposição e encontro profissional. A informação prática sobre acessos, estadia e restauração será atualizada na página Coimbra.',
    prepareVisit: 'Preparar a visita',
  },
  en: {
    updates: [
      {
        index: '01',
        eyebrow: 'Pre-Congress Course',
        title: 'Specialised training',
        text: 'A full day focused on technical development and professional updating. The theme and programme will be published once confirmed.',
        to: '/programa',
      },
      {
        index: '02',
        eyebrow: 'Scientific programme',
        title: 'Content in preparation',
        text: 'Sessions, themes and speakers will be presented progressively as the scientific programme is confirmed.',
        to: '/programa',
      },
      {
        index: '03',
        eyebrow: 'Attendance',
        title: 'Registration and fees',
        text: 'View the participation options, fees and conditions planned for the 2027 edition.',
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
    heroLead: 'Education, science, innovation and professional exchange in the heart of Coimbra.',
    courseDate: '08 APR',
    course: 'Pre-Congress Course',
    congressDate: '09—10 APR',
    congress: 'International Congress',
    followProgramme: 'Follow the programme',
    myCircLogin: 'My CIRC · Login',
    myCircLoginHint: 'Participants and administration',
    signedIn: 'Signed in',
    revisit2025: 'Revisit the 2025 edition',
    factsLabel: 'Key CIRC 2027 information',
    officialInfo: 'Official information',
    officialTitle: 'An event in development, with clear information from the start.',
    officialText: 'At this stage, the website is the official reference point for the next edition. We publish only confirmed information and clearly identify what is still being prepared.',
    programmeStatus: 'View programme status',
    updatesEyebrow: 'Next updates',
    updatesTitle: 'Programme, attendance and partnerships',
    archive: 'Archive · CIRC 2025',
    archiveTitle: 'Eyes on the Future.',
    archiveText1: 'The 2025 edition highlighted Artificial Intelligence in Radiology, technological innovation and the transition towards more sustainable healthcare practices.',
    archiveText2: 'The 2025 archive remains available as part of the congress history and as a reference for following the evolution of CIRC.',
    explore2025: 'Explore CIRC 2025',
    posterAlt: 'Official CIRC 2025 poster',
    venueLocal: 'Congress Venue',
    venueTitle: 'A congress connected to the city.',
    venueText: 'Convento São Francisco hosts CIRC 2027 in a setting designed for science, education, exhibition and professional exchange. Practical information on access, accommodation and dining will be updated on the Coimbra page.',
    prepareVisit: 'Plan your visit',
  },
};

function Home() {
  const { language } = useLanguage();
  const { user, loading } = useAuth();
  const copy = content[language];
  const accountIdentity = user?.displayName?.trim()
    ? user.displayName.trim().split(/\s+/)[0]
    : user?.email || '';
  const accountTitle = user ? 'My CIRC' : copy.myCircLogin;
  const accountHint = loading
    ? (language === 'en' ? 'Checking session…' : 'A verificar sessão…')
    : user
      ? `${copy.signedIn} · ${accountIdentity}`
      : copy.myCircLoginHint;

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
              <Link
                className={user ? 'hero__login-link is-authenticated' : 'hero__login-link'}
                to={user ? '/conta' : '/login'}
                aria-label={`${accountTitle} — ${accountHint}`}
              >
                <span>
                  <strong>{accountTitle}</strong>
                  <small>{accountHint}</small>
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
            <span>CIRC</span>
            <p>Coimbra · Portugal</p>
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
