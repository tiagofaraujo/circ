import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import media from '../data/mediaCenter.json';
import { mediaPreview, useMediaAccess } from '../data/mediaAccess';
import '../mediaCenter.css';

const copy = {
  pt: {
    subtitle: 'Informação e materiais para imprensa',
    intro: 'Informação oficial, documentos e recursos de apoio à cobertura do Congresso Internacional de Radiologia de Coimbra. Para pedidos de entrevista, esclarecimentos ou materiais adicionais, contacte a organização.',
    documents: 'Documentos para imprensa', preview: 'Pré-visualização privada · Divulgação ainda não autorizada',
    pdf: 'Descarregar PDF', word: 'Versão Word', language: 'Português', version: 'Versão final',
    overview: 'O CIRC 2027 em síntese', programme: 'Consultar programa provisório',
    contact: 'Contacto de imprensa', committee: 'Comissão Organizadora do CIRC 2027',
    requests: 'Pedidos de entrevista, informação adicional e materiais para cobertura editorial.',
    email: 'Enviar email', phone: 'Telefonar', jump: 'Ir para os documentos',
    facts: [
      ['Nome', 'Congresso Internacional de Radiologia de Coimbra — CIRC 2027.'],
      ['Edição', '3.ª edição.'], ['Datas', '8 a 10 de abril de 2027.'],
      ['Distribuição', '8 de abril — cursos pré-congresso.\n9 e 10 de abril — congresso científico.'],
      ['Local', 'Convento São Francisco, Coimbra, Portugal.'], ['Participação', 'Presencial e online.'],
      ['Organização', 'Iniciativa promovida pelos TSDT de Radiologia da ULS Coimbra, através da Associação Hemisfério Disciplinado.'],
      ['Público', 'Técnicos de Radiologia, médicos, estudantes, investigadores, docentes e representantes da indústria da Imagem Médica, de Portugal e do estrangeiro.'],
      ['Inscrições e submissões científicas', 'Abertura a 15 de novembro de 2026.'],
    ],
  },
  en: {
    subtitle: 'Information and resources for the press',
    intro: 'Official information, documents and resources for coverage of the Coimbra International Radiology Congress. For interview requests, enquiries or additional materials, please contact the organisers.',
    documents: 'Press documents', preview: 'Private preview · Not yet authorised for release',
    pdf: 'Download PDF', word: 'Word version', language: 'Portuguese', version: 'Final version',
    overview: 'CIRC 2027 at a glance', programme: 'View provisional programme',
    contact: 'Press contact', committee: 'CIRC 2027 Organising Committee',
    requests: 'Interview requests, further information and materials for editorial coverage.',
    email: 'Send email', phone: 'Call', jump: 'Skip to documents',
    facts: [
      ['Name', 'Coimbra International Radiology Congress — CIRC 2027.'],
      ['Edition', '3rd edition.'], ['Dates', '8–10 April 2027.'],
      ['Schedule', '8 April — pre-congress courses.\n9–10 April — scientific congress.'],
      ['Venue', 'Convento São Francisco, Coimbra, Portugal.'], ['Attendance', 'In person and online.'],
      ['Organisation', 'An initiative promoted by the Radiology Technicians of ULS Coimbra, through Associação Hemisfério Disciplinado.'],
      ['Audience', 'Radiology technicians, doctors, students, researchers, lecturers and medical imaging industry representatives from Portugal and abroad.'],
      ['Registration and scientific submissions', 'Open on 15 November 2026.'],
    ],
  },
};

export function fileSize(bytes, language) {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: 0 }).format(bytes / 1024) + ' KB';
}

function MediaMetadata({ description, language }) {
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
    for (const [name, value] of Object.entries({ description, 'twitter:title': 'Media Center | CIRC 2027', 'twitter:description': description, robots: 'noindex, nofollow' })) {
      set(`meta[name="${name}"]`, 'content', value, 'meta', 'name', name);
    }
    for (const [name, value] of Object.entries({'og:title': 'Media Center | CIRC 2027', 'og:description': description, 'og:url': 'https://circ-coimbra.org/media', 'og:locale': language === 'en' ? 'en_GB' : 'pt_PT'})) {
      set(`meta[property="${name}"]`, 'content', value, 'meta', 'property', name);
    }
    return () => changes.reverse().forEach(restore => restore());
  }, [description, language]);
  return null;
}

export default function MediaCenterPage() {
  const { language } = useLanguage();
  const t = copy[language] || copy.pt;
  const allowed = useMediaAccess();
  const en = language === 'en';
  if (!allowed) return <main className="media-center media-access">
    <MediaMetadata description={en ? 'Press access' : 'Acesso reservado à imprensa'} language={language} />
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
      <MediaMetadata description={t.subtitle + ' — CIRC 2027. ' + t.requests} language={language} />
      {!mediaPreview && <form method="post" action="/media-access" className="media-logout"><input type="hidden" name="action" value="logout" /><button type="submit">{en ? 'Sign out of Media' : 'Sair da área Media'}</button></form>}
      <a className="media-skip" href="#press-documents">{t.jump}</a>
      {mediaPreview && <p className="media-preview-notice">{t.preview}</p>}
      <header className="media-intro">
        <p className="media-kicker">CIRC 2027 · COIMBRA</p>
        <h1>Media Center<span aria-hidden="true">.</span></h1>
        <h2>{t.subtitle}</h2>
        <p>{t.intro}</p>
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
              <span className="media-file-size">PDF · {fileSize(doc.files.pdf.bytes, language)}</span>
              {doc.files.docx && <a className="media-word" href={`/media-files/${doc.files.docx.name}`} download>{t.word} <span>· DOCX · {fileSize(doc.files.docx.bytes, language)}</span></a>}
            </div>
          </article>)}
        </div>
      </section>
      <div className="media-detail-grid">
        <section aria-labelledby="overview-heading">
          <h2 className="media-section-title" id="overview-heading">{t.overview}</h2>
          <dl className="media-facts">{t.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <Link className="media-programme" to="/programa">{t.programme} <span aria-hidden="true">↗</span></Link>
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
