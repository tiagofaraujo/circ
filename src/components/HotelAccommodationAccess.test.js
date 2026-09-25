import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { loadHotelOffers } from '../auth/hotelOffers';
import HotelAccommodationAccess from './HotelAccommodationAccess';

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../auth/hotelOffers', () => ({ loadHotelOffers: jest.fn() }));
jest.mock('./HotelAccommodation', () => ({ hotels }) => <div>{hotels.map(h => <span key={h.id}>{h.promoCode}</span>)}</div>);
const user = { uid: 'participant' };
const hotels = [{ id: 'test', promoCode: 'PRIVATE-OFFER' }];
function Location() { const loc = useLocation(); return <output>{loc.pathname}|{loc.state?.from}</output>; }
const view = () => <MemoryRouter><HotelAccommodationAccess en={false} /><Location /></MemoryRouter>;
beforeEach(() => { jest.clearAllMocks(); useAuth.mockReturnValue({ user: null, loading: false }); });

test('visitors receive no hotel request and login preserves the hotel destination', () => {
  render(view());
  expect(loadHotelOffers).not.toHaveBeenCalled();
  expect(screen.queryByText('PRIVATE-OFFER')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /Entrar para consultar/ }));
  expect(screen.getByText('/login|/coimbra#alojamento')).toBeInTheDocument();
});

test('auth restoration never exposes content or starts a data request early', () => {
  useAuth.mockReturnValue({ user, loading: true }); render(view());
  expect(loadHotelOffers).not.toHaveBeenCalled();
  expect(screen.getByText(/A carregar/)).toBeInTheDocument();
});

test('successful sign-in reveals offers and sign-out immediately removes them', async () => {
  useAuth.mockReturnValue({ user, loading: false }); loadHotelOffers.mockResolvedValue(hotels);
  const rendered = render(view());
  expect(await screen.findByText('PRIVATE-OFFER')).toBeInTheDocument();
  useAuth.mockReturnValue({ user: null, loading: false }); rendered.rerender(view());
  expect(screen.queryByText('PRIVATE-OFFER')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Entrar para consultar/ })).toBeInTheDocument();
});

test('a late response after logout cannot reveal offers', async () => {
  let resolve; loadHotelOffers.mockReturnValue(new Promise(done => { resolve = done; }));
  useAuth.mockReturnValue({ user, loading: false }); const rendered = render(view());
  useAuth.mockReturnValue({ user: null, loading: false }); rendered.rerender(view());
  await act(async () => resolve(hotels));
  expect(screen.queryByText('PRIVATE-OFFER')).not.toBeInTheDocument();
});

test('network failure offers a retry without showing stale data', async () => {
  useAuth.mockReturnValue({ user, loading: false });
  loadHotelOffers.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(hotels);
  render(view());
  fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('PRIVATE-OFFER')).toBeInTheDocument();
});
