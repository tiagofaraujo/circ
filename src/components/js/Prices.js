// src/components/js/Prices.js
import React from 'react';
import { Link } from 'react-router-dom';
import '../css/Prices.css';
import { useLanguage } from '../../context/LanguageContext';
import { COURSE_RATES, CONGRESS_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE, formatEuro } from '../../data/registration2027';

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
    const perPerson = en ? 'Price per person' : 'Preço por pessoa';

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

            <div className="price-guide" aria-label={en ? 'How the registration price is calculated' : 'Como é calculado o preço da inscrição'}>
                <article><span>01</span><div><strong>{en ? 'Your profile' : 'O seu perfil'}</strong><p>{en ? 'ULS Coimbra, external delegate or IMR student.' : 'ULS Coimbra, congressista externo ou estudante IMR.'}</p></div></article>
                <article><span>02</span><div><strong>{en ? 'Congress format' : 'Formato do congresso'}</strong><p>{en ? 'In person or virtual; courses-only is available to professionals.' : 'Presencial ou virtual; apenas cursos está disponível para profissionais.'}</p></div></article>
                <article><span>03</span><div><strong>{en ? 'Pre-Congress Courses' : 'Cursos Pré-Congresso'}</strong><p>{en ? 'Morning and afternoon, exclusively for professionals.' : 'Manhã e tarde, exclusivamente para profissionais.'}</p></div></article>
                <article><span>04</span><div><strong>{en ? 'Congress dinner' : 'Jantar do congresso'}</strong><p>{en ? 'Choose the quantity · €30 per person, with every category.' : 'Escolha a quantidade · 30 € por pessoa, em qualquer modalidade.'}</p></div></article>
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
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.uls.early)} dinnerAmount={formatEuro(CONGRESS_RATES.uls.early + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.uls.regular)} dinnerAmount={formatEuro(CONGRESS_RATES.uls.regular + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'External delegates' : 'Congressistas externos'}</th>
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.external.early)} dinnerAmount={formatEuro(CONGRESS_RATES.external.early + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.external.regular)} dinnerAmount={formatEuro(CONGRESS_RATES.external.regular + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'IMR students' : 'Estudantes IMR'}</th>
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.student.early)} dinnerAmount={formatEuro(CONGRESS_RATES.student.early + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(CONGRESS_RATES.student.regular)} dinnerAmount={formatEuro(CONGRESS_RATES.student.regular + DINNER_RATE)} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'Virtual congress' : 'Congresso virtual'}</th>
                                <td><PriceValue amount={formatEuro(VIRTUAL_CONGRESS_RATE)} note={singlePrice} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(VIRTUAL_CONGRESS_RATE)} note={singlePrice} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr>
                                <th scope="row">{en ? 'Congress dinner' : 'Jantar do congresso'}</th>
                                <td><PriceValue amount={formatEuro(DINNER_RATE)} note={perPerson} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(DINNER_RATE)} note={perPerson} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">{en ? 'Pre-congress courses' : 'Cursos pré-congresso'}</span>
                                    ULS Coimbra
                                </th>
                                <td><PriceValue amount={formatEuro(COURSE_RATES.uls)} note={perCourse} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(COURSE_RATES.uls)} note={perCourse} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                            <tr className="course-row">
                                <th scope="row">
                                    <span className="row-label">{en ? 'Pre-congress courses' : 'Cursos pré-congresso'}</span>
                                    {en ? 'External professionals' : 'Profissionais externos'}
                                </th>
                                <td><PriceValue amount={formatEuro(COURSE_RATES.external)} note={perCourse} dinnerLabel={dinnerLabel} /></td>
                                <td><PriceValue amount={formatEuro(COURSE_RATES.external)} note={perCourse} dinnerLabel={dinnerLabel} /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="price-table-footer">
                    <p>
                        <strong>{en ? 'Dinner:' : 'Jantar:'}</strong>{' '}
                        {en
                            ? '€30 per person. One or more dinner tickets may be added to any registration category. The amounts marked “With dinner” include one ticket.'
                            : '30 € por pessoa. Pode adicionar um ou mais bilhetes de jantar a qualquer modalidade de inscrição. Os valores assinalados como «Com jantar» incluem um bilhete.'}
                    </p>
                    <p>
                        <strong>{en ? 'Pre-Congress Courses:' : 'Cursos Pré-Congresso:'}</strong>{' '}
                        {en
                            ? 'two independent courses take place on 8 April, one in the morning and one in the afternoon. The fee is per course. IMR students are not eligible to register for the Pre-Congress Courses.'
                            : 'existem dois cursos independentes no dia 8 de abril, um de manhã e outro à tarde. O valor indicado é por curso. Os estudantes IMR não têm acesso à inscrição nos Cursos Pré-Congresso.'}
                    </p>
                </div>
                <div className="price-simulator-link">
                    <div><strong>{en ? 'Prefer a guided calculation?' : 'Prefere um cálculo guiado?'}</strong><span>{en ? 'Build a combination and see the estimated total immediately.' : 'Construa a combinação e veja imediatamente o total estimado.'}</span></div>
                    <Link to="/conta/inscricoes">{en ? 'Open simulator' : 'Abrir simulador'} <span aria-hidden="true">→</span></Link>
                </div>
            </div>
        </section>
    );
}

export default Prices;
