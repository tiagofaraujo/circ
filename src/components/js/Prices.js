// src/components/js/Prices.js
import React from 'react';
import '../css/Prices.css';
import { useLanguage } from '../../context/LanguageContext';

function PriceValue({ amount, dinnerAmount, note, dinnerLabel }) {
    return (
        <div className="price-value">
            <span className="price-main">{amount}</span>
            {dinnerAmount && (
                <span className="price-detail">{dinnerLabel}: {dinnerAmount}</span>
            )}
            {note && <span className="price-note">{note}</span>}
        </div>
    );
}

function Prices() {
    const { language } = useLanguage();
    const en = language === 'en';
    const dinnerLabel = en ? 'With dinner' : 'Com jantar';
    const singlePrice = en ? 'Single price' : 'Preço único';
    const perCourse = en ? 'Price per course' : 'Preço por curso';

    return (
        <section className="prices" aria-labelledby="prices-title">
            <div className="prices-header">
                <p className="prices-kicker">CIRC 2027</p>
                <h2 id="prices-title">{en ? 'Registration fees' : 'Taxas de inscrição'}</h2>
                <p className="prices-opening">
                    {en
                        ? 'Registration opens on 15 November 2026'
                        : 'Inscrições a partir de 15 de novembro de 2026'}
                </p>
            </div>

            <div className="price-table-card">
                <div className="price-table-scroll">
                    <table className="price-table">
                        <caption className="sr-only">
                            {en
                                ? 'CIRC 2027 registration, dinner and pre-congress course fees'
                                : 'Preços das inscrições, jantar e cursos pré-congresso do CIRC 2027'}
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">{en ? 'Category' : 'Modalidade'}</th>
                                <th scope="col">
                                    {en ? 'Until' : 'Até'}
                                    <span>{en ? '31 Jan 2027' : '31 jan. 2027'}</span>
                                </th>
                                <th scope="col">
                                    {en ? 'From' : 'A partir de'}
                                    <span>{en ? '1 Feb 2027' : '1 fev. 2027'}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">{en ? 'ULS Coimbra delegates' : 'Congressistas ULS Coimbra'}</th>
                                <td><PriceValue amount="55 €" dinnerAmount="85 €" dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="90 €" dinnerAmount="120 €" dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'External delegates' : 'Congressistas externos'}</th>
                                <td><PriceValue amount="95 €" dinnerAmount="125 €" dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="150 €" dinnerAmount="180 €" dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'IMR students' : 'Estudantes IMR'}</th>
                                <td><PriceValue amount="60 €" dinnerAmount="90 €" dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="95 €" dinnerAmount="125 €" dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'Virtual congress' : 'Congresso virtual'}</th>
                                <td><PriceValue amount="60 €" note={singlePrice} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="60 €" note={singlePrice} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'Extra dinner' : 'Jantar extra'}</th>
                                <td><PriceValue amount="30 €" dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="30 €" dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">{en ? 'Pre-congress courses' : 'Cursos pré-congresso'}</span>
                                    ULS Coimbra
                                </th>
                                <td><PriceValue amount="20 €" note={perCourse} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="20 €" note={perCourse} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">{en ? 'Pre-congress courses' : 'Cursos pré-congresso'}</span>
                                    {en ? 'External participants' : 'Participantes externos'}
                                </th>
                                <td><PriceValue amount="35 €" note={perCourse} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount="35 €" note={perCourse} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="price-table-footer">
                    <p>
                        <strong>{en ? 'Dinner:' : 'Jantar:'}</strong>{' '}
                        {en
                            ? '€30 supplement, already included in the amounts marked “With dinner”.'
                            : 'suplemento de 30 €, já incluído nos valores assinalados como «Com jantar».'}
                    </p>
                    <p>
                        <strong>{en ? 'Pre-Congress Courses:' : 'Cursos Pré-Congresso:'}</strong>{' '}
                        {en
                            ? 'two independent courses take place on 8 April, one in the morning and one in the afternoon. The stated fee is per course, based on the participant’s connection to ULS Coimbra, with no separate student rate.'
                            : 'existem dois cursos independentes no dia 8 de abril, um de manhã e outro à tarde. O valor indicado é por curso e depende da ligação à ULS Coimbra, sem tarifa específica para estudantes.'}
                    </p>
                </div>
            </div>
        </section>
    );
}

export default Prices;
