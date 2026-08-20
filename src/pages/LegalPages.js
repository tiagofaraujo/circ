import React from 'react';
import { Link } from 'react-router-dom';
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

function LegalSection({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LegalMeta({ en }) {
  return (
    <div className="legal-meta">
      <span>{en ? 'Last updated · 19 August 2026' : 'Última atualização · 19 agosto 2026'}</span>
      <span>circ-coimbra.org</span>
      <span>Associação Hemisfério Disciplinado · NIF 517 072 262</span>
    </div>
  );
}

export function PrivacyPolicyPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page legal-page">
      <PageHero
        eyebrow={en ? 'Legal · Privacy' : 'Legal · Privacidade'}
        title={en ? 'Privacy Policy' : 'Política de Privacidade'}
        lead={
          en
            ? 'A clear description of the personal data used by the CIRC website, the participant area and the contact channels.'
            : 'Uma descrição clara dos dados pessoais utilizados pelo website CIRC, pelo My CIRC e pelos canais de contacto.'
        }
      />

      <div className="legal-intro">
        {en
          ? 'This policy modernises the privacy information from the former CIRC website and reflects the current website architecture. It will be reviewed again before registrations and payments for CIRC 2027 open.'
          : 'Esta política atualiza a informação de privacidade do antigo website CIRC e reflete a arquitetura atual do site. Será novamente revista antes da abertura das inscrições e pagamentos do CIRC 2027.'}
      </div>

      <LegalSection title={en ? '1. Who is responsible for the data' : '1. Quem é responsável pelos dados'}>
        <p>
          {en
            ? 'The website and CIRC event are organised by Associação Hemisfério Disciplinado (AHD), a non-profit association based in Coimbra, Portugal, tax number 517 072 262. Questions regarding personal data may be submitted through the official contact page.'
            : 'O website e o evento CIRC são organizados pela Associação Hemisfério Disciplinado (AHD), associação sem fins lucrativos sediada em Coimbra, Portugal, NIF 517 072 262. Questões relativas a dados pessoais podem ser apresentadas através da página oficial de contactos.'}
        </p>
        <p><Link className="text-link" to="/contactos">{en ? 'Contact CIRC' : 'Contactar o CIRC'}</Link></p>
      </LegalSection>

      <LegalSection title={en ? '2. Data we may process' : '2. Dados que podemos tratar'}>
        <ul>
          <li>{en ? 'Contact form: name, email address, subject and message.' : 'Formulário de contacto: nome, endereço de email, assunto e mensagem.'}</li>
          <li>{en ? 'My CIRC account: email address, account identifier and, where provided by the user or Google, name and profile photograph.' : 'Conta My CIRC: endereço de email, identificador da conta e, quando fornecidos pelo utilizador ou pela conta Google, nome e fotografia de perfil.'}</li>
          <li>{en ? 'Authentication security data processed by the authentication provider, which may include device/browser information and IP address for security and abuse prevention.' : 'Dados técnicos de segurança tratados pelo fornecedor de autenticação, que podem incluir informação do dispositivo/browser e endereço IP para segurança e prevenção de abuso.'}</li>
          <li>{en ? 'Future registration data: professional, institutional, attendance, invoicing and payment information, once registration services are activated.' : 'Futuros dados de inscrição: informação profissional, institucional, de participação, faturação e pagamento, quando os serviços de inscrição forem ativados.'}</li>
        </ul>
      </LegalSection>

      <LegalSection title={en ? '3. Why we use the data' : '3. Para que utilizamos os dados'}>
        <ul>
          <li>{en ? 'To answer contact requests and provide information about CIRC.' : 'Responder a pedidos de contacto e prestar informação sobre o CIRC.'}</li>
          <li>{en ? 'To create, secure and manage the participant account.' : 'Criar, proteger e gerir a conta de participante.'}</li>
          <li>{en ? 'To manage registrations, participation, certificates and related documentation when these functions become available.' : 'Gerir inscrições, participação, certificados e documentação associada quando essas funcionalidades estiverem disponíveis.'}</li>
          <li>{en ? 'To comply with legal, accounting and security obligations applicable to the organisation.' : 'Cumprir obrigações legais, contabilísticas e de segurança aplicáveis à organização.'}</li>
          <li>{en ? 'Marketing communications will only be sent where there is an appropriate legal basis, including consent where required.' : 'Comunicações de marketing apenas serão enviadas quando exista fundamento jurídico adequado, incluindo consentimento quando exigível.'}</li>
        </ul>
      </LegalSection>

      <LegalSection title={en ? '4. Technology and service providers' : '4. Tecnologia e prestadores de serviços'}>
        <p>
          {en
            ? 'The website is delivered through Cloudflare infrastructure. My CIRC uses Google Firebase Authentication and, when registrations are active, Cloud Firestore and private Cloud Storage for registration records and related documents. The contact form is transmitted through EmailJS to the organisation email account. These providers process data only to the extent required to provide their respective technical services and according to their own contractual and privacy frameworks.'
            : 'O website é disponibilizado através de infraestrutura Cloudflare. O My CIRC utiliza Google Firebase Authentication e, quando as inscrições estiverem ativas, Cloud Firestore e Cloud Storage privado para registos de inscrição e documentos associados. O formulário de contacto é transmitido através do EmailJS para a caixa de correio da organização. Estes prestadores tratam dados na medida necessária à prestação dos respetivos serviços técnicos e de acordo com os seus enquadramentos contratuais e de privacidade.'}
        </p>
        <p>
          <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer">Firebase · Privacy &amp; Security</a>{' · '}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare · Privacy</a>{' · '}
          <a href="https://www.emailjs.com/legal/privacy-policy/" target="_blank" rel="noopener noreferrer">EmailJS · Privacy</a>
        </p>
      </LegalSection>

      <LegalSection title={en ? '5. Retention' : '5. Conservação'}>
        <p>
          {en
            ? 'Personal data is kept only for as long as necessary for the purpose for which it was collected and for any applicable legal or administrative obligations. Account information may be retained while the account remains active. Registration, invoicing and accounting records may need to be retained for legally required periods.'
            : 'Os dados pessoais são conservados apenas durante o período necessário à finalidade para a qual foram recolhidos e ao cumprimento de obrigações legais ou administrativas aplicáveis. A informação da conta pode ser conservada enquanto a conta se mantiver ativa. Registos de inscrição, faturação e contabilidade poderão ter de ser conservados durante os prazos legalmente exigidos.'}
        </p>
      </LegalSection>

      <LegalSection title={en ? '6. Your rights' : '6. Os seus direitos'}>
        <p>
          {en
            ? 'Under applicable data protection law, data subjects may have rights of access, rectification, erasure, restriction, objection and portability, subject to the conditions established by law. Requests may be made through the CIRC contact channel. You may also lodge a complaint with the Portuguese supervisory authority, Comissão Nacional de Proteção de Dados (CNPD).'
            : 'Nos termos da legislação de proteção de dados aplicável, o titular pode dispor dos direitos de acesso, retificação, apagamento, limitação, oposição e portabilidade, sujeitos às condições previstas na lei. Os pedidos podem ser apresentados através do canal de contacto do CIRC. Pode igualmente apresentar reclamação junto da autoridade de controlo portuguesa, a Comissão Nacional de Proteção de Dados (CNPD).'}
        </p>
        <p><a href="https://www.cnpd.pt/" target="_blank" rel="noopener noreferrer">CNPD</a></p>
      </LegalSection>

      <LegalSection title={en ? '7. Updates to this policy' : '7. Atualizações desta política'}>
        <p>
          {en
            ? 'This policy may be updated as the CIRC 2027 registration, payment, certificate or analytics services are activated. Material changes will be reflected on this page with a revised update date.'
            : 'Esta política poderá ser atualizada à medida que forem ativados os serviços de inscrição, pagamento, certificados ou analítica do CIRC 2027. Alterações relevantes serão refletidas nesta página com nova data de atualização.'}
        </p>
      </LegalSection>

      <LegalMeta en={en} />
    </main>
  );
}

