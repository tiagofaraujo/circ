// src/components/js/Prices.js
import React from 'react';
import '../css/Prices.css';

function Prices() {
    return (
        <section className="prices">
            <h2>Taxas de Inscrição — CIRC 2027</h2>
            <p className="deadline">Inscrições a partir de 15 de novembro de 2026</p>
            <p className="deadline">Preços até 31 de janeiro de 2027</p>

            <div className="price-cards">
                <div className="card">
                    <h3>Congressistas ULS Coimbra</h3>
                    <p className="price">€55</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €85</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card selected">
                    <h3>Congressistas Externos</h3>
                    <p className="price">€95</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €125</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Estudantes IMR</h3>
                    <p className="price">€60</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €90</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Congresso Virtual</h3>
                    <p className="price">€60</p>
                    <p>Congresso</p>
                    <p className="note">Preço único.</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Pacote Extra de Jantar</h3>
                    <p className="price">€30</p>
                    <p>🍽</p>
                    <button className="btn">Avançar</button>
                </div>
            </div>

            <p className="deadline">Preços a partir de 1 de fevereiro de 2027</p>
            <div className="price-cards">
                <div className="card">
                    <h3>Congressistas ULS Coimbra</h3>
                    <p className="price">€90</p>
                    <p className="highlight">🍽 Com jantar: €120</p>
                </div>
                <div className="card selected">
                    <h3>Congressistas Externos</h3>
                    <p className="price">€150</p>
                    <p className="highlight">🍽 Com jantar: €180</p>
                </div>
                <div className="card">
                    <h3>Estudantes IMR</h3>
                    <p className="price">€95</p>
                    <p className="highlight">🍽 Com jantar: €125</p>
                </div>
            </div>

            <h2>Cursos pré-congresso</h2>
            <p className="deadline">Preço por curso</p>
            <div className="price-cards">
                <div className="card">
                    <h3>ULS Coimbra</h3>
                    <p className="price">€20</p>
                </div>
                <div className="card selected">
                    <h3>Participantes Externos</h3>
                    <p className="price">€35</p>
                </div>
            </div>
        </section>
    );
}

export default Prices;
