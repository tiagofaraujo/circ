import React from 'react';

export const mriCourseTitle = {
  pt: 'Pós-processamento em ressonância magnética: da aquisição à análise avançada',
  en: 'MRI post-processing: from acquisition to advanced analysis',
};

export default function MriCourseDescription({ en }) {
  return <div className="mri-course-description">
    <p>{en ? <>A theory and practical course led by <strong>Daniel Leitão</strong>, radiographer at Siemens Healthineers, dedicated to MRI post-processing and its application in clinical practice.</> : <>Um curso teórico-prático orientado por <strong>Daniel Leitão</strong>, técnico de radiologia da Siemens Healthineers, dedicado ao pós-processamento em ressonância magnética e à sua aplicação na prática clínica.</>}</p>
    <p>{en ? 'From multiplanar and 3D reconstruction to diffusion, perfusion and image fusion, the course explores the main visualisation and analysis tools through practical demonstrations and clinical cases.' : 'Das reconstruções multiplanares e 3D à difusão, perfusão e fusão de imagens, o curso explora as principais ferramentas de visualização e análise, através de demonstrações práticas e casos clínicos.'}</p>
    <p><strong>{en ? 'A practical approach for radiographers and radiologists, connecting image acquisition with advanced analysis.' : 'Uma abordagem prática para técnicos de radiologia e médicos radiologistas, que liga a aquisição de imagem à análise avançada.'}</strong></p>
  </div>;
}