export function CookiesPolicyPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page legal-page">
      <PageHero
        eyebrow={en ? 'Legal · Cookies' : 'Legal · Cookies'}
        title={en ? 'Cookie & Storage Policy' : 'Política de Cookies e Armazenamento'}
        lead={
          en
            ? 'What the CIRC website stores in your browser and why.'
            : 'O que o website CIRC guarda no seu browser e porquê.'
        }
      />

      <LegalSection title={en ? '1. Current approach' : '1. Abordagem atual'}>
        <p>
          {en
            ? 'The current CIRC website is designed to minimise tracking. It does not intentionally use advertising or behavioural profiling cookies. It uses browser storage and essential technologies required to remember preferences and support secure website functions.'
            : 'O website CIRC atual foi desenhado para minimizar mecanismos de rastreio. Não utiliza intencionalmente cookies de publicidade ou de criação de perfis comportamentais. Utiliza armazenamento do browser e tecnologias essenciais para memorizar preferências e suportar funções seguras do site.'}
        </p>
      </LegalSection>

      <LegalSection title={en ? '2. What is stored' : '2. O que é armazenado'}>
        <ul>
          <li>{en ? 'Language preference (Portuguese or English).' : 'Preferência de idioma (português ou inglês).'}</li>
          <li>{en ? 'The choice made in the privacy/cookie notice.' : 'A escolha efetuada no aviso de privacidade/cookies.'}</li>
          <li>{en ? 'Authentication state required to keep a user signed in to My CIRC, when authentication is active.' : 'Estado de autenticação necessário para manter a sessão do My CIRC, quando a autenticação está ativa.'}</li>
          <li>{en ? 'Security-related technologies that may be applied by infrastructure providers such as Cloudflare or Firebase.' : 'Tecnologias relacionadas com segurança que podem ser aplicadas por prestadores de infraestrutura como Cloudflare ou Firebase.'}</li>
        </ul>
      </LegalSection>

      <LegalSection title={en ? '3. Analytics and optional technologies' : '3. Analítica e tecnologias opcionais'}>
        <p>
          {en
            ? 'If analytics, marketing or other non-essential technologies are introduced later, the website will update this policy and, where required, request an appropriate choice before those technologies are activated.'
            : 'Se forem introduzidas posteriormente ferramentas de analítica, marketing ou outras tecnologias não essenciais, o website atualizará esta política e, quando exigível, solicitará uma escolha adequada antes da respetiva ativação.'}
        </p>
      </LegalSection>

      <LegalSection title={en ? '4. Managing browser data' : '4. Gerir dados do browser'}>
        <p>
          {en
            ? 'You can clear cookies and local website data using your browser settings. Doing so may reset the language, privacy preference or signed-in session.'
            : 'Pode eliminar cookies e dados locais do website através das definições do seu browser. Ao fazê-lo poderá repor o idioma, a preferência de privacidade ou terminar a sessão autenticada.'}
        </p>
      </LegalSection>

      <LegalMeta en={en} />
    </main>
  );
}

