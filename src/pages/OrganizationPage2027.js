import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import '../recoveredContent.css';

const tx = (en, english, portuguese) => (en ? english : portuguese);

const organisingCommittee2027 = [
  'Tiago Araújo',
  'Tiago Patrão',
  'Ana Carolina Gomes',
  'Ana Carvalho',
  'Francisca Rodrigues',
  'Paulo Matos',
  'Sandra Assunção',
  'Daniel Matos',
  'Carla Lourenço',
];

function PageHero({ eyebrow, title, lead }) {
  return (
    <section className="page-hero">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="page-hero__aside">
        <p>{lead}</p>
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, text }) {
  return (
    <div className="recovered-section__header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

function FeatureCard({ number, title, text, accent, blue }) {
  const classes = ['recovered-card'];
  if (accent) classes.push('recovered-card--accent');
  if (blue) classes.push('recovered-card--blue');

  return (
    <article className={classes.join(' ')}>
      <span className="recovered-card__number">{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default function OrganizationPage2027() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={tx(en, 'Organisation · AHD', 'Organização · AHD')}
        title={tx(en, 'Who is behind CIRC', 'Quem está por detrás do CIRC')}
        lead={tx(
          en,
          'CIRC is organised by Associação Hemisfério Disciplinado (AHD), a non-profit association created in Coimbra in 2022 around medical imaging, professional development and scientific exchange.',
          'O CIRC é organizado pela Associação Hemisfério Disciplinado (AHD), uma associação sem fins lucrativos criada em Coimbra, em 2022, em torno da imagem médica, desenvolvimento profissional e partilha científica.'
        )}
      />

      <section className="recovered-section">
        <SectionHeader
          eyebrow={tx(en, 'About us', 'Sobre nós')}
          title={tx(en, 'Knowledge, imaging and Coimbra.', 'Conhecimento, imagem e Coimbra.')}
          text={tx(
            en,
            'AHD emerged from an intergenerational group of diagnostic and therapeutic radiology professionals linked to medical imaging in Coimbra. Its purpose is broader than organising a congress: it creates platforms where knowledge circulates, disciplines meet and professional networks grow.',
            'A AHD nasceu de um grupo intergeracional de profissionais TSDT — área de Radiologia ligados à imagem médica em Coimbra. O seu propósito vai além da organização de um congresso: criar plataformas onde o conhecimento circule, as disciplinas se cruzem e novas redes profissionais possam crescer.'
          )}
        />
        <div className="recovered-grid">
          <FeatureCard
            number="01"
            title={tx(en, 'Advance medical imaging.', 'Aprofundar a imagem médica.')}
            text={tx(en, 'Promote innovation, knowledge sharing, scientific activity, research and publication.', 'Promover inovação, partilha de conhecimento, atividade científica, investigação e publicação.')}
          />
          <FeatureCard
            number="02"
            title={tx(en, 'Connect generations and disciplines.', 'Cruzar gerações e disciplinas.')}
            text={tx(en, 'Create opportunities for professionals to exchange experiences across disciplines and generations.', 'Criar oportunidades de troca de experiências entre profissionais, disciplinas e diferentes gerações.')}
          />
          <FeatureCard
            number="03"
            accent
            title={tx(en, 'Turn knowledge into experiences.', 'Transformar conhecimento em experiências.')}
            text={tx(en, 'Organise congresses, courses, seminars, exhibitions and training initiatives related to radiology and medical imaging.', 'Organizar congressos, cursos, seminários, exposições e ações de formação ligadas à Radiologia e Imagem Médica.')}
          />
        </div>
      </section>

      <section className="recovered-section recovered-section--soft">
        <SectionHeader
          eyebrow={tx(en, 'Strategic direction', 'Direção estratégica')}
          title={tx(en, 'A scientific identity with international ambition.', 'Uma identidade científica com ambição internacional.')}
          text={tx(
            en,
            'AHD positions CIRC within national and European knowledge networks, values the scientific potential of radiology services in Coimbra and connects science with the city, its economy and its heritage.',
            'A AHD posiciona o CIRC nos circuitos nacionais e europeus de conhecimento, valoriza o potencial científico dos serviços de Radiologia em Coimbra e liga a ciência à cidade, à economia local e ao património.'
          )}
        />
        <div className="recovered-pills">
          <span className="recovered-pill">CIRC · imaging scientific talks</span>
          <span className="recovered-pill">Radiologia ao Centro · Knowledge transforms lives</span>
          <span className="recovered-pill">{tx(en, 'International networks', 'Redes internacionais')}</span>
          <span className="recovered-pill">{tx(en, 'Scientific exchange', 'Intercâmbio científico')}</span>
          <span className="recovered-pill">Coimbra · {tx(en, 'city of knowledge', 'cidade do conhecimento')}</span>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow="CIRC 2027"
          title={tx(en, 'Organising Committee', 'Comissão Organizadora')}
          text={tx(
            en,
            'The CIRC 2027 Organising Committee is responsible for planning and delivering the congress, coordinating its programme, logistics, communication and participant experience.',
            'A Comissão Organizadora do CIRC 2027 assegura o planeamento e a realização do congresso, coordenando o programa, a logística, a comunicação e a experiência dos participantes.'
          )}
        />

        <div className="recovered-grid recovered-grid--two">
          <article className="recovered-card recovered-card--blue">
            <span className="recovered-card__number">2027</span>
            <h3>{tx(en, 'Organising structure confirmed', 'Estrutura organizadora confirmada')}</h3>
            <p>{tx(en, `${organisingCommittee2027.length} members currently make up the CIRC 2027 Organising Committee.`, `${organisingCommittee2027.length} elementos integram atualmente a Comissão Organizadora do CIRC 2027.`)}</p>
          </article>

          <article className="recovered-card">
            <span className="recovered-card__number">{String(organisingCommittee2027.length).padStart(2, '0')}</span>
            <h3>{tx(en, 'Organising Committee members', 'Elementos da Comissão Organizadora')}</h3>
            <ul className="archive-details__names" aria-label={tx(en, 'CIRC 2027 Organising Committee', 'Comissão Organizadora CIRC 2027')}>
              {organisingCommittee2027.map((name) => <li key={name}>{name}</li>)}
            </ul>
          </article>
        </div>

        <div className="recovered-note">
          {tx(
            en,
            'The remaining operational structures and working groups will be published as they are formally consolidated.',
            'As restantes estruturas operacionais e os grupos de trabalho serão publicados à medida que forem formalmente consolidados.'
          )}
        </div>
      </section>

      <div className="organization-signature">
        <div>
          <strong>Associação Hemisfério Disciplinado — AHD</strong>
          <span>{tx(en, 'Non-profit association · Coimbra, Portugal', 'Associação sem fins lucrativos · Coimbra, Portugal')}</span>
        </div>
        <div>
          <strong>NIF 517 072 262</strong>
          <span><Link className="text-link" to="/contactos">{tx(en, 'Contact the organisation', 'Contactar a organização')}</Link></span>
        </div>
      </div>
    </main>
  );
}
