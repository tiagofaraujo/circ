import React from 'react';
import './MriCourseDescription.css';

export const mriCourseTitle = {
  pt: 'Pós-processamento em ressonância magnética: da aquisição à análise avançada',
  en: 'MRI post-processing: from acquisition to advanced analysis',
};
const content = {
  pt: {
    duration: '4 horas', trainer: 'Daniel Leitão — técnico de radiologia, Siemens Healthineers',
    format: 'Sessão teórico-prática, com demonstrações e análise de casos clínicos',
    objectives: ['Compreender os princípios do pós-processamento em RM;', 'Conhecer as principais ferramentas de reconstrução e análise;', 'Aplicar reconstruções multiplanares (MPR), projeções de intensidade máxima (MIP), projeções de intensidade mínima (MinIP) e reconstruções 3D;', 'Explorar a difusão, os mapas ADC, a perfusão, a subtração e a fusão de imagens;', 'Reconhecer artefactos e limitações;', 'Aplicar os conhecimentos adquiridos à análise de casos clínicos.'],
    sessions: [
      ['09h00–09h30', 'Introdução ao pós-processamento', ['Importância na prática clínica;', 'Relação entre a aquisição e o pós-processamento;', 'Principais ferramentas.']],
      ['09h30–10h30', 'Reconstrução e visualização', ['MPR, MIP, MinIP e reconstruções 3D;', 'Demonstração do fluxo de trabalho;', 'Exemplos práticos.']],
      ['10h30–10h45', 'Pausa', []],
      ['10h45–11h45', 'Pós-processamento avançado', ['Difusão e mapas ADC;', 'Perfusão e mapas paramétricos;', 'Subtração e fusão de imagens;', 'Análise qualitativa e quantitativa.']],
      ['11h45–12h45', 'Casos clínicos e workshop', ['Neurorradiologia;', 'Sistema músculo-esquelético;', 'Abdómen e pelve;', 'Angiografia por RM.'], 'Demonstração e processamento orientado de casos clínicos.'],
      ['12h45–13h00', 'Discussão e conclusões', ['Principais dificuldades e limitações;', 'Perguntas e respostas;', 'Síntese dos conteúdos apresentados.']],
    ],
    audience: 'Técnicos de radiologia e médicos radiologistas.',
    methodology: 'Sessão com uma breve componente teórica, demonstrações práticas, análise de casos clínicos e workshop orientado.',
  },
  en: {
    duration: '4 hours', trainer: 'Daniel Leitão — radiographer, Siemens Healthineers',
    format: 'Theory and practical session, with demonstrations and clinical case analysis',
    objectives: ['Understand the principles of MRI post-processing;', 'Become familiar with the main reconstruction and analysis tools;', 'Apply multiplanar reconstruction (MPR), maximum intensity projection (MIP), minimum intensity projection (MinIP) and 3D reconstruction;', 'Explore diffusion, ADC maps, perfusion, subtraction and image fusion;', 'Recognise artefacts and limitations;', 'Apply the knowledge gained to clinical case analysis.'],
    sessions: [
      ['09:00–09:30', 'Introduction to post-processing', ['Importance in clinical practice;', 'Relationship between acquisition and post-processing;', 'Main tools.']],
      ['09:30–10:30', 'Reconstruction and visualisation', ['MPR, MIP, MinIP and 3D reconstruction;', 'Workflow demonstration;', 'Practical examples.']],
      ['10:30–10:45', 'Break', []],
      ['10:45–11:45', 'Advanced post-processing', ['Diffusion and ADC maps;', 'Perfusion and parametric maps;', 'Subtraction and image fusion;', 'Qualitative and quantitative analysis.']],
      ['11:45–12:45', 'Clinical cases and workshop', ['Neuroradiology;', 'Musculoskeletal system;', 'Abdomen and pelvis;', 'MR angiography.'], 'Demonstration and guided processing of clinical cases.'],
      ['12:45–13:00', 'Discussion and conclusions', ['Main challenges and limitations;', 'Questions and answers;', 'Summary of the topics covered.']],
    ],
    audience: 'Radiographers and radiologists.',
    methodology: 'A session combining a brief theoretical component, practical demonstrations, clinical case analysis and a guided workshop.',
  },
};

export default function MriCourseDescription({ en }) {
  const t = en ? content.en : content.pt;
  return <div className="mri-course-description">
    <dl className="mri-course-facts">
      <div><dt>{en ? 'Schedule' : 'Horário'}</dt><dd>{en ? '09:00–13:00' : '09h00–13h00'}</dd></div>
      <div><dt>{en ? 'Duration' : 'Duração'}</dt><dd>{t.duration}</dd></div>
      <div><dt>{en ? 'Trainer' : 'Formador'}</dt><dd>{t.trainer}</dd></div>
      <div><dt>{en ? 'Format' : 'Formato'}</dt><dd>{t.format}</dd></div>
    </dl>
    <details className="mri-course-section"><summary>{en ? 'Learning objectives' : 'Objetivos'}</summary><ul>{t.objectives.map(item => <li key={item}>{item}</li>)}</ul></details>
    <details className="mri-course-section"><summary>{en ? 'Full course programme · 09:00–13:00' : 'Programa completo do curso · 09h00–13h00'}</summary>
      <ol className="mri-course-sessions">{t.sessions.map(([time, title, items, note]) => <li key={time}>
        <h4><span>{time}</span> {title}</h4>
        {items.length > 0 && <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>}
        {note && <p>{note}</p>}
      </li>)}</ol>
    </details>
    <h4>{en ? 'Intended audience' : 'Destinatários'}</h4><p>{t.audience}</p>
    <h4>{en ? 'Methodology' : 'Metodologia'}</h4><p>{t.methodology}</p>
  </div>;
}
