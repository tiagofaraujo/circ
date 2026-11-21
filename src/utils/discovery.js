export function searchText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function matchesSearch(value, query) {
  const text = searchText(value);
  return searchText(query).split(/\s+/).every(word => text.includes(word));
}

export function readPreference(key, fallback = null) {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function savePreference(key, value) {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

export function programmeSearchText(row, speakers, moderators) {
  const [time, pt, en, details = {}] = row;
  return [time, pt, en,
    ...(details.speakers || []).map(item => {
      const profile = speakers.get(item.id);
      return [item.name, profile?.name, profile?.institution, item.affiliation?.pt, item.affiliation?.en].filter(Boolean).join(' ');
    }),
    ...(details.moderators || []).map(id => [moderators[id]?.name, moderators[id]?.institution].filter(Boolean).join(' ')),
    ...(details.children || []).map(child => programmeSearchText(child, speakers, moderators)),
  ].filter(Boolean).join(' ');
}

export function sessionId(day, row) {
  return `${day}-${searchText(row[1] || row[2]).replace(/[^a-z0-9]+/g, '-')}`;
}
