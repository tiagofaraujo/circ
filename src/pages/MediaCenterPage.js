import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import media from '../data/mediaCenter.json';
import { mediaPreview, useMediaAccess } from '../data/mediaAccess';
import '../mediaCenter.css';

const copy = {
  pt: {
    subtitle: 'Informação e materiais para imprensa',
    intro: 'Materiais oficiais para apoio à cobertura editorial do Congresso Internacional de Radiologia de Coimbra. A nota de imprensa está fechada para distribuição, acompanhada do Fact Sheet, fotografias autorizadas e contactos da organização.',
    release: 'Distribuição à imprensa autorizada a partir de 16 de outubro de 2026.',
    documents: 'Materiais para imprensa', graphics: 'Recursos gráficos e identidade visual', graphicsLead: 'Materiais oficiais para utilização editorial e divulgação do CIRC 2027. Utilize os ficheiros sem alterar proporções, cores ou composição gráfica.', preview: 'Pré-visualização privada · Divulgação ainda não autorizada',
    pdf: 'Descarregar PDF', word: 'Versão Word', language: 'Português', version: 'Versão final',
    overview: 'O CIRC 2027 em síntese', programme: 'Consultar o programa provisório', speakers: 'Consultar oradores confirmados', website: 'Abrir o site oficial',
    contact: 'Contacto de imprensa', committee: 'Comissão Organizadora do CIRC 2027',
    requests: 'Pedidos de entrevista, informação adicional e materiais para cobertura editorial.',
    email: 'Enviar email', phone: 'Telefonar', jump: 'Ir para os documentos', poster: 'Cartaz oficial', social: 'Imagem para redes sociais', logoAsset: 'Logótipo CIRC', downloadImage: 'Descarregar imagem', downloadLogo: 'Descarregar logótipo', usage: 'Utilização editorial', credit: 'Crédito recomendado: CIRC 2027 · Associação Hemisfério Disciplinado.',
    facts: [
      ['Nome', 'Congresso Internacional de Radiologia de Coimbra — CIRC 2027.'],
      ['Edição', '3.ª edição.'], ['Datas', '8 a 10 de abril de 2027.'],
      ['Distribuição', '8 de abril — cursos pré-congresso.\n9 e 10 de abril — congresso científico.'],
      ['Local do congresso', 'Convento São Francisco, Coimbra, Portugal — 9 e 10 de abril. Os locais dos cursos de 8 de abril serão anunciados após confirmação.'], ['Participação', 'Presencial e online.'],
      ['Organização', 'Iniciativa promovida pelos TSDT de Radiologia da ULS Coimbra, através da Associação Hemisfério Disciplinado.'],
      ['Público', 'Técnicos de radiologia, médicos, estudantes, investigadores, docentes e representantes da indústria da imagem médica, de Portugal e do estrangeiro.'],
      ['Inscrições e submissões científicas', 'Abertura a 15 de novembro de 2026.'],
    ],
  },
  en: {
    subtitle: 'Information and resources for the press',
    intro: 'Official materials for editorial coverage of the Coimbra International Radiology Congress. The press release is final for distribution, together with the Fact Sheet, authorised press photographs and organiser contacts.',
    release: 'Authorised for press distribution from 16 October 2026.',
    documents: 'Press materials', graphics: 'Graphic resources and visual identity', graphicsLead: 'Official assets for editorial use and CIRC 2027 promotion. Please use the files without altering proportions, colours or artwork composition.', preview: 'Private preview · Not yet authorised for release',
    pdf: 'Download PDF', word: 'Word version', language: 'Portuguese', version: 'Final version',
    overview: 'CIRC 2027 at a glance', programme: 'View provisional programme', speakers: 'View confirmed speakers', website: 'Open official website',
    contact: 'Press contact', committee: 'CIRC 2027 Organising Committee',
    requests: 'Interview requests, further information and materials for editorial coverage.',
    email: 'Send email', phone: 'Call', jump: 'Skip to documents', poster: 'Official poster', social: 'Social media artwork', logoAsset: 'CIRC logo', downloadImage: 'Download image', downloadLogo: 'Download logo', usage: 'Editorial use', credit: 'Suggested credit: CIRC 2027 · Associação Hemisfério Disciplinado.',
    facts: [
      ['Name', 'Coimbra International Radiology Congress — CIRC 2027.'],
      ['Edition', '3rd edition.'], ['Dates', '8–10 April 2027.'],
      ['Schedule', '8 April — pre-congress courses.\n9–10 April — scientific congress.'],
      ['Congress venue', 'Convento São Francisco, Coimbra, Portugal — 9 and 10 April. Venues for the courses on 8 April will be announced once confirmed.'], ['Attendance', 'In person and online.'],
      ['Organisation', 'An initiative promoted by the Radiology Technicians of ULS Coimbra, through Associação Hemisfério Disciplinado.'],
      ['Audience', 'Radiology technicians, doctors, students, researchers, lecturers and medical imaging industry representatives from Portugal and abroad.'],
      ['Registration and scientific submissions', 'Open on 15 November 2026.'],
    ],
  },
};

