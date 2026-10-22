import React from 'react';

// Public wording follows the organiser-approved domestic configuration.
// Do not imply that cross-border virtual attendance has already been validated.
export default function FiscalPriceNote({ en = false }) {
  return <aside className="fiscal-price-note" role="note" aria-label={en ? 'Prices and VAT' : 'Preços e IVA'}>
    <p><strong>{en ? 'Final prices.' : 'Preços finais.'}</strong>{' '}{en
      ? 'Congress registrations and dinner tickets, including accompanying guests, are VAT exempt under article 9 of the Portuguese VAT Code. Pre-Congress Course prices include VAT at 23%.'
      : 'As inscrições no congresso e os bilhetes de jantar, incluindo acompanhantes, estão isentos de IVA ao abrigo do artigo 9.º do CIVA. Nos cursos pré-congresso, o IVA à taxa de 23% está incluído no preço.'}</p>
    <p>{en
      ? 'The tax treatment of virtual attendance for customers outside Portugal requires specific validation before invoicing.'
      : 'O enquadramento fiscal da participação virtual de clientes fora de Portugal exige validação específica antes da faturação.'}</p>
  </aside>;
}
