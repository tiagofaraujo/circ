import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function EventIdentityHero({ en }) {
  const { user } = useAuth();
  return <>
    <section className="event-hero" aria-labelledby="event-title">
      <div className="event-hero__art" aria-hidden="true"><img src="/identity2027/bell-radiograph-hq.jpg" alt="" width="1451" height="1536" fetchPriority="high" /></div>
      <div className="event-hero__inner">
        <div className="event-hero__copy">
          <p className="event-hero__edition">CIRC 2027 <span>03 / {en ? 'Third edition' : 'Terceira edição'}</span></p>
          <p className="event-hero__name">{en ? 'Coimbra International Radiology Congress' : 'Congresso Internacional de Radiologia de Coimbra'}</p>
          <h1 id="event-title" className="event-hero__slogan" lang="en">
            <span>The</span>{' '}
            <span>Invisible</span>{' '}
            <span>becomes</span>{' '}
            <span>visible</span>
          </h1>
          <div className="event-hero__details">
            <p className="event-hero__lead">{en ? 'A new perspective on medical imaging. Science, innovation and people come together in Coimbra.' : 'Uma nova perspetiva sobre a Imagem Médica. Ciência, inovação e pessoas encontram-se em Coimbra.'}</p>
            <div className="event-hero__actions"><Link className="button event-hero__primary" to="/programa">{en ? 'Explore the programme' : 'Explorar o programa'} <span aria-hidden="true">↗</span></Link><Link className="event-hero__secondary" to="/participar">{en ? 'Registration and fees' : 'Inscrições e tarifas'} <span aria-hidden="true">→</span></Link></div>
            <div className="event-hero__location"><span>Coimbra · Portugal</span><strong>Convento São Francisco</strong></div>
            <Link className="event-hero__account" to={user ? '/conta' : '/login'}>My CIRC <span>{en ? (user ? 'Open my account' : 'Sign in') : (user ? 'Aceder à minha conta' : 'Entrar na área reservada')} →</span></Link>
          </div>
        </div>
      </div>
      <span className="event-hero__caption" lang="en">Imaging / Scientific / Talks</span>
    </section>
    <nav className="event-dates" aria-label={en ? 'Event dates' : 'Datas do evento'}>
      <Link to="/programa#dia-08"><span className="event-dates__number">08 <small>{en ? 'APR' : 'ABR'}</small></span><span><strong>{en ? 'Pre-Congress Courses' : 'Cursos Pré-Congresso'}</strong><small>{en ? 'MRI post-processing · Stroke fast-track pathway' : 'Pós-processamento em RM · Via Verde AVC'}</small></span><b aria-hidden="true">↗</b></Link>
      <Link to="/programa#dia-09"><span className="event-dates__number">09–10 <small>{en ? 'APR' : 'ABR'}</small></span><span><strong>{en ? 'International Congress' : 'Congresso Internacional'}</strong><small>{en ? 'Two days of science, exchange and discovery' : 'Dois dias de ciência, partilha e descoberta'}</small></span><b aria-hidden="true">↗</b></Link>
    </nav>
  </>;
}
