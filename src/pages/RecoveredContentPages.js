import React from 'react';
import { Link } from 'react-router-dom';
import ContactForm from '../components/js/ContactForm';
import { useLanguage } from '../context/LanguageContext';
import '../recoveredContent.css';

const tx = (en, english, portuguese) => (en ? english : portuguese);

function PageHero({ eyebrow, title, lead, status }) {
  return (
    <section className="page-hero">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="page-hero__aside">
        {status ? <span className="status-chip">{status}</span> : null}
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

const organisingCommission2025 = [
  'Alda Pinto', 'Bruno Esteves', 'Carla Solano', 'Elza Santos', 'Daniel Matos',
  'Marta Rosa', 'Tiago Patrão', 'Tiago Araújo', 'Paula Marques',
];

const scientificCommission2025 = [
  'Adélia Santos', 'Adriana Baeta', 'Alda Pinto', 'Ana Carvalho', 'Ana Cruz', 'Ana Leitão',
  'Anabela Teixeira', 'Bruno Esteves', 'Carla Lourenço', 'Carla Solano', 'Carlos Nujo',
  'Carolina Gomes', 'Daniel Matos', 'Diana Carvalho', 'Elisabete Freixo', 'Elza Santos',
  'Filipa Martins', 'Filipa Pires', 'Gracinda Valente', 'Inês Santos', 'Inês Rodrigues',
  'Isabel Dias', 'Lucília Santos', 'Magda Malva', 'Marta Rosa', 'Monica Martins',
  'Nuno Rodrigues', 'Paula Marques', 'Paulo Matos', 'Patrícia Veludo', 'Ricardo Leal',
  'Sandra Rodrigues', 'Sara Silva', 'Sónia Oliveira', 'Teresa Fátima', 'Tiago Araújo', 'Tiago Patrão',
];

const technicalCommission2025 = [
  'Adriana Baeta', 'Alda Pinto', 'Bruno Esteves', 'Carla Solano', 'Carolina Gomes', 'Daniel Matos',
  'Elisabete Freixo', 'Elza Santo', 'Fátima Santos', 'Filipa Martins', 'Francisca Rodrigues',
  'Joana Almeida', 'Marta Rosa', 'Paula Marques', 'Sandra Assunção', 'Sandra Folhas',
  'Tiago Araújo', 'Tiago Patrão',
];

const historicStayNetwork = [
  'Penedo da Saudade Suites e Hostel', 'Seminário Maior', 'Hotel Ibis Coimbra Centro',
  'Hotel Astória', 'Hotel Oslo Coimbra', 'Zero Box Lodge', 'Pousada de Juventude de Coimbra',
  'Restaurante No Tacho', 'Spaghetti Notte',
];

export function OrganizationPage() {
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
          <FeatureCard number="01" title={tx(en, 'Advance medical imaging.', 'Aprofundar a imagem médica.')} text={tx(en, 'Promote innovation, knowledge sharing, scientific activity, research and publication.', 'Promover inovação, partilha de conhecimento, atividade científica, investigação e publicação.')} />
          <FeatureCard number="02" title={tx(en, 'Connect generations and disciplines.', 'Cruzar gerações e disciplinas.')} text={tx(en, 'Create opportunities for professionals to exchange experiences across disciplines and generations.', 'Criar oportunidades de troca de experiências entre profissionais, disciplinas e diferentes gerações.')} />
          <FeatureCard number="03" accent title={tx(en, 'Turn knowledge into experiences.', 'Transformar conhecimento em experiências.')} text={tx(en, 'Organise congresses, courses, seminars, exhibitions and training initiatives related to radiology and medical imaging.', 'Organizar congressos, cursos, seminários, exposições e ações de formação ligadas à Radiologia e Imagem Médica.')} />
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
          title={tx(en, 'Organisation designed to evolve.', 'Uma organização preparada para evoluir.')}
          text={tx(
            en,
            'The organising and scientific structures for CIRC 2027 will be published after formal confirmation. Historical commissions remain in the CIRC 2025 archive and do not automatically carry over to 2027.',
            'As estruturas organizadora e científica do CIRC 2027 serão publicadas após confirmação formal. As comissões históricas permanecem no arquivo CIRC 2025 e não transitam automaticamente para 2027.'
          )}
        />
        <div className="recovered-grid recovered-grid--two">
          <FeatureCard number="2027" blue title={tx(en, 'Organising Committee', 'Comissão Organizadora')} text={tx(en, 'Composition and responsibilities will be published as each area is formally confirmed.', 'A composição e responsabilidades serão publicadas à medida que cada área seja formalmente confirmada.')} />
          <FeatureCard number="2027" title={tx(en, 'Scientific Committee', 'Comissão Científica')} text={tx(en, 'The final structure will be aligned with the scientific programme, speakers and submission process.', 'A estrutura final será articulada com o programa científico, oradores e processo de submissão de trabalhos.')} />
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

export function EnhancedPartnersPage() {
  const { language } = useLanguage();
  const en = language === 'en';
  const sectors = en
    ? ['Imaging systems', 'Interventional devices', 'Contrast media', 'Digital transformation', 'Consulting', 'Training', 'Consumables', 'Service innovation']
    : ['Equipamentos de imagem', 'Material de intervenção', 'Meios de contraste', 'Transformação digital', 'Consultoria', 'Formação', 'Consumíveis', 'Inovação de serviços'];
  const exhibitionText = tx(
    en,
    'The Medical Radiology Exhibition is conceived as a natural extension of the congress: a space where professionals, companies and institutions meet, present innovation and build useful relationships around radiology services of the 21st century.',
    'A Medical Radiology Exhibition é pensada como extensão natural do congresso: um espaço onde profissionais, empresas e instituições se encontram, apresentam inovação e constroem relações úteis em torno dos serviços de Radiologia do século XXI.'
  );

  return (
    <main className="page">
      <PageHero
        eyebrow={tx(en, 'Partners', 'Parcerias')}
        title={tx(en, 'Science meets industry', 'A ciência encontra a indústria')}
        status={tx(en, 'Commercial proposal in preparation', 'Proposta comercial em preparação')}
        lead={tx(en, 'CIRC 2027 is designed as a scientific congress and a professional meeting point for institutions, industry and the medical imaging ecosystem.', 'O CIRC 2027 é desenhado como congresso científico e ponto de encontro profissional entre instituições, indústria e todo o ecossistema da imagem médica.')}
      />

      <section className="recovered-feature">
        <div className="recovered-feature__mark">
          <span>{tx(en, 'Concept evolved from CIRC 2025', 'Conceito evoluído do CIRC 2025')}</span>
          <strong>MRE</strong>
        </div>
        <div className="recovered-feature__copy">
          <p className="eyebrow">Medical Radiology Exhibition</p>
          <h2>{tx(en, 'More than a row of stands.', 'Mais do que uma zona de stands.')}</h2>
          <p>{exhibitionText}</p>
          <div className="recovered-pills">
            {sectors.map((sector) => <span className="recovered-pill" key={sector}>{sector}</span>)}
          </div>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow={tx(en, 'CIRC 2027 partnership model', 'Modelo de parceria CIRC 2027')}
          title={tx(en, 'Visibility with purpose.', 'Visibilidade com propósito.')}
          text={tx(en, 'Partners should be integrated into the participant experience, not treated as a separate commercial layer.', 'Os parceiros devem estar integrados na experiência do participante e não funcionar como uma camada comercial separada.')}
        />
        <div className="recovered-grid">
          <FeatureCard number="01" title={tx(en, 'Scientific proximity', 'Proximidade científica')} text={tx(en, 'An environment where innovation is discussed by the professionals who use it every day.', 'Um ambiente onde a inovação é discutida pelos profissionais que a utilizam diariamente.')} />
          <FeatureCard number="02" title={tx(en, 'Business and networking', 'Negócio e networking')} text={tx(en, 'Opportunities to receive guests, demonstrate solutions and create professional relationships.', 'Oportunidades para receber convidados, demonstrar soluções e criar relações profissionais.')} />
          <FeatureCard number="03" accent title={tx(en, 'Coimbra connection', 'Ligação a Coimbra')} text={tx(en, 'A congress that intentionally connects medical imaging with Coimbra and its knowledge economy.', 'Um congresso que liga deliberadamente a imagem médica a Coimbra e à sua economia do conhecimento.')} />
        </div>
        <div className="recovered-note">{tx(en, 'Prices, sponsorship levels and stand conditions from CIRC 2025 are historical and will not be reused. The CIRC 2027 dossier will only be published after formal approval.', 'Preços, níveis de patrocínio e condições de stands do CIRC 2025 são históricos e não serão reutilizados. O dossier CIRC 2027 será publicado apenas após aprovação formal.')}</div>
      </section>

      <section className="callout">
        <div>
          <p className="eyebrow">Medical Radiology Exhibition · CIRC 2027</p>
          <h2>{tx(en, 'Interested in becoming a partner?', 'Interessado em ser parceiro?')}</h2>
          <p>{tx(en, 'The organisation is preparing the commercial and exhibition framework.', 'A organização está a preparar o enquadramento comercial e da exposição.')}</p>
        </div>
        <Link className="button button--dark" to="/contactos">{tx(en, 'Contact CIRC', 'Contactar CIRC')}</Link>
      </section>

      <section className="support-strip support-strip--page">
        <div className="municipal-support">
          <span>{tx(en, 'With the support of', 'Com apoio de')}</span>
          <img src="/cmc-logo-monochrome.png" alt="Câmara Municipal de Coimbra" />
        </div>
      </section>
    </main>
  );
}

export function EnhancedCoimbraPage() {
  const { language } = useLanguage();
  const en = language === 'en';
  const historicList = historicStayNetwork.join(', ');

  return (
    <main className="page">
      <PageHero
        eyebrow="Coimbra"
        title={tx(en, 'Venue, stay and city', 'Local, estadia e cidade')}
        status={tx(en, 'Practical information being updated', 'Informação prática em atualização')}
        lead={tx(en, 'CIRC 2027 takes place from 8 to 10 April. The congress on 9 and 10 April is confirmed at Convento São Francisco; the specific venue for the Pre-Congress Course on 8 April will be announced after confirmation.', 'O CIRC 2027 decorre entre 8 e 10 de abril. O congresso de 9 e 10 de abril está confirmado no Convento São Francisco; o local específico do Curso Pré-Congresso de 8 de abril será divulgado após confirmação.')}
      />

      <section className="venue-feature venue-feature--2027">
        <div className="venue-feature__date">
          <span className="venue-feature__course">08</span>
          <span>09—10</span>
          <small>{tx(en, 'APR · 2027', 'ABR · 2027')}</small>
        </div>
        <div className="venue-feature__copy">
          <p className="eyebrow">Venue</p>
          <h2>Convento São Francisco</h2>
          <p>Coimbra · Portugal</p>
          <p>{tx(en, 'Main venue for the International Congress on 9 and 10 April 2027.', 'Local principal do Congresso Internacional nos dias 9 e 10 de abril de 2027.')}</p>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow={tx(en, 'Participant journey', 'Percurso do participante')}
          title={tx(en, 'Arrive. Stay. Experience Coimbra.', 'Chegar. Ficar. Viver Coimbra.')}
          text={tx(en, 'Accommodation and restaurants remain part of the congress experience. For 2027, only reconfirmed conditions will be presented as official CIRC partnerships.', 'Alojamento e restauração continuam a fazer parte da experiência do congresso. Em 2027, apenas condições reconfirmadas serão apresentadas como parcerias oficiais CIRC.')}
        />
        <div className="recovered-grid">
          <FeatureCard number="01" title={tx(en, 'Getting here', 'Como chegar')} text={tx(en, 'Transport, access, parking and practical arrival information will be organised here before the congress.', 'Transportes, acessos, estacionamento e informação prática de chegada serão organizados aqui antes do congresso.')} />
          <FeatureCard number="02" title={tx(en, 'Where to stay', 'Onde ficar')} text={tx(en, 'Hotels and accommodation with confirmed 2027 conditions will be clearly identified.', 'Hotéis e alojamentos com condições confirmadas para 2027 serão claramente identificados.')} />
          <FeatureCard number="03" accent title={tx(en, 'Experience the city', 'Viver a cidade')} text={tx(en, 'Restaurants, cultural references and selected city information will help participants make the most of Coimbra.', 'Restauração, referências culturais e informação selecionada da cidade ajudarão os participantes a aproveitar Coimbra.')} />
        </div>
        <div className="historic-network">
          <h3>{tx(en, 'Historical 2025 network', 'Rede histórica de 2025')}</h3>
          <p>{tx(en, `The previous website included ${historicList}. All 2025 discounts, codes and commercial conditions are expired and will only return if reconfirmed for 2027.`, `O website anterior incluía ${historicList}. Todos os descontos, códigos e condições comerciais de 2025 estão expirados e só voltarão a ser apresentados se forem reconfirmados para 2027.`)}</p>
        </div>
      </section>
    </main>
  );
}

function CommissionBlock({ en, titlePt, titleEn, names, notePt, noteEn }) {
  return (
    <details>
      <summary><span>{tx(en, titleEn, titlePt)}</span><span>{names.length}</span></summary>
      <div className="archive-details__content">
        <p>{tx(en, noteEn, notePt)}</p>
        <ul className="archive-details__names">{names.map((name) => <li key={name}>{name}</li>)}</ul>
      </div>
    </details>
  );
}

export function EnhancedArchive2025Page() {
  const { language } = useLanguage();
  const en = language === 'en';
  const exhibitionText = tx(en, 'The 2025 website described the exhibition as an inseparable dimension of CIRC: a commercial and networking area for equipment, intervention, contrast media, digital transformation, consulting, training and other services relevant to modern radiology departments.', 'O website de 2025 apresentava a exposição como uma dimensão indissociável do CIRC: uma área comercial e de networking para equipamentos, intervenção, meios de contraste, transformação digital, consultoria, formação e outros serviços relevantes para os modernos departamentos de Radiologia.');

  return (
    <main className="page">
      <PageHero
        eyebrow={tx(en, 'Historical archive', 'Arquivo histórico')}
        title="CIRC 2025"
        status={tx(en, '2nd edition · completed', '2.ª edição · concluída')}
        lead={tx(en, 'The global CIRC 2025 programme ran from 3 to 5 April in Coimbra, with the congress on 4 and 5 April at Convento São Francisco. This archive preserves relevant content from the previous website without mixing it with CIRC 2027 information.', 'O programa global do CIRC 2025 decorreu de 3 a 5 de abril, em Coimbra, com o congresso nos dias 4 e 5 no Convento São Francisco. Este arquivo preserva conteúdos relevantes do website anterior sem os misturar com a informação do CIRC 2027.')}
      />

      <section className="archive-page">
        <div className="archive-page__image"><img src="/cartaz_v2.jpg" alt={tx(en, 'Official CIRC 2025 poster', 'Cartaz oficial CIRC 2025')} /></div>
        <div className="archive-page__copy">
          <p className="eyebrow">Eyes on the Future</p>
          <h2>{tx(en, 'The future was already part of the programme.', 'O futuro já fazia parte do programa.')}</h2>
          <p>{tx(en, 'The second edition explored artificial intelligence in radiology, technological transformation, clinical practice, environmental sustainability and the role of imaging services in a rapidly changing health system.', 'A segunda edição explorou Inteligência Artificial aplicada à Radiologia, transformação tecnológica, prática clínica, sustentabilidade ambiental e o papel dos serviços de imagem num sistema de saúde em rápida mudança.')}</p>
          <p>{tx(en, 'Its editorial positioning also emphasised internationalisation, professional responsibility and the need to turn uncertainty into learning and adaptation.', 'O posicionamento editorial reforçava também a internacionalização, a responsabilidade profissional e a necessidade de transformar a incerteza em aprendizagem e adaptação.')}</p>
          <div className="archive-tags">
            <span>{tx(en, 'Artificial Intelligence', 'Inteligência Artificial')}</span><span>{tx(en, 'Sustainability', 'Sustentabilidade')}</span><span>{tx(en, 'Medical Imaging', 'Imagem Médica')}</span><span>{tx(en, 'Innovation', 'Inovação')}</span><span>{tx(en, 'Internationalisation', 'Internacionalização')}</span>
          </div>
        </div>
      </section>

      <section className="recovered-feature">
        <div className="recovered-feature__mark"><span>CIRC 2025</span><strong>MRE</strong></div>
        <div className="recovered-feature__copy">
          <p className="eyebrow">Medical Radiology Exhibition</p>
          <h2>{tx(en, 'A congress connected to the imaging ecosystem.', 'Um congresso ligado ao ecossistema da imagem.')}</h2>
          <p>{exhibitionText}</p>
        </div>
      </section>

      <div className="archive-metrics">
        <div className="archive-metric"><strong>972</strong><span>{tx(en, 'photographs referenced in the former digital gallery', 'fotografias referenciadas na antiga galeria digital')}</span></div>
        <div className="archive-metric"><strong>3</strong><span>{tx(en, 'historical commission structures preserved', 'estruturas de comissões históricas preservadas')}</span></div>
        <div className="archive-metric"><strong>4</strong><span>{tx(en, 'partnership categories used in the former website', 'categorias de parceria usadas no website anterior')}</span></div>
        <div className="archive-metric"><strong>3—5</strong><span>{tx(en, 'April 2025 · global programme', 'abril 2025 · programa global')}</span></div>
      </div>

      <section className="recovered-section">
        <SectionHeader eyebrow={tx(en, 'People who built the edition', 'Pessoas que construíram a edição')} title={tx(en, 'Historical commissions · CIRC 2025', 'Comissões históricas · CIRC 2025')} text={tx(en, 'These names are preserved as a historical record and do not represent the composition of CIRC 2027.', 'Estes nomes são preservados como registo histórico e não representam a composição do CIRC 2027.')} />
        <div className="archive-details">
          <CommissionBlock en={en} titlePt="Comissão Organizadora" titleEn="Organising Committee" names={organisingCommission2025} notePt="O website anterior identificava estes elementos como estrutura organizadora do CIRC 2025." noteEn="The former website identified these members as the CIRC 2025 organising structure." />
          <CommissionBlock en={en} titlePt="Comissão Científica" titleEn="Scientific Committee" names={scientificCommission2025} notePt="Lista histórica de profissionais da ULS Coimbra e de outras instituições." noteEn="Historical list including professionals from ULS Coimbra and other institutions." />
          <CommissionBlock en={en} titlePt="Comissões Técnicas" titleEn="Technical Committees" names={technicalCommission2025} notePt="Estrutura histórica de apoio técnico do CIRC 2025." noteEn="Historical technical support structure from CIRC 2025." />
        </div>
      </section>

      <section className="recovered-section recovered-section--soft">
        <SectionHeader eyebrow={tx(en, 'Partnership legacy', 'Legado de parcerias')} title={tx(en, 'Institutional, scientific, commercial and community links.', 'Ligações institucionais, científicas, comerciais e à comunidade.')} text={tx(en, 'The former website organised the CIRC 2025 network into institutional, scientific, commercial and other partnerships. This remains a useful model, while 2027 logos and statuses will only be published after confirmation.', 'O website anterior organizava a rede CIRC 2025 em parcerias institucionais, científicas, comerciais e outras parcerias. Este modelo continua útil, mas os logótipos e estatutos de 2027 só serão publicados após confirmação.')} />
      </section>
    </main>
  );
}

export function EnhancedContactPage() {
  const { language } = useLanguage();
  const en = language === 'en';
  const topics = en
    ? [['Registration', 'Participant account, registration and attendance questions.'], ['Scientific programme', 'Programme, speakers, submissions and scientific content.'], ['Partnerships & Exhibition', 'Sponsorship, stands and Medical Radiology Exhibition.'], ['Coimbra', 'Venue, accommodation and practical participant information.']]
    : [['Inscrições', 'Área de participante, inscrição e questões de participação.'], ['Programa científico', 'Programa, oradores, submissões e conteúdos científicos.'], ['Parcerias & Exhibition', 'Patrocínio, stands e Medical Radiology Exhibition.'], ['Coimbra', 'Local, alojamento e informação prática para participantes.']];

  return (
    <main className="page">
      <PageHero eyebrow={tx(en, 'Contact', 'Contactos')} title={tx(en, 'One contact point. The right team.', 'Um contacto. A equipa certa.')} lead={tx(en, 'The new website keeps the operational logic of the former contact structure while simplifying the experience: send one message and the organisation routes it internally.', 'O novo website preserva a lógica operacional dos contactos anteriores, mas simplifica a experiência: envie uma única mensagem e a organização encaminha-a internamente.')} />

      <div className="contact-topic-grid">
        {topics.map(([title, text]) => <div className="contact-topic" key={title}><strong>{title}</strong><span>{text}</span></div>)}
      </div>

      <section className="contact-layout recovered-section">
        <div>
          <p className="eyebrow">CIRC 2027</p>
          <h2>{tx(en, 'Tell us what you need.', 'Diga-nos do que precisa.')}</h2>
          <p>{tx(en, '8–10 April 2027 · Coimbra', '8–10 abril 2027 · Coimbra')}</p>
          <p>{tx(en, '8 April · Pre-Congress Course · 9–10 April · International Congress', '8 abril · Curso Pré-Congresso · 9–10 abril · Congresso Internacional')}</p>
          <p className="contact-layout__note">{tx(en, 'When confirmed information is already available on the programme, participation, partnerships or Coimbra pages, those pages remain the official reference.', 'Quando já exista informação confirmada nas páginas Programa, Participar, Parcerias ou Coimbra, essas páginas mantêm-se como referência oficial.')}</p>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}