export function fileSize(bytes, language) {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: 0 }).format(bytes / 1024) + ' KB';
}

function MediaMetadata({ description, language, publicAccess = false }) {
  useEffect(() => {
    const changes = [];
    const set = (selector, attr, value, tag, key, keyValue) => {
      let el = document.head.querySelector(selector);
      const existed = !!el;
      if (!el) { el = document.createElement(tag); el.setAttribute(key, keyValue); document.head.appendChild(el); }
      const previous = el.getAttribute(attr);
      el.setAttribute(attr, value);
      changes.push(() => { if (!existed) el.remove(); else if (previous === null) el.removeAttribute(attr); else el.setAttribute(attr, previous); });
    };
    set('link[rel="canonical"]', 'href', 'https://circ-coimbra.org/media', 'link', 'rel', 'canonical');
    for (const [name, value] of Object.entries({ description, 'twitter:title': 'Media Center | CIRC 2027', 'twitter:description': description, robots: publicAccess ? 'index, follow' : 'noindex, nofollow' })) {
      set(`meta[name="${name}"]`, 'content', value, 'meta', 'name', name);
    }
    for (const [name, value] of Object.entries({'og:title': 'Media Center | CIRC 2027', 'og:description': description, 'og:url': 'https://circ-coimbra.org/media', 'og:locale': language === 'en' ? 'en_GB' : 'pt_PT'})) {
      set(`meta[property="${name}"]`, 'content', value, 'meta', 'property', name);
    }
    return () => changes.reverse().forEach(restore => restore());
  }, [description, language, publicAccess]);
  return null;
}

