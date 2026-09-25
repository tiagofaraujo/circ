import React, { useState } from 'react';
import { hotels2027 } from '../data/hotels2027';
import './css/HotelAccommodation.css';

function BookingCode({ hotel, en }) {
  const [copyState, setCopyState] = useState('');
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(hotel.promoCode);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }
  return <div className="hotel-code">
    <div><span>{en ? 'Booking code' : 'Código de reserva'}</span><code>{hotel.promoCode}</code></div>
    <button type="button" onClick={copyCode} aria-label={`${en ? 'Copy code for' : 'Copiar código de'} ${hotel.name}`}>
      {copyState === 'copied' ? (en ? 'Copied' : 'Copiado') : (en ? 'Copy' : 'Copiar')}
    </button>
    <span className="hotel-code__status" role="status">
      {copyState === 'manual' ? (en ? 'Select and copy the code above.' : 'Selecione e copie o código acima.') : copyState === 'copied' ? (en ? 'Code copied.' : 'Código copiado.') : ''}
    </span>
  </div>;
}

export default function HotelAccommodation({ en }) {
  const language = en ? 'en' : 'pt';
  const text = (value) => value[language];
  return <section id="alojamento" className="hotel-section" aria-labelledby="hotel-heading">
    <header className="hotel-section__heading">
      <div>
        <p className="eyebrow">CIRC 2027 · {en ? 'Accommodation' : 'Alojamento'}</p>
        <h2 id="hotel-heading">{en ? 'Stay in Coimbra.' : 'Fique em Coimbra.'}</h2>
      </div>
      <p>{en ? 'Explore the accommodation offers received for congress participants, with booking codes and direct hotel contacts.' : 'Consulte as condições de alojamento recebidas para os participantes do congresso, com códigos de reserva e contactos diretos dos hotéis.'}</p>
    </header>
    <div className="hotel-section__notice">
      <strong>{en ? 'Direct bookings' : 'Reservas diretas'}</strong>
      <p>{en ? 'Book and pay directly with the hotel. Confirm availability, eligible dates and the stated conditions before booking.' : 'Reservas e pagamentos são feitos com o hotel. Confirme a disponibilidade, as datas e as condições indicadas antes de reservar.'}</p>
    </div>
    <div className="hotel-grid">
      {hotels2027.map((hotel) => {
        const bookingHref = hotel.bookingType === 'email' ? `mailto:${hotel.email}?subject=${encodeURIComponent('CIRC 2027 — Pedido de reserva / Booking enquiry')}` : hotel.website;
        return <article className="hotel-card" key={hotel.id} aria-labelledby={`${hotel.id}-name`}>
          <header className="hotel-card__heading"><p>{hotel.zone}</p><h3 id={`${hotel.id}-name`}>{hotel.name}</h3></header>
          <div className="hotel-card__benefit"><strong>{text(hotel.benefit)}</strong><span>{text(hotel.benefitLabel)}</span></div>
          <p className="hotel-card__description">{text(hotel.description)}</p>
          {hotel.promoCode ? <BookingCode hotel={hotel} en={en} /> : <div className="hotel-reference"><span>{en ? 'Mention when booking' : 'Referência ao reservar'}</span><strong>{hotel.reference}</strong></div>}
          <p className="hotel-card__booking">{text(hotel.booking)}</p>
          <details className="hotel-details">
            <summary>{en ? 'Conditions and contacts' : 'Condições e contactos'}<span aria-hidden="true">+</span></summary>
            <div className="hotel-details__body">
              <dl>
                <div><dt>{en ? 'Eligible dates' : 'Datas abrangidas'}</dt><dd>{text(hotel.dates)}</dd></div>
                <div><dt>{en ? 'Breakfast' : 'Pequeno-almoço'}</dt><dd>{text(hotel.breakfast)}</dd></div>
                <div><dt>{en ? 'Tourist tax' : 'Taxa turística'}</dt><dd>{text(hotel.tax)}</dd></div>
              </dl>
              <p>{text(hotel.conditions)}</p>
              <div className="hotel-details__contacts">
                {hotel.email && <a href={`mailto:${hotel.email}`}>{hotel.email}</a>}
                {hotel.phone && <a href={`tel:${hotel.phone.replace(/\s/g, '')}`}>{hotel.phone}</a>}
                <a href={hotel.website} target="_blank" rel="noopener noreferrer">{en ? 'Hotel website' : 'Site do hotel'} <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </details>
          <a className="hotel-card__action" href={bookingHref} {...(hotel.bookingType === 'website' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {hotel.bookingType === 'email' ? (en ? 'Enquire by email' : 'Pedir reserva por email') : (en ? 'View rates at the hotel' : 'Ver tarifas no hotel')}<span aria-hidden="true">↗</span>
          </a>
        </article>;
      })}
    </div>
    <p className="hotel-section__updated">{en ? 'Information updated on 25 September 2026. Offers are subject to hotel confirmation and availability.' : 'Informação atualizada a 25 de setembro de 2026. Condições sujeitas a confirmação e disponibilidade de cada hotel.'}</p>
  </section>;
}
