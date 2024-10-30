import React from 'react';
import '../css/TimeLine.css';

const timelineData = [
  {
    date: 'Julho 1',
    description: 'Submissão de resumos para apresentações orais e posters.',
    button: 'Submeter Trabalhos',
  },
  {
    date: 'Outubro 1',
    description: 'Abertura das Inscrições',
  },
  {
    date: 'Dezembro 31',
    description: 'Prazo final para submissão de resumos',
  },
  {
    date: 'Abril 3, 4 e 5 - 2025',
    description: 'CIRC 2025',
  },
];

function TimeLine() {
  return (
    <div className="timeline">
      <h2>Cronologia do Evento</h2>
      <div className="timeline-container">
        <div className="timeline-line"></div>
        {timelineData.map((item, index) => (
          <div className="timeline-item" key={index}>
            <div className="timeline-circle"></div>
            <div className="timeline-card">
              <h4>{item.date}</h4>
              <h4>{item.title}</h4>
              <p>{item.description}</p>
              {item.button && <button className="timeline-button">{item.button}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimeLine;
