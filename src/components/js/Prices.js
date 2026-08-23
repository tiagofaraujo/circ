// src/components/js/Prices.js
import React from 'react';
import '../css/Prices.css';

function PriceValue({ amount, dinnerAmount, note }) {
    return (
        <div className="price-value">
            <span className="price-main">{amount}</span>
            {dinnerAmount && (
                <span className="price-detail">Com jantar: {dinnerAmount}</span>
            )}
            {note && <span className="price-note">{note}</span>}
        </div>
    );
}

function Prices() {
    return (
        <section className="prices" aria-labelledby="prices-title">
            <div className="prices-header">
                <p className="prices-kicker">CIRC 2027</p>
                <h2 id="prices-title">Taxas de inscrição</h2>
                <p className="prices-opening">
                    Inscrições a partir de 15 de novembro de 2026
                </p>
            </div>

            <div className="price-table-card">
                <div className="price-table-scroll">
                    <table className="price-table">
                        <caption className="sr-only">
                            Preços das inscrições, jantar e cursos pré-congresso do CIRC 2027
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Modalidade</th>
                                <th scope="col">
                                    Até
                                    <span>31 jan. 2027</span>
                                </th>
                                <th scope="col">
                                    A partir de
                                    <span>1 fev. 2027</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">Congressistas ULS Coimbra</th>
                                <td>
                                    <PriceValue amount="55 €" dinnerAmount="85 €" />
                                </td>
                                <td>
                                    <PriceValue amount="90 €" dinnerAmount="120 €" />
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Congressistas externos</th>
                                <td>
                                    <PriceValue amount="95 €" dinnerAmount="125 €" />
                                </td>
                                <td>
                                    <PriceValue amount="150 €" dinnerAmount="180 €" />
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Estudantes IMR</th>
                                <td>
                                    <PriceValue amount="60 €" dinnerAmount="90 €" />
                                </td>
                                <td>
                                    <PriceValue amount="95 €" dinnerAmount="125 €" />
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Congresso virtual</th>
                                <td>
                                    <PriceValue amount="60 €" note="Preço único" />
                                </td>
                                <td>
                                    <PriceValue amount="60 €" note="Preço único" />
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Jantar extra</th>
                                <td>
                                    <PriceValue amount="30 €" />
                                </td>
                                <td>
                                    <PriceValue amount="30 €" />
                                </td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">Curso pré-congresso</span>
                                    ULS Coimbra
                                </th>
                                <td>
                                    <PriceValue amount="20 €" note="Preço por curso" />
                                </td>
                                <td>
                                    <PriceValue amount="20 €" note="Preço por curso" />
                                </td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">Curso pré-congresso</span>
                                    Participantes externos
                                </th>
                                <td>
                                    <PriceValue amount="35 €" note="Preço por curso" />
                                </td>
                                <td>
                                    <PriceValue amount="35 €" note="Preço por curso" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="price-table-footer">
                    <p>
                        <strong>Jantar:</strong> suplemento de 30 €, já incluído nos valores
                        assinalados como «Com jantar».
                    </p>
                    <p>
                        <strong>Cursos:</strong> o preço é definido pela ligação à ULS Coimbra,
                        sem tarifa específica para estudantes.
                    </p>
                </div>
            </div>
        </section>
    );
}

export default Prices;
