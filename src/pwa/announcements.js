export async function announcementsRequest(user, notice) {
  const token = await user.getIdToken();
  const response = await fetch('/api/notifications', { method: notice ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
    headers: { Authorization: `Bearer ${token}`, ...(notice ? { 'Content-Type': 'application/json' } : {}) },
    ...(notice ? { body: JSON.stringify(notice) } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'notifications-unavailable');
  return result;
}
