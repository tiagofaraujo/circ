// src/components/js/TimeLine.js
import React from 'react';
import '../css/TimeLine.css';

function TimeLine() {
    return (
        <section className="timeline">
            <h2>Cronologia do Evento</h2>
            <div className="timeline-container">
                <div className="timeline-line"></div>
                <div className="timeline-content">
                    <div className="timeline-item">
                        <div className="timeline-circle"></div>
                        <div className="timeline-card">
                            <h4>Julho 1</h4>
                            <p>Submissão de resumos para apresentações orais e posters</p>
                            <button className="timeline-button">Submeter Trabalhos</button>
                        </div>
                    </div>
                    <div className="timeline-item">
                        <div className="timeline-circle"></div>
                        <div className="timeline-card">
                            <h4>Outubro 1</h4>
                            <p>Abertura das Inscrições</p>
                        </div>
                    </div>
                    <div className="timeline-item">
                        <div className="timeline-circle"></div>
                        <div className="timeline-card">
                            <h4>Dezembro 31</h4>
                            <p>Prazo final para submissão de resumos</p>
                        </div>
                    </div>
                    <div className="timeline-item">
                        <div className="timeline-circle"></div>
                        <div className="timeline-card">
                            <h4>Abril 3, 4 e 5 - 2025</h4>
                            <p>CIRC 2025</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default TimeLine;
