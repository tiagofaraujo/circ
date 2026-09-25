export async function loadHotelOffers(user, signal) {
  if (!user?.getIdToken) throw new Error('sign_in_required');
  let response;
  for (const forceRefresh of [false, true]) {
    const token = await user.getIdToken(forceRefresh);
    response = await fetch('/api/accommodation/hotels', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (response.status !== 401) break;
  }
  if (!response.ok) throw new Error(response.status === 401 ? 'invalid_session' : 'hotel_offers_unavailable');
  const data = await response.json();
  if (!Array.isArray(data.hotels) || !data.hotels.length) throw new Error('hotel_offers_unavailable');
  return data.hotels;
}
