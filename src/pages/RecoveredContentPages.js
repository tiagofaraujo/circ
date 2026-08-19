import React from 'react';
import { Link } from 'react-router-dom';
import ContactForm from '../components/js/ContactForm';
import { useLanguage } from '../context/LanguageContext';
import '../recoveredContent.css';

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

function SectionHeader({ eyebrow, title, text }) {
  return (
    <div className="recovered-section__header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

const organisingCommission2025 = [
  'Alda Pinto',
  'Bruno Esteves',
  'Carla Solano',
  'Elza Santos',
  'Daniel Matos',
  'Marta Rosa',
  'Tiago Patrão',
  'Tiago Araújo',
  'Paula Marques',
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
  'Penedo da Saudade Suites e Hostel',
  'Seminário Maior',
  'Hotel Ibis Coimbra Centro',
  'Hotel Astória',
  'Hotel Oslo Coimbra',
  'Zero Box Lodge',
  'Pousada de Juventude de Coimbra',
  'Restaurante No Tacho',
  'Spaghetti Notte',
];

export function OrganizationPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Organisation · AHD' : 'Organização · AHD'}
        title={en ? 'Who is behind CIRC' : 'Quem está por detrás do CIRC'}
        lead={
          en
            ? 'CIRC is organised by Associação Hemisfério Disciplinado (AHD), a non-profit association created in Coimbra in 2022 around medical imaging, professional development and scientific exchange.'
            : 'O CIRC é organizado pela Associação Hemisfério Disciplinado (AHD), uma associação sem fins lucrativos criada em Coimbra, em 2022, em torno da imagem médica, desenvolvimento profissional e partilha científica.'
        }
      />

      <section className="recovered-section">
        <SectionHeader
          eyebrow={en ? 'About us' : 'Sobre nós'}
          title={en ? 'Knowledge, imaging and Coimbra.' : 'Conhecimento, imagem e Coimbra.'}
          text={
            en
              ? 'AHD emerged from an intergenerational group of diagnostic and therapeutic radiology professionals linked to the Medical Imaging Service in Coimbra. Its purpose is broader than organising a congress: it is to create platforms where knowledge can circulate, disciplines can meet and new professional networks can grow.'
              : 'A AHD nasceu de um grupo intergeracional de profissionais da carreira de TSDT — área de Radiologia ligados ao Serviço de Imagem Médica em Coimbra. O seu propósito vai além da organização de um congresso: criar plataformas onde o conhecimento circule, as disciplinas se cruzem e novas redes profissionais possam crescer.'
          }
        />

        <div className="recovered-grid">
          <article className="recovered-card">
            <span className="recovered-card__number">01</span>
            <p className="eyebrow">{en ? 'Knowledge' : 'Conhecimento'}</p>
            <h3>{en ? 'Advance medical imaging.' : 'Aprofundar a imagem médica.'}</h3>
            <p>{en ? 'Promote innovation, dissemination of knowledge, scientific activity and publication.' : 'Promover inovação, divulgação de conhecimento, atividade científica, investigação e publicação.'}</p>
          </article>
          <article className="recovered-card">
            <span className="recovered-card__number">02</span>
            <p className="eyebrow">{en ? 'People' : 'Pessoas'}</p>
            <h3>{en ? 'Connect generations and disciplines.' : 'Cruzar gerações e disciplinas.'}</h3>
            <p>{en ? 'Create opportunities for professionals to exchange experiences and learn across disciplines and generations.' : 'Criar oportunidades de troca de experiências entre profissionais, disciplinas e diferentes gerações.'}</p>
          </article>
          <article className="recovered-card recovered-card--accent">
            <span className="recovered-card__number">03</span>
            <p className="eyebrow">{en ? 'Action' : 'Ação'}</p>
            <h3>{en ? 'Turn knowledge into experiences.' : 'Transformar conhecimento em experiências.'}</h3>
            <p>{en ? 'Organise congresses, courses, seminars, exhibitions and training initiatives related to radiology and medical imaging.' : 'Organizar congressos, cursos, seminários, exposições e ações de formação ligadas à Radiologia e Imagem Médica.'}</p>
          </article>
        </div>
      </section>

      <section className="recovered-section recovered-section--soft">
        <SectionHeader
          eyebrow={en ? 'Strategic direction' : 'Direção estratégica'}
          title={en ? 'Build a scientific identity with international ambition.' : 'Construir uma identidade científica com ambição internacional.'}
          text={
            en
              ? 'The original AHD objectives already positioned CIRC as a project designed to enter national and European knowledge circuits, highlight the scientific potential of public radiology services in Coimbra and connect science with the city, its economy and its heritage.'
              : 'Os objetivos fundadores da AHD já posicionavam o CIRC como um projeto pensado para integrar circuitos nacionais e europeus de conhecimento, valorizar o potencial científico dos serviços públicos de Radiologia em Coimbra e ligar a ciência à cidade, à economia local e ao património.'
          }
        />
        <div className="recovered-pills">
          <span className="recovered-pill">CIRC · imaging scientific talks</span>
          <span className="recovered-pill">Radiologia ao Centro · Knowledge transforms lives</span>
          <span className="recovered-pill">{en ? 'International networks' : 'Redes internacionais'}</span>
          <span className="recovered-pill">{en ? 'Scientific exchange' : 'Intercâmbio científico'}</span>
          <span className="recovered-pill">Coimbra · {en ? 'city of knowledge' : 'cidade do conhecimento'}</span>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow="CIRC 2027"
          title={en ? 'Organisation designed to evolve.' : 'Uma organização preparada para evoluir.'}
          text={
            en
              ? 'The organising and scientific structures for CIRC 2027 will be published once their final composition is formally confirmed. Historical commission lists remain preserved in the CIRC 2025 archive and are not automatically carried forward to 2027.'
              : 'As estruturas organizadora e científica do CIRC 2027 serão publicadas quando a respetiva composição estiver formalmente confirmada. As comissões históricas permanecem preservadas no arquivo CIRC 2025 e não transitam automaticamente para 2027.'
          }
        />
        <div className="recovered-grid recovered-grid--two">
          <article className="recovered-card recovered-card--blue">
            <span className="recovered-card__number">2027</span>
            <p className="eyebrow">{en ? 'Organising Committee' : 'Comissão Organizadora'}</p>
            <h3>{en ? 'Composition to be published.' : 'Composição a publicar.'}</h3>
            <p>{en ? 'Responsibilities and confirmed members will appear here as the organisation closes each area.' : 'Responsabilidades e elementos confirmados serão publicados à medida que a organização fecha cada área.'}</p>
          </article>
          <article className="recovered-card">
            <span className="recovered-card__number">2027</span>
            <p className="eyebrow">{en ? 'Scientific Committee' : 'Comissão Científica'}</p>
            <h3>{en ? 'Scientific governance in preparation.' : 'Governação científica em preparação.'}</h3>
            <p>{en ? 'The final committee will be aligned with the scientific programme, speakers and submission process.' : 'A comissão final será articulada com o programa científico, oradores e processo de submissão de trabalhos.'}</p>
          </article>
        </div>
      </section>

      <div className="organization-signature">
        <div>
          <strong>Associação Hemisfério Disciplinado — AHD</strong>
          <span>{en ? 'Non-profit association · Coimbra, Portugal' : 'Associação sem fins lucrativos · Coimbra, Portugal'}</span>
        </div>
        <div>
          <strong>NIF 517 072 262</strong>
          <span><Link className="text-link" to="/contactos">{en ? 'Contact the organisation' : 'Contactar a organização'}</Link></span>
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

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Partners' : 'Parcerias'}
        title={en ? 'Science meets industry' : 'A ciência encontra a indústria'}
        status={en ? 'Commercial proposal in preparation' : 'Proposta comercial em preparação'}
        lead={
          en
            ? 'CIRC 2027 is being designed as a scientific congress and a professional meeting point for institutions, industry and the medical imaging ecosystem.'
            : 'O CIRC 2027 está a ser desenhado como congresso científico e ponto de encontro profissional entre instituições, indústria e todo o ecossistema da imagem médica.'
        }
      />

      <section className="recovered-feature">
        <div className="recovered-feature__mark">
          <span>{en ? 'Concept recovered from CIRC 2025' : 'Conceito recuperado do CIRC 2025'}</span>
          <strong>MRE</strong>
        </div>
        <div className="recovered-feature__copy">
          <p className="eyebrow">Medical Radiology Exhibition</p>
          <h2>{en ? 'More than a row of stands.' : 'Mais do que uma zona de stands.'}</h2>
          <p>
            {en
              ? 'The original Medical Radiology Exhibition was conceived as an extension of the congress: a space where professionals, companies and institutions can meet, present innovation and build useful relationships around radiology services of the 21st century.'
              : 'A Medical Radiology Exhibition foi originalmente pensada como extensão natural do congresso: um espaço onde profissionais, empresas e instituições se encontram, apresentam inovação e constroem relações úteis em torno dos serviços de Radiologia do século XXI.'
          </p>
          <div className="recovered-pills">
            {sectors.map((sector) => <span className="recovered-pill" key={sector}>{sector}</span>)}
          </div>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow={en ? 'CIRC 2027 partnership model' : 'Modelo de parceria CIRC 2027'}
          title={en ? 'Visibility with purpose.' : 'Visibilidade com propósito.'}
          text={
            en
              ? 'The 2027 model will preserve the strongest idea from the previous edition: partners should be integrated into the participant experience, not treated as a separate commercial layer.'
              : 'O modelo de 2027 preservará a ideia mais forte da edição anterior: os parceiros devem estar integrados na experiência do participante e não funcionar como uma camada comercial separada.'
          }
        />
        <div className="recovered-grid">
          <article className="recovered-card">
            <span className="recovered-card__number">01</span>
            <h3>{en ? 'Scientific proximity' : 'Proximidade científica'}</h3>
            <p>{en ? 'A congress environment where innovation can be discussed by the professionals who use it every day.' : 'Um ambiente de congresso onde a inovação pode ser discutida pelos profissionais que a utilizam diariamente.'}</p>
          </article>
          <article className="recovered-card">
            <span className="recovered-card__number">02</span>
            <h3>{en ? 'Business and networking' : 'Negócio e networking'}</h3>
            <p>{en ? 'Dedicated opportunities for companies to receive guests, demonstrate solutions and create professional relationships.' : 'Oportunidades próprias para empresas receberem convidados, demonstrarem soluções e criarem relações profissionais.'}</p>
          </article>
          <article className="recovered-card recovered-card--accent">
            <span className="recovered-card__number">03</span>
            <h3>{en ? 'Coimbra connection' : 'Ligação a Coimbra'}</h3>
            <p>{en ? 'A congress that intentionally connects medical imaging with the city and the wider knowledge economy.' : 'Um congresso que procura deliberadamente ligar a imagem médica à cidade e à sua economia do conhecimento.'}</p>
          </article>
        </div>
        <div className="recovered-note">
          {en
            ? 'Prices, sponsorship levels, stand conditions and benefits from CIRC 2025 are historical and will not be reused. The CIRC 2027 dossier will only be published after formal approval.'
            : 'Preços, níveis de patrocínio, condições de stands e contrapartidas do CIRC 2025 são históricos e não serão reutilizados. O dossier CIRC 2027 será publicado apenas após aprovação formal.'}
        </div>
      </section>

      <section className="callout">
        <div>
          <p className="eyebrow">Medical Radiology Exhibition · CIRC 2027</p>
          <h2>{en ? 'Interested in becoming a partner?' : 'Interessado em ser parceiro?'}</h2>
          <p>{en ? 'The organisation is preparing the commercial and exhibition framework.' : 'A organização está a preparar o enquadramento comercial e da exposição.'}</p>
        </div>
        <Link className="button button--dark" to="/contactos">{en ? 'Contact CIRC' : 'Contactar CIRC'}</Link>
      </section>

      <section className="support-strip support-strip--page">
        <p>{en ? 'With the support of the Municipality of Coimbra' : 'Com apoio do Município de Coimbra'}</p>
      </section>
    </main>
  );
}

export function EnhancedCoimbraPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow="Coimbra"
        title={en ? 'Venue, stay and city' : 'Local, estadia e cidade'}
        status={en ? 'Practical information being updated' : 'Informação prática em atualização'}
        lead={
          en
            ? 'CIRC 2027 takes place from 8 to 10 April. The congress on 9 and 10 April is confirmed at Convento São Francisco; the specific venue for the Pre-Congress Course on 8 April will be announced after confirmation.'
            : 'O CIRC 2027 decorre entre 8 e 10 de abril. O congresso de 9 e 10 de abril está confirmado no Convento São Francisco; o local específico do Curso Pré-Congresso de 8 de abril será divulgado após confirmação.'
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
          <p>{en ? 'Main venue for the International Congress on 9 and 10 April 2027.' : 'Local principal do Congresso Internacional nos dias 9 e 10 de abril de 2027.'}</p>
        </div>
      </section>

      <section className="recovered-section">
        <SectionHeader
          eyebrow={en ? 'Participant journey' : 'Percurso do participante'}
          title={en ? 'Arrive. Stay. Experience Coimbra.' : 'Chegar. Ficar. Viver Coimbra.'}
          text={
            en
              ? 'The previous website already treated accommodation and restaurants as part of the congress experience. For 2027, this information will return in a clearer format, with only reconfirmed conditions presented as official CIRC partnerships.'
              : 'O website anterior já tratava alojamento e restauração como parte da experiência do congresso. Em 2027, essa informação regressará num formato mais claro, apresentando como parcerias oficiais apenas condições que sejam novamente confirmadas.'
          }
        />
        <div className="recovered-grid">
          <article className="recovered-card">
            <span className="recovered-card__number">01</span>
            <h3>{en ? 'Getting here' : 'Como chegar'}</h3>
            <p>{en ? 'Transport, access, parking and practical arrival information will be organised here before the congress.' : 'Transportes, acessos, estacionamento e informação prática de chegada serão organizados aqui antes do congresso.'}</p>
          </article>
          <article className="recovered-card">
            <span className="recovered-card__number">02</span>
            <h3>{en ? 'Where to stay' : 'Onde ficar'}</h3>
            <p>{en ? 'Hotels and accommodation with confirmed 2027 conditions will be clearly identified and separated from general recommendations.' : 'Hotéis e alojamentos com condições confirmadas para 2027 serão claramente identificados e separados de recomendações gerais.'}</p>
          </article>
          <article className="recovered-card recovered-card--accent">
            <span className="recovered-card__number">03</span>
            <h3>{en ? 'Experience the city' : 'Viver a cidade'}</h3>
            <p>{en ? 'Restaurants, cultural references and selected city information will help international and national participants make the most of Coimbra.' : 'Restauração, referências culturais e informação selecionada da cidade ajudarão participantes nacionais e internacionais a aproveitar Coimbra.'}</p>
          </article>
        </div>

        <div className="historic-network">
          <h3>{en ? 'Historical 2025 network' : 'Rede histórica de 2025'}</h3>
          <p>
            {en
              ? `The previous website included specific information for ${historicStayNetwork.join(', ')}. All discounts, codes and commercial conditions from 2025 are expired and will only return if reconfirmed for 2027.`
              : `O website anterior incluía informação específica para ${historicStayNetwork.join(', ')}. Todos os descontos, códigos e condições comerciais de 2025 estão expirados e só voltarão a ser apresentados se forem reconfirmados para 2027.`}
          </p>
        </div>
      </section>
    </main>
  );
}

