import React from 'react';
import { Link } from 'react-router-dom';
import Prices from '../components/js/Prices';
import RegistrationBuilder from '../components/js/RegistrationBuilder';
import { useLanguage } from '../context/LanguageContext';
import '../courses2027.css';
import '../account.css';
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
      <span>{en ? 'Last updated · 27 August 2026' : 'Última atualização · 27 agosto 2026'}</span>
      <span>circ-coimbra.org</span>
      <span>Associação Hemisfério Disciplinado · NIF 517 072 262</span>
    </div>
  );
}

export function ProgramPage2027() {
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
            ? 'CIRC 2027 begins on 8 April with two independent Pre-Congress Courses: one in the morning and one in the afternoon. The International Congress follows on 9 and 10 April.'
            : 'O CIRC 2027 começa a 8 de abril com dois Cursos Pré-Congresso independentes: um de manhã e outro à tarde. O Congresso Internacional decorre nos dias 9 e 10 de abril.'
        }
      />

      <section className="programme-phases programme-phases--three" aria-label={en ? 'CIRC 2027 programme structure' : 'Estrutura do programa CIRC 2027'}>
        <article className="programme-phase programme-phase--course programme-phase--course-slot">
          <span className="programme-phase__date">08</span>
          <div>
            <p className="eyebrow">{en ? 'April · Morning' : 'Abril · Manhã'}</p>
            <h2>{en ? 'Pre-Congress Course · Morning' : 'Curso Pré-Congresso · Manhã'}</h2>
            <span className="status-chip">
              {en ? 'Theme and programme to be announced' : 'Tema e programa a anunciar'}
            </span>
            <p>
              {en
                ? 'An independent morning training course. The theme, timetable, faculty, capacity and participation details will be published after final validation.'
                : 'Curso de formação autónomo no período da manhã. O tema, horário, formadores, vagas e condições de participação serão divulgados após validação final.'}
            </p>
          </div>
        </article>

        <article className="programme-phase programme-phase--course programme-phase--course-slot">
          <span className="programme-phase__date">08</span>
          <div>
            <p className="eyebrow">{en ? 'April · Afternoon' : 'Abril · Tarde'}</p>
            <h2>{en ? 'Pre-Congress Course · Afternoon' : 'Curso Pré-Congresso · Tarde'}</h2>
            <span className="status-chip">
              {en ? 'Theme and programme to be announced' : 'Tema e programa a anunciar'}
            </span>
            <p>
              {en
                ? 'A second, independent afternoon training course. Participants will be able to register for the morning course, the afternoon course or both.'
                : 'Segundo curso de formação, independente, no período da tarde. Será possível inscrever-se no curso da manhã, no curso da tarde ou em ambos.'}
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

      <section className="course-structure-note">
        <p className="eyebrow">{en ? '8 April · Two courses' : '8 abril · Dois cursos'}</p>
        <h2>{en ? 'Morning and afternoon are separate registration units.' : 'Manhã e tarde são inscrições autónomas.'}</h2>
        <p>
          {en
            ? 'Each course has its own programme and capacity. Registration will therefore allow participants to choose one course or attend both.'
            : 'Cada curso terá programa e lotação próprios. A inscrição permitirá escolher apenas um dos cursos ou participar nos dois.'}
        </p>
      </section>

      <section className="status-list">
        <StatusBlock
          number="01"
          title={en ? 'Pre-Congress Courses' : 'Cursos Pré-Congresso'}
          status={en ? 'Two sessions confirmed' : 'Duas sessões confirmadas'}
        >
          {en
            ? 'The structure is confirmed: one course in the morning and one in the afternoon on 8 April. Themes and detailed programmes are still being finalised.'
            : 'A estrutura está confirmada: um curso de manhã e outro à tarde no dia 8 de abril. Os temas e programas detalhados encontram-se ainda em preparação.'}
        </StatusBlock>
        <StatusBlock
          number="02"
          title={en ? 'Speakers and guests' : 'Oradores e convidados'}
          status={en ? 'To be announced' : 'Por anunciar'}
        >
          {en
            ? 'Confirmations will be added progressively, including biography, topic and session.'
            : 'As confirmações serão adicionadas progressivamente, com biografia, tema e sessão.'}
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
              ? '8 April · Two Pre-Congress Courses — morning and afternoon · 9–10 April · CIRC 2027'
              : '8 abril · Dois Cursos Pré-Congresso — manhã e tarde · 9–10 abril · CIRC 2027'}
          </p>
        </div>
        <Link className="button button--dark" to="/participar">
          {en ? 'Attend' : 'Participar'}
        </Link>
      </section>
    </main>
  );
}

