import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadHotelOffers } from '../auth/hotelOffers';
import HotelAccommodation from './HotelAccommodation';

const destination = { from: '/coimbra#alojamento' };

export default function HotelAccommodationAccess({ en }) {
  const { user, loading } = useAuth();
  const [result, setResult] = useState({ uid: null, status: 'loading', hotels: [] });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (loading || !user) {
      setResult({ uid: null, status: 'loading', hotels: [] });
      return undefined;
    }
    const controller = new AbortController();
    const uid = user.uid;
    setResult({ uid, status: 'loading', hotels: [] });
    loadHotelOffers(user, controller.signal).then((hotels) => {
      if (!controller.signal.aborted) setResult({ uid, status: 'ready', hotels });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ uid, status: 'error', hotels: [] });
    });
    return () => controller.abort();
  }, [user, loading, retry]);

  if (loading || (user && (result.uid !== user.uid || result.status === 'loading'))) {
    return <section id="alojamento" className="hotel-access hotel-access--status" aria-live="polite"><p>{en ? 'Loading accommodation information…' : 'A carregar a informação de alojamento…'}</p></section>;
  }
  if (!user) return <section id="alojamento" className="hotel-access" aria-labelledby="hotel-access-title">
    <div className="hotel-access__icon" aria-hidden="true"><i className="fa-solid fa-hotel" /></div>
    <div className="hotel-access__copy">
      <p className="eyebrow">My CIRC · {en ? 'Accommodation' : 'Alojamento'}</p>
      <h2 id="hotel-access-title">{en ? 'Your hotel, in My CIRC.' : 'O seu hotel, no My CIRC.'}</h2>
      <p>{en ? 'Sign in to explore the hotels, accommodation offers and booking codes for CIRC 2027.' : 'Inicie sessão para consultar os hotéis, as condições de alojamento e os códigos de reserva para o CIRC 2027.'}</p>
      <div className="hotel-access__actions">
        <Link className="hotel-access__primary" to="/login" state={destination}>{en ? 'Sign in to view' : 'Entrar para consultar'} <span aria-hidden="true">↗</span></Link>
        <Link className="hotel-access__secondary" to="/registar" state={destination}>{en ? 'Create account' : 'Criar conta'}</Link>
      </div>
    </div>
  </section>;
  if (result.status === 'error') return <section id="alojamento" className="hotel-access hotel-access--status" aria-live="polite">
    <p>{en ? 'Accommodation information could not be loaded. Check your connection and try again.' : 'Não foi possível carregar a informação de alojamento. Verifique a ligação e tente novamente.'}</p>
    <button className="hotel-access__primary" type="button" onClick={() => setRetry((value) => value + 1)}>{en ? 'Try again' : 'Tentar novamente'}</button>
  </section>;
  return <HotelAccommodation en={en} hotels={result.hotels} />;
}
