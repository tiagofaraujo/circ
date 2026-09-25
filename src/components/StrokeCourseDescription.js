import React from 'react';

export const strokeCourseTitle = {
  pt: 'Via Verde AVC — Do diagnóstico à decisão terapêutica',
  en: 'Stroke fast-track pathway — From diagnosis to treatment decisions',
};

export default function StrokeCourseDescription({ en }) {
  return <div className="stroke-course-description">
    <p>{en ? <>A multidisciplinary course dedicated to acute stroke care, led by <strong>Dr. Ricardo Veiga</strong>, with the participation of Neurology and Medical Imaging professionals.</> : <>Um curso multidisciplinar dedicado à abordagem do AVC agudo, sob orientação do <strong>Dr. Ricardo Veiga</strong>, com a participação de profissionais de Neurologia e Imagiologia.</>}</p>
    <p>{en ? 'From clinical assessment to diagnostic imaging and treatment decisions, the course follows the patient journey through the stroke fast-track pathway, bringing together the main neurological scales, CT protocols and the factors that guide patient selection for treatment.' : 'Da avaliação clínica ao diagnóstico por imagem e à decisão terapêutica, o curso acompanha o percurso do doente na Via Verde AVC, articulando as principais escalas neurológicas, os protocolos de TC e os fatores que orientam a seleção para tratamento.'}</p>
    <p><strong>{en ? 'An integrated approach focused on collaboration between teams and timely decision-making.' : 'Uma abordagem integrada, com foco na articulação entre equipas e na tomada de decisão em tempo útil.'}</strong></p>
  </div>;
}