export function ParticipatePage2027() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="page">
      <PageHero
        eyebrow={en ? 'Attend' : 'Participar'}
        title={en ? 'Registration and submissions' : 'Inscrições e trabalhos'}
        status={en ? 'Opens 15 November 2026' : 'Abre a 15 de novembro de 2026'}
        lead={
          en
            ? 'CIRC 2027 registration fees are available. On 8 April there are two separate Pre-Congress Courses, one in the morning and one in the afternoon, each with its own registration.'
            : 'Os valores de inscrição do CIRC 2027 já estão disponíveis. No dia 8 de abril existem dois Cursos Pré-Congresso distintos, um de manhã e outro à tarde, cada um com inscrição própria.'
        }
      />

      <Prices />

      <section className="editorial-grid">
        <article className="info-card info-card--course">
          <p className="eyebrow">{en ? '8 April · Two Pre-Congress Courses' : '8 abril · Dois Cursos Pré-Congresso'}</p>
          <h2>{en ? 'Choose morning, afternoon or both' : 'Escolha manhã, tarde ou ambos'}</h2>
          <p>
            {en
              ? 'The published course fee applies per course. Morning and afternoon courses are independent, so participants may register for either one or for both, subject to capacity.'
              : 'O preço publicado é por curso. Os cursos da manhã e da tarde são independentes, pelo que será possível inscrever-se apenas num deles ou nos dois, sujeito à lotação.'}
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
          <p className="eyebrow">{en ? 'Save the Date' : 'Reserve as datas'}</p>
          <h2>{en ? '8–10 April 2027 · Coimbra' : '8–10 de abril de 2027 · Coimbra'}</h2>
          <p>
            {en
              ? '8 April · Two Pre-Congress Courses — morning and afternoon · 9–10 April · International Congress.'
              : '8 abril · Dois Cursos Pré-Congresso — manhã e tarde · 9–10 abril · Congresso Internacional.'}
          </p>
        </div>
      </section>
    </main>
  );
}

export function CoimbraPage2027() {
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
            ? 'CIRC 2027 runs from 8 to 10 April. Two Pre-Congress Courses take place on 8 April, one in the morning and one in the afternoon. The International Congress on 9 and 10 April is confirmed at Convento São Francisco.'
            : 'O CIRC 2027 decorre entre 8 e 10 de abril. No dia 8 realizam-se dois Cursos Pré-Congresso, um de manhã e outro à tarde. O Congresso Internacional de 9 e 10 de abril está confirmado no Convento São Francisco.'
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
          <p>{en ? 'Confirmed main venue for the International Congress on 9 and 10 April 2027.' : 'Local principal confirmado para o Congresso Internacional nos dias 9 e 10 de abril de 2027.'}</p>
        </div>
      </section>

      <section className="course-location-section">
        <div>
          <p className="eyebrow">{en ? '8 April · Pre-Congress' : '8 abril · Pré-Congresso'}</p>
          <h2>{en ? 'Two courses, two moments of training.' : 'Dois cursos, dois momentos de formação.'}</h2>
          <p>
            {en
              ? 'The specific venue and room for each Pre-Congress Course will be published after final confirmation.'
              : 'O local e a sala específicos de cada Curso Pré-Congresso serão publicados após confirmação final.'}
          </p>
        </div>
        <div className="course-session-grid">
          <article>
            <span>08 · {en ? 'MORNING' : 'MANHÃ'}</span>
            <strong>{en ? 'Pre-Congress Course 1' : 'Curso Pré-Congresso 1'}</strong>
            <small>{en ? 'Venue to be confirmed' : 'Local a confirmar'}</small>
          </article>
          <article>
            <span>08 · {en ? 'AFTERNOON' : 'TARDE'}</span>
            <strong>{en ? 'Pre-Congress Course 2' : 'Curso Pré-Congresso 2'}</strong>
            <small>{en ? 'Venue to be confirmed' : 'Local a confirmar'}</small>
          </article>
        </div>
      </section>
    </main>
  );
}