export function EnhancedArchive2025Page() {
  const { language } = useLanguage();
  const en = language === 'en';

  const commissionBlock = (titlePt, titleEn, names, workplaceNote) => (
    <details>
      <summary><span>{en ? titleEn : titlePt}</span><span>{names.length}</span></summary>
      <div className="archive-details__content">
        {workplaceNote && <p>{workplaceNote}</p>}
        <ul className="archive-details__names">
          {names.map((name) => <li key={name}>{name}</li>)}
        </ul>
      </div>
    </details>
  );

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Historical archive' : 'Arquivo histórico'}
        title="CIRC 2025"
        status={en ? '2nd edition · completed' : '2.ª edição · concluída'}
        lead={
          en
            ? 'The global CIRC 2025 programme ran from 3 to 5 April in Coimbra, with the congress on 4 and 5 April at Convento São Francisco. This archive recovers the strongest content from the previous website without mixing it with CIRC 2027 information.'
            : 'O programa global do CIRC 2025 decorreu de 3 a 5 de abril, em Coimbra, com o congresso nos dias 4 e 5 no Convento São Francisco. Este arquivo recupera os conteúdos mais relevantes do website anterior sem os misturar com a informação do CIRC 2027.'
        }
      />

      <section className="archive-page">
        <div className="archive-page__image">
          <img src="/cartaz_v2.jpg" alt={en ? 'Official CIRC 2025 poster' : 'Cartaz oficial CIRC 2025'} />
        </div>
        <div className="archive-page__copy">
          <p className="eyebrow">Eyes on the Future</p>
          <h2>{en ? 'The future was already part of the programme.' : 'O futuro já fazia parte do programa.'}</h2>
          <p>
            {en
              ? 'The second edition explored artificial intelligence in radiology, technological transformation, clinical practice, environmental sustainability and the role of imaging services in a health system facing rapid change.'
              : 'A segunda edição explorou Inteligência Artificial aplicada à Radiologia, transformação tecnológica, prática clínica, sustentabilidade ambiental e o papel dos serviços de imagem num sistema de saúde sujeito a mudanças rápidas.'}
          </p>
          <p>
            {en
              ? 'The original editorial positioning also emphasised internationalisation, professional responsibility and the need to turn uncertainty into an opportunity for learning and adaptation.'
              : 'O posicionamento editorial original reforçava ainda a internacionalização, a responsabilidade dos profissionais e a necessidade de transformar a incerteza em oportunidade de aprendizagem e adaptação.'}
          </p>
          <div className="archive-tags">
            <span>{en ? 'Artificial Intelligence' : 'Inteligência Artificial'}</span>
            <span>{en ? 'Sustainability' : 'Sustentabilidade'}</span>
            <span>{en ? 'Medical Imaging' : 'Imagem Médica'}</span>
            <span>{en ? 'Innovation' : 'Inovação'}</span>
            <span>{en ? 'Internationalisation' : 'Internacionalização'}</span>
          </div>
        </div>
      </section>

      <section className="recovered-feature">
        <div className="recovered-feature__mark">
          <span>CIRC 2025</span>
          <strong>MRE</strong>
        </div>
        <div className="recovered-feature__copy">
          <p className="eyebrow">Medical Radiology Exhibition</p>
          <h2>{en ? 'A congress connected to the imaging ecosystem.' : 'Um congresso ligado ao ecossistema da imagem.'}</h2>
          <p>
            {en
              ? 'The 2025 website described the exhibition as a parallel, inseparable dimension of CIRC: a commercial and networking area for equipment, intervention, contrast media, digital transformation, consulting, training and other services relevant to modern radiology departments.'
              : 'O website de 2025 apresentava a exposição como uma dimensão paralela e indissociável do CIRC: uma área comercial e de networking para equipamentos, intervenção, meios de contraste, transformação digital, consultoria, formação e outros serviços relevantes para os modernos departamentos de Radiologia.'
          </p>
        </div>
      </section>

      <div className="archive-metrics">
        <div className="archive-metric"><strong>972</strong><span>{en ? 'photographs referenced in the former digital gallery' : 'fotografias referenciadas na antiga galeria digital'}</span></div>
        <div className="archive-metric"><strong>3</strong><span>{en ? 'historical commission structures preserved' : 'estruturas de comissões históricas preservadas'}</span></div>
        <div className="archive-metric"><strong>4</strong><span>{en ? 'partnership categories used in the former website' : 'categorias de parceria usadas no website anterior'}</span></div>
        <div className="archive-metric"><strong>3—5</strong><span>{en ? 'April 2025 · global programme' : 'abril 2025 · programa global'}</span></div>
      </div>

      <section className="recovered-section">
        <SectionHeader
          eyebrow={en ? 'People who built the edition' : 'Pessoas que construíram a edição'}
          title={en ? 'Historical commissions · CIRC 2025' : 'Comissões históricas · CIRC 2025'}
          text={
            en
              ? 'These names are reproduced as a historical record from the previous website. They do not represent the composition of CIRC 2027.'
              : 'Estes nomes são reproduzidos como registo histórico do website anterior. Não representam a composição do CIRC 2027.'
          }
        />
        <div className="archive-details">
          {commissionBlock('Comissão Organizadora', 'Organising Committee', organisingCommission2025, en ? 'The former website listed all members as ULS Coimbra.' : 'O website anterior identificava todos os elementos como ULS Coimbra.')}
          {commissionBlock('Comissão Científica', 'Scientific Committee', scientificCommission2025, en ? 'The historical list included professionals from ULS Coimbra and other institutions.' : 'A lista histórica integrava profissionais da ULS Coimbra e de outras instituições.')}
          {commissionBlock('Comissões Técnicas', 'Technical Committees', technicalCommission2025, en ? 'Historical technical support structure from CIRC 2025.' : 'Estrutura histórica de apoio técnico do CIRC 2025.')}
        </div>
      </section>

      <section className="recovered-section recovered-section--soft">
        <SectionHeader
          eyebrow={en ? 'Partnership legacy' : 'Legado de parcerias'}
          title={en ? 'Institutional, scientific, commercial and community links.' : 'Ligações institucionais, científicas, comerciais e à comunidade.'}
          text={
            en
              ? 'The previous website organised the CIRC 2025 network into institutional partnerships, scientific partnerships, commercial partnerships and other partnerships. That structure is being retained as a useful model for the 2027 partner archive, while all new logos and statuses will only be published after confirmation.'
              : 'O website anterior organizava a rede CIRC 2025 em parcerias institucionais, parcerias científicas, parcerias comerciais e outras parcerias. Essa estrutura é preservada como modelo útil para o arquivo de 2027, mas novos logótipos e estatutos serão publicados apenas após confirmação.'
          }
        />
      </section>
    </main>
  );
}

