// src/components/js/Prices.js
import React from 'react';
import '../css/Prices.css';

function Prices() {
    return (
        <section className="prices">
            <h2>Taxas de Inscrição</h2>
            <p className="deadline">Preços até 31 de Janeiro de 2025</p>

            <div className="price-cards">
                <div className="card">
                    <h3>Congressistas ULS Coimbra</h3>
                    <p className="price">€40</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €75</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card selected">
                    <h3>Congressistas Externos</h3>
                    <p className="price">€80</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €115</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Estudantes IMR</h3>
                    <p className="price">€60</p>
                    <p>Congresso</p>
                    <p className="highlight">🍽 Congresso + Jantar: €95</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Congresso Virtual</h3>
                    <p className="price">€60</p>
                    <p>Congresso</p>
                    <p className="note">Nota: A inscrição virtual encerra em 31 de Março de 2025.</p>
                    <button className="btn">Avançar</button>
                </div>
                <div className="card">
                    <h3>Pacote Extra de Jantar</h3>
                    <p className="price">€35</p>
                    <p>🍽</p>
                    <button className="btn">Avançar</button>
                </div>
            </div>

            <p className="deadline">Preços a partir de 1 de fevereiro de 2025</p>
            <div className="price-cards">
                <div className="card">
                    <h3>Congressistas ULS Coimbra</h3>
                    <p className="price">€80</p>
                    <p className="highlight">🍽 Com jantar: €115</p>
                </div>
                <div className="card selected">
                    <h3>Congressistas Externos</h3>
                    <p className="price">€160</p>
                    <p className="highlight">🍽 Com jantar: €195</p>
                </div>
                <div className="card">
                    <h3>Estudantes IMR</h3>
                    <p className="price">€120</p>
                    <p className="highlight">🍽 Com jantar: €155</p>
                </div>
            </div>
        </section>
    );
}

export default Prices;