export function TermsOfUsePage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page legal-page">
      <PageHero
        eyebrow={en ? 'Legal · Website' : 'Legal · Website'}
        title={en ? 'Terms of Use' : 'Termos de Utilização'}
        lead={
          en
            ? 'The essential rules for using circ-coimbra.org and the My CIRC participant area.'
            : 'As regras essenciais de utilização do circ-coimbra.org e do My CIRC.'
        }
      />

      <LegalSection title={en ? '1. Website purpose' : '1. Finalidade do website'}>
        <p>{en ? 'circ-coimbra.org is the official digital information point for CIRC 2027 and its historical archive. Content may evolve as programme, participation and partnership information is formally confirmed.' : 'circ-coimbra.org é o ponto digital oficial de informação do CIRC 2027 e do respetivo arquivo histórico. Os conteúdos podem evoluir à medida que programa, participação e parcerias sejam formalmente confirmados.'}</p>
      </LegalSection>

      <LegalSection title={en ? '2. Accounts and security' : '2. Contas e segurança'}>
        <ul>
          <li>{en ? 'Users are responsible for providing accurate account information and protecting their access credentials.' : 'Os utilizadores são responsáveis por fornecer informação correta e proteger as respetivas credenciais de acesso.'}</li>
          <li>{en ? 'Accounts may not be used to impersonate another person, interfere with the service or attempt unauthorised access.' : 'As contas não podem ser utilizadas para representar falsamente outra pessoa, interferir com o serviço ou tentar acessos não autorizados.'}</li>
          <li>{en ? 'CIRC may suspend access where necessary to protect users, the platform or the organisation from abuse or security incidents.' : 'O CIRC poderá suspender o acesso quando necessário para proteger utilizadores, plataforma ou organização perante abuso ou incidente de segurança.'}</li>
        </ul>
      </LegalSection>

      <LegalSection title={en ? '3. Event information' : '3. Informação do evento'}>
        <p>{en ? 'Dates, venues, prices, speakers, programme items, partner conditions and registration rules are only considered final when explicitly published as confirmed. Historical information from CIRC 2023 or CIRC 2025 does not define the conditions of CIRC 2027.' : 'Datas, locais, preços, oradores, conteúdos de programa, condições de parceiros e regras de inscrição só são considerados finais quando explicitamente publicados como confirmados. Informação histórica do CIRC 2023 ou CIRC 2025 não define as condições do CIRC 2027.'}</p>
      </LegalSection>

      <LegalSection title={en ? '4. Intellectual property' : '4. Propriedade intelectual'}>
        <p>{en ? 'The CIRC name, visual identity, website design, texts and event materials may be protected by intellectual property rights. Reuse for commercial or misleading purposes is not authorised without appropriate permission.' : 'O nome CIRC, identidade visual, design do website, textos e materiais do evento podem estar protegidos por direitos de propriedade intelectual. A reutilização para fins comerciais ou suscetíveis de induzir em erro não é autorizada sem a devida permissão.'}</p>
      </LegalSection>

      <LegalSection title={en ? '5. External links' : '5. Ligações externas'}>
        <p>{en ? 'The website may link to third-party services for information or technical functions. CIRC does not control the content or availability of external websites and users should review the applicable terms and privacy information of those services.' : 'O website pode incluir ligações a serviços de terceiros para informação ou funções técnicas. O CIRC não controla o conteúdo ou disponibilidade de websites externos e o utilizador deve consultar os respetivos termos e informação de privacidade.'}</p>
      </LegalSection>

      <LegalSection title={en ? '6. Changes' : '6. Alterações'}>
        <p>{en ? 'These terms may be updated as CIRC 2027 services evolve. The current version will always be made available on this page.' : 'Estes termos poderão ser atualizados à medida que os serviços do CIRC 2027 evoluam. A versão em vigor estará sempre disponível nesta página.'}</p>
      </LegalSection>

      <LegalMeta en={en} />
    </main>
  );
}