export function EventRegulationPage2027() {
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
            ? 'The previous CIRC regulation has been recovered as a reference. Outdated 2025 prices, cancellation percentages, suppliers and deadlines have deliberately not been carried forward.'
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

      <LegalSection title={en ? '2. Courses, congress and access' : '2. Cursos, congresso e acessos'}>
        <p>
          {en
            ? 'CIRC 2027 comprises two independent Pre-Congress Courses on 8 April — one in the morning and one in the afternoon — and the International Congress on 9 and 10 April. Registration options may distinguish between either course separately, both courses, the congress and the complete experience. Access credentials, tickets or QR codes are personal and may not be transferred unless the final regulation expressly allows a formal substitution process.'
            : 'O CIRC 2027 integra dois Cursos Pré-Congresso independentes no dia 8 de abril — um de manhã e outro à tarde — e o Congresso Internacional nos dias 9 e 10. As modalidades de inscrição poderão distinguir cada curso separadamente, os dois cursos, o congresso e a experiência completa. Credenciais de acesso, bilhetes ou QR codes são pessoais e não podem ser transmitidos, salvo se o regulamento final permitir expressamente um processo formal de substituição.'}
        </p>
      </LegalSection>

      <LegalSection title={en ? '3. Cancellation and refunds' : '3. Cancelamentos e reembolsos'}>
        <p>{en ? 'The cancellation, substitution and refund policy for CIRC 2027 has not yet been approved. It will be published together with prices and registration conditions. No cancellation percentage or deadline from CIRC 2025 applies automatically to CIRC 2027.' : 'A política de cancelamento, substituição e reembolso do CIRC 2027 ainda não está aprovada. Será publicada em conjunto com preços e condições de inscrição. Nenhuma percentagem ou prazo de cancelamento do CIRC 2025 é automaticamente aplicável ao CIRC 2027.'}</p>
      </LegalSection>

      <LegalSection title={en ? '4. Certificates and attendance' : '4. Certificados e presença'}>
        <p>{en ? 'Where certificates are issued, their availability may depend on registration status, attendance/check-in requirements and completion of the event. The final criteria will be stated before the event.' : 'Quando sejam emitidos certificados, a respetiva disponibilização poderá depender do estado da inscrição, requisitos de presença/check-in e conclusão do evento. Os critérios finais serão indicados antes do evento.'}</p>
      </LegalSection>

      <LegalSection title={en ? '5. Photography, video and streaming' : '5. Fotografia, vídeo e streaming'}>
        <p>{en ? 'CIRC may include photography, video capture or streaming for communication, scientific or archival purposes. CIRC 2027 will provide specific information at registration and/or at the venue regarding image capture, participant areas and any consent options that may be required.' : 'O CIRC poderá incluir fotografia, captação de vídeo ou streaming para fins de comunicação, científicos ou de arquivo. O CIRC 2027 disponibilizará informação específica na inscrição e/ou no local sobre captação de imagem, zonas de participantes e eventuais opções de consentimento que sejam necessárias.'}</p>
      </LegalSection>

      <LegalSection title={en ? '6. Personal data' : '6. Dados pessoais'}>
        <p>{en ? 'Personal data used for registration and participation will be processed in accordance with the CIRC Privacy Policy and the information provided at the moment each service is activated.' : 'Os dados pessoais utilizados para inscrição e participação serão tratados de acordo com a Política de Privacidade do CIRC e com a informação disponibilizada no momento em que cada serviço seja ativado.'}</p>
        <p><Link className="text-link" to="/privacidade">{en ? 'Read the Privacy Policy' : 'Consultar Política de Privacidade'}</Link></p>
      </LegalSection>

      <LegalMeta en={en} />
    </main>
  );
}

export function AccountRegistrationsPage2027() {
  const { language } = useLanguage();
  const en = language === 'en';

  return (
    <main className="account-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">My CIRC · {en ? 'Registration' : 'Inscrição'}</p>
          <h1>{en ? 'Build your registration' : 'Construa a sua inscrição'}</h1>
          <p>{en ? 'Choose each component and see the estimated total immediately.' : 'Escolha cada componente e consulte imediatamente o total estimado.'}</p>
        </div>
        <div className="account-hero__mark" aria-hidden="true">
          <span>CIRC</span>
          <small>2027</small>
        </div>
      </section>

      <section className="account-registration-section">
        <div className="account-registration-alert">
          <span className="account-status account-status--neutral">{en ? 'Opens 15 November 2026' : 'Abre a 15 de novembro de 2026'}</span>
          <p>{en ? 'Use the simulator now. Your choices will only become a registration after confirmation and payment.' : 'Utilize já o simulador. As escolhas só se tornam uma inscrição após confirmação e pagamento.'}</p>
        </div>
        <RegistrationBuilder />
        <div className="account-form-actions"><Link className="text-link" to="/conta">{en ? 'Back to My CIRC' : 'Voltar ao My CIRC'}</Link></div>
      </section>
    </main>
  );
}
