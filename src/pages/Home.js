import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SocialConnect from '../components/js/SocialConnect';
import { useLanguage } from '../context/LanguageContext';

const content = {
  pt: {
    updates: [
      {
        index: '01',
        eyebrow: '2 Cursos Pré-Congresso',
        title: 'Manhã + tarde no dia 8',
        text: 'Dois cursos independentes no dia 8 de abril: um de manhã e outro à tarde. Os temas e programas serão divulgados após confirmação.',
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
    course: '2 Cursos Pré-Congresso · Manhã + Tarde',
    congressDate: '09—10 ABR',
    congress: 'Congresso Internacional',
    followProgramme: 'Acompanhar o programa',
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
    venueText: 'O Convento São Francisco recebe o Congresso Internacional CIRC 2027 nos dias 9 e 10 de abril. A informação sobre os locais dos dois Cursos Pré-Congresso do dia 8, bem como acessos, estadia e restauração, será atualizada na página Coimbra.',
    venuePhotoAlt: 'Exterior do Convento São Francisco, em Coimbra',
    prepareVisit: 'Preparar a visita',
  },
  en: {
    updates: [
      {
        index: '01',
        eyebrow: '2 Pre-Congress Courses',
        title: 'Morning + afternoon on 8 April',
        text: 'Two independent courses on 8 April: one in the morning and one in the afternoon. Themes and programmes will be published once confirmed.',
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
    course: '2 Pre-Congress Courses · Morning + Afternoon',
    congressDate: '09—10 APR',
    congress: 'International Congress',
    followProgramme: 'Follow the programme',
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
    venueText: 'Convento São Francisco hosts the CIRC 2027 International Congress on 9 and 10 April. Information about the venues for the two Pre-Congress Courses on 8 April, as well as access, accommodation and dining, will be updated on the Coimbra page.',
    venuePhotoAlt: 'Exterior of Convento São Francisco in Coimbra',
    prepareVisit: 'Plan your visit',
  },
};

const heroSlides = [
  {
    src: '/circ2025/hero-auditorium.webp',
    position: 'auditorium',
  },
  {
    src: '/circ2025/venue-auditorium.webp',
    position: 'audience',
  },
  {
    src: '/exhibition/exhibition-16.jpg',
    position: 'exhibition',
  },
];

function Home() {
  const { language } = useLanguage();
  const copy = content[language];
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reducedMotion.matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % heroSlides.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main>
      <section className="hero hero--official hero--without-artwork" id="save-the-date">
        <div className="hero__slideshow" aria-hidden="true">
          {heroSlides.map((slide, index) => (
            <img
              className={`hero__slide hero__slide--${slide.position}${index === activeSlide ? ' is-active' : ''}`}
              src={slide.src}
              alt=""
              fetchPriority={index === 0 ? 'high' : 'auto'}
              key={slide.src}
            />
          ))}
        </div>

        <div className="hero__slide-progress" aria-hidden="true">
          {heroSlides.map((slide, index) => (
            <span className={index === activeSlide ? 'is-active' : ''} key={slide.src} />
          ))}
        </div>

        <div className="hero__copy">
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h1>
            CIRC
            <span>2027</span>
          </h1>
          <p className="hero__lead">{copy.heroLead}</p>

          <div className="hero__date-grid" aria-label={copy.factsLabel}>
            <Link
              className="hero__date-card"
              to="/programa"
              aria-label={`${copy.courseDate} — ${copy.course}`}
            >
              <time className="hero__date" dateTime="2027-04-08">
                <span>08</span>
                <small>{language === 'en' ? 'APR' : 'ABR'}</small>
              </time>
              <span className="hero__date-rule" aria-hidden="true" />
              <strong>{copy.course}</strong>
              <span className="hero__date-arrow" aria-hidden="true">↗</span>
            </Link>

            <Link
              className="hero__date-card"
              to="/programa"
              aria-label={`${copy.congressDate} — ${copy.congress}`}
            >
              <time className="hero__date hero__date--range" dateTime="2027-04-09">
                <span>09—10</span>
                <small>{language === 'en' ? 'APR' : 'ABR'}</small>
              </time>
              <span className="hero__date-rule" aria-hidden="true" />
              <strong>{copy.congress}</strong>
              <span className="hero__date-arrow" aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="hero__actions">
            <Link className="button button--dark" to="/programa">
              {copy.followProgramme}
            </Link>
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
          <div className="venue-panel venue-panel--photo" role="img" aria-label={copy.venuePhotoAlt}>
            <div className="venue-panel__photo-caption">
              <span>Convento São Francisco</span>
              <p>Coimbra · Portugal</p>
            </div>
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