export default function MediaCenterPage() {
  const { language } = useLanguage();
  const t = copy[language] || copy.pt;
  const allowed = useMediaAccess();
  const en = language === 'en';
  if (!allowed) return <main className="media-center media-access">
    <MediaMetadata description={en ? 'Press access' : 'Acesso reservado à imprensa'} language={language} publicAccess={false} />
    <header className="media-intro"><p className="media-kicker">CIRC 2027 · COIMBRA</p><h1>Media Center<span aria-hidden="true">.</span></h1>
    <h2>{en ? 'Press access' : 'Acesso reservado à imprensa'}</h2>
    <p>{en ? 'Enter the password provided by the organisers to access press materials.' : 'Introduza a palavra-passe enviada pela organização para aceder aos materiais de imprensa.'}</p></header>
    <form method="post" action="/media-access" className="media-access-form">
      <label htmlFor="media-password">{en ? 'Password' : 'Palavra-passe'}</label>
      <input id="media-password" type="password" name="password" autoComplete="current-password" required maxLength={128} />
      {new URLSearchParams(window.location.search).get('access') === 'denied' && <p role="alert">{en ? 'Incorrect password. Please try again.' : 'Palavra-passe incorreta. Tente novamente.'}</p>}
      <button className="media-button" type="submit">{en ? 'Enter Media Center' : 'Entrar no Media Center'}</button>
    </form>
    <p>{en ? 'Need access? Contact ' : 'Precisa de acesso? Contacte '}<a href="mailto:circ.chuc@gmail.com">circ.chuc@gmail.com</a>.</p>
  </main>;
  const docs = media.documents.filter(doc => doc.status === 'published' || mediaPreview).sort((a, b) => a.order - b.order);
  return (
    <main className="media-center" id="media-main">
      <MediaMetadata description={t.subtitle + ' — CIRC 2027. ' + t.requests} language={language} publicAccess={media.publicAccess === true && !mediaPreview} />
      {!mediaPreview && media.publicAccess !== true && <form method="post" action="/media-access" className="media-logout"><input type="hidden" name="action" value="logout" /><button type="submit">{en ? 'Sign out of Media' : 'Sair da área Media'}</button></form>}
      <a className="media-skip" href="#press-documents">{t.jump}</a>
      {mediaPreview && <p className="media-preview-notice">{t.preview}</p>}
      <header className="media-intro">
        <p className="media-kicker">CIRC 2027 · COIMBRA</p>
        <h1>Media Center<span aria-hidden="true">.</span></h1>
        <h2>{t.subtitle}</h2>
        <p>{t.intro}</p>
        <p className="media-release-note"><strong>{t.release}</strong></p>
      </header>
      <section id="press-documents" aria-labelledby="documents-heading" tabIndex={-1}>
        <h2 className="media-section-title" id="documents-heading">{t.documents}</h2>
        <div className="media-documents">
          {docs.map(doc => <article className="media-document" key={doc.id} aria-labelledby={`${doc.id}-title`}>
            <p className="media-document-type">{doc.language === 'pt-PT' ? t.language : doc.language} · {doc.version === 'Final' ? t.version : doc.version}{doc.date && <> · <time dateTime={doc.date}>{new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'pt-PT', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'}).format(new Date(doc.date))}</time></>}</p>
            <h3 id={`${doc.id}-title`}>{doc.title[language] || doc.title.pt}</h3>
            <p>{doc.description[language] || doc.description.pt}</p>
            <div className="media-downloads">
              {doc.files.pdf && <a className="media-button" href={`/media-files/${doc.files.pdf.name}`} download aria-label={`${t.pdf} — ${doc.title[language] || doc.title.pt}`}><span>{t.pdf}</span><span aria-hidden="true">↓</span></a>}
              {doc.files.pdf && <span className="media-file-size">PDF · {fileSize(doc.files.pdf.bytes, language)}</span>}
              {doc.files.zip && <a className="media-button" href={`/media-files/${doc.files.zip.name}`} download><span>{en ? 'Download photographs' : 'Descarregar fotografias'}</span><span aria-hidden="true">↓</span></a>}
              {doc.files.zip && <span className="media-file-size">ZIP · {fileSize(doc.files.zip.bytes, language)}</span>}
              {doc.files.docx && <a className="media-word" href={`/media-files/${doc.files.docx.name}`} download>{t.word} <span>· DOCX · {fileSize(doc.files.docx.bytes, language)}</span></a>}
            </div>
          </article>)}
        </div>
      </section>
      <section className="media-graphics" aria-labelledby="graphics-heading">
        <div className="media-graphics__intro">
          <div>
            <p className="media-kicker">MEDIA KIT</p>
            <h2 className="media-section-title" id="graphics-heading">{t.graphics}</h2>
          </div>
          <p>{t.graphicsLead}</p>
        </div>
        <div className="media-graphics-grid">
          <article className="media-asset media-asset--poster">
            <div className="media-asset__preview media-asset__preview--posterfile" aria-label={t.poster}>
              <span>CIRC 2027</span>
              <strong>Cartaz_RGB-3000.jpg</strong>
            </div>
            <div className="media-asset__body">
              <p className="media-document-type">CIRC 2027 · JPG · {en ? 'Final artwork' : 'Arte final'}</p>
              <h3>{t.poster}</h3>
              <p>{en ? 'The official poster asset is Cartaz_RGB-3000.jpg. No previous social artwork is presented here.' : 'O ficheiro oficial do cartaz é Cartaz_RGB-3000.jpg. Nesta área não é apresentada nenhuma peça social anterior.'}</p>
            </div>
          </article>
          <article className="media-asset media-asset--logo">
            <div className="media-asset__preview media-asset__preview--logo"><img src="/logo.png" alt={t.logoAsset} loading="lazy" decoding="async" /></div>
            <div className="media-asset__body">
              <p className="media-document-type">{en ? 'Official identity · Vector PDF · 3 pages' : 'Identidade oficial · PDF vetorial · 3 páginas'}</p>
              <h3>{t.logoAsset}</h3>
              <p>{en ? 'Official vector identity file with vertical, horizontal and wordmark compositions in black, red and blue.' : 'Ficheiro vetorial oficial com composições vertical, horizontal e lettering nas variantes preta, vermelha e azul.'}</p>
              <p className="media-asset__filename"><strong>CIRC_LOGO_VETORIAL.pdf</strong></p>
              <a className="media-word" href="/logo.png" download>{en ? 'PNG preview' : 'Pré-visualização PNG'} <span>· PNG</span></a>
            </div>
          </article>
        </div>
        <div className="media-usage-note"><strong>{t.usage}</strong><span>{t.credit}</span></div>
      </section>
      <div className="media-detail-grid">
        <section aria-labelledby="overview-heading">
          <h2 className="media-section-title" id="overview-heading">{t.overview}</h2>
          <dl className="media-facts">{t.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div className="media-editorial-links">
            <Link className="media-programme" to="/programa">{t.programme} <span aria-hidden="true">↗</span></Link>
            <Link className="media-programme" to="/oradores">{t.speakers} <span aria-hidden="true">↗</span></Link>
            <a className="media-programme" href="https://circ-coimbra.org/">{t.website} <span aria-hidden="true">↗</span></a>
          </div>
        </section>
        <section className="media-contact" aria-labelledby="contact-heading">
          <p className="media-kicker">{t.contact}</p>
          <h2 id="contact-heading">Tiago Araújo</h2>
          <p>{t.committee}</p>
          <address><a href="mailto:circ.chuc@gmail.com">circ.chuc@gmail.com</a><a href="tel:+351914004261">+351 914 004 261</a></address>
          <p className="media-contact-help">{t.requests}</p>
          <div className="media-contact-actions"><a className="media-button" href="mailto:circ.chuc@gmail.com">{t.email}</a><a className="media-call" href="tel:+351914004261">{t.phone}</a></div>
        </section>
      </div>
    </main>
  );
}