export function EnhancedContactPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  const topics = en
    ? [
        ['Registration', 'Participant account, registration and attendance questions.'],
        ['Scientific programme', 'Programme, speakers, submissions and scientific content.'],
        ['Partnerships & Exhibition', 'Sponsorship, stands and Medical Radiology Exhibition.'],
        ['Coimbra', 'Venue, accommodation and practical participant information.'],
      ]
    : [
        ['Inscrições', 'Área de participante, inscrição e questões de participação.'],
        ['Programa científico', 'Programa, oradores, submissões e conteúdos científicos.'],
        ['Parcerias & Exhibition', 'Patrocínio, stands e Medical Radiology Exhibition.'],
        ['Coimbra', 'Local, alojamento e informação prática para participantes.'],
      ];

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Contact' : 'Contactos'}
        title={en ? 'One contact point. The right team.' : 'Um contacto. A equipa certa.'}
        lead={
          en
            ? 'The former website separated contacts by operational area. The new website keeps that logic while simplifying the experience: send one message and the organisation routes it internally.'
            : 'O website anterior separava os contactos por área operacional. O novo site preserva essa lógica, mas simplifica a experiência: envie uma única mensagem e a organização encaminha-a internamente.'
        }
      />

      <div className="contact-topic-grid">
        {topics.map(([title, text]) => (
          <div className="contact-topic" key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <section className="contact-layout recovered-section">
        <div>
          <p className="eyebrow">CIRC 2027</p>
          <h2>{en ? 'Tell us what you need.' : 'Diga-nos do que precisa.'}</h2>
          <p>{en ? '8–10 April 2027 · Coimbra' : '8–10 abril 2027 · Coimbra'}</p>
          <p>{en ? '8 April · Pre-Congress Course · 9–10 April · International Congress' : '8 abril · Curso Pré-Congresso · 9–10 abril · Congresso Internacional'}</p>
          <p className="contact-layout__note">
            {en
              ? 'When confirmed information is already available on the programme, participation, partnerships or Coimbra pages, those pages remain the official reference.'
              : 'Quando já exista informação confirmada nas páginas Programa, Participar, Parcerias ou Coimbra, essas páginas mantêm-se como referência oficial.'}
          </p>
        </div>
        <ContactForm />
      </section>
    </main>
  );
}
