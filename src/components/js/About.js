import React from 'react';
import '../css/About.css';

function About() {
    return (
        <section className="about">
            <div className="about-content">
                <div className="about-left">
                    <img src="/cartaz_v2.jpg" alt="CIRC 2025 Poster" className="about-image" />
                </div>
                <div className="about-right">
                    <h2>Bem vindo ao CIRC 2025</h2>
                    <p>Este evento reúne especialistas, investigadores e profissionais da radiologia para explorar inovações tecnológicas, avanços científicos e melhores práticas clínicas.</p>
                    <p>Em 2025, destacamos temas como a Inteligência Artificial na radiologia e a transição para Hospitais Verdes, promovendo uma prática médica mais sustentável.</p>
                    <p>Participe e colabore connosco em <span className="highlight">Coimbra</span>, e faça parte do futuro da radiologia!</p>
                    <p className="eyes-on"><span className="highlight">Eyes on the future!</span></p>
                    <div className="about-buttons">
                        <button className="primary-btn">Descarregar Poster</button>
                        <button className="primary-btn">Inscrição</button>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default About;