export function EventRegulationPage() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page legal-page">
      <PageHero
        eyebrow={en ? 'CIRC 2027 · Regulation' : 'CIRC 2027 · Regulamento'}
        title={en ? 'Event Regulation' : 'Regulamento do Evento'}
        status={en ? 'Preliminary structure' : 'Estrutura preliminar'}
        lead={
          en
            ? 'The previous CIRC regulation has been recovered as a reference. The outdated 2025 prices, cancellation percentages, suppliers and deadlines have deliberately not been carried forward.'
            : 'O regulamento anterior do CIRC foi recuperado como referência. Preços, percentagens de cancelamento, fornecedores e prazos de 2025 não foram deliberadamente transpostos para 2027.'
        }
      />

      <div className="legal-intro">
        {en
          ? 'The final contractual regulation will be published before registrations open. Participants will be able to review the final version before completing a paid registration.'
          : 'O regulamento contratual final será publicado antes da abertura das inscrições. Os participantes poderão consultar a versão final antes de concluir uma inscrição paga.'}
      </div>

      <LegalSection title={en ? '1. Registration' : '1. Inscrição'}>
        <ul>
          <li>{en ? 'Registration may be subject to capacity limits and category-specific conditions.' : 'A inscrição poderá estar sujeita a limites de lotação e condições específicas por categoria.'}</li>
          <li>{en ? 'The participant is responsible for checking personal, professional and invoicing details before confirmation.' : 'O participante é responsável por confirmar os dados pessoais, profissionais e de faturação antes da validação.'}</li>
          <li>{en ? 'Where a reduced or specific category depends on professional or student status, proof may be requested.' : 'Quando uma categoria reduzida ou específica dependa de condição profissional ou de estudante, poderá ser solicitado comprovativo.'}</li>
          <li>{en ? 'A registration is only considered completed when all required steps, including payment where applicable, are successfully concluded.' : 'A inscrição apenas será considerada concluída quando todos os passos exigidos, incluindo pagamento quando aplicável, forem finalizados com sucesso.'}</li>
        </ul>
      </LegalSection>

      <LegalSection title={en ? '2. Course, congress and access' : '2. Curso, congresso e acessos'}>
        <p>{en ? 'CIRC 2027 comprises a Pre-Congress Course on 8 April and the International Congress on 9 and 10 April. Registration options may distinguish between the course, congress and complete experience. Access credentials, tickets or QR codes are personal and may not be transferred unless the final regulation expressly allows a formal substitution process.' : 'O CIRC 2027 integra um Curso Pré-Congresso no dia 8 de abril e o Congresso Internacional nos dias 9 e 10. As modalidades de inscrição poderão distinguir curso, congresso e experiência completa. Credenciais de acesso, bilhetes ou QR codes são pessoais e não podem ser transmitidos, salvo se o regulamento final permitir expressamente um processo formal de substituição.'}</p>
      </LegalSection>

      <LegalSection title={en ? '3. Cancellation and refunds' : '3. Cancelamentos e reembolsos'}>
        <p>{en ? 'The cancellation, substitution and refund policy for CIRC 2027 has not yet been approved. It will be published together with prices and registration conditions. No cancellation percentage or deadline from CIRC 2025 applies automatically to CIRC 2027.' : 'A política de cancelamento, substituição e reembolso do CIRC 2027 ainda não está aprovada. Será publicada em conjunto com preços e condições de inscrição. Nenhuma percentagem ou prazo de cancelamento do CIRC 2025 é automaticamente aplicável ao CIRC 2027.'}</p>
      </LegalSection>

      <LegalSection title={en ? '4. Certificates and attendance' : '4. Certificados e presença'}>
        <p>{en ? 'Where certificates are issued, their availability may depend on registration status, attendance/check-in requirements and completion of the event. The final criteria will be stated before the event.' : 'Quando sejam emitidos certificados, a respetiva disponibilização poderá depender do estado da inscrição, requisitos de presença/check-in e conclusão do evento. Os critérios finais serão indicados antes do evento.'}</p>
      </LegalSection>

      <LegalSection title={en ? '5. Photography, video and streaming' : '5. Fotografia, vídeo e streaming'}>
        <p>{en ? 'CIRC may include photography, video capture or streaming for communication, scientific or archival purposes. Unlike the broad implicit authorisation language used in the former regulation, CIRC 2027 will provide specific information at registration and/or at the venue regarding image capture, participant areas and any consent options that may be required.' : 'O CIRC poderá incluir fotografia, captação de vídeo ou streaming para fins de comunicação, científicos ou de arquivo. Em vez da autorização implícita e genérica usada no regulamento anterior, o CIRC 2027 disponibilizará informação específica na inscrição e/ou no local sobre captação de imagem, zonas de participantes e eventuais opções de consentimento que sejam necessárias.'}</p>
      </LegalSection>

      <LegalSection title={en ? '6. Personal data' : '6. Dados pessoais'}>
        <p>{en ? 'Personal data used for registration and participation will be processed in accordance with the CIRC Privacy Policy and the information provided at the moment each service is activated.' : 'Os dados pessoais utilizados para inscrição e participação serão tratados de acordo com a Política de Privacidade do CIRC e com a informação disponibilizada no momento em que cada serviço seja ativado.'}</p>
        <p><Link className="text-link" to="/privacidade">{en ? 'Read the Privacy Policy' : 'Consultar Política de Privacidade'}</Link></p>
      </LegalSection>

      <LegalMeta en={en} />
    </main>
  );
}
