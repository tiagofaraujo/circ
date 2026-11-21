const lisbonFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function lisbonDate(time) {
  return Object.fromEntries(lisbonFormatter.formatToParts(new Date(time)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

export function validBirthday(value, time, today = lisbonDate(time)) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1900) return false;
  return value <= `${today.year}-${today.month}-${today.day}`;
}

export function birthdayIsToday(value, time, today = lisbonDate(time)) {
  if (!validBirthday(value, time, today)) return false;
  const monthDay = value.slice(5);
  // In non-leap years, celebrate 29 February on 28 February.
  const leap = new Date(Date.UTC(Number(today.year), 1, 29)).getUTCMonth() === 1;
  return monthDay === `${today.month}-${today.day}`
    || (monthDay === '02-29' && !leap && today.month === '02' && today.day === '28');
}

export function birthdayMessage(profile, locale, year) {
  const first = String(profile.name || '').trim().split(/\s+/)[0];
  const name = /^[\p{L}\p{M}'’-]{1,40}$/u.test(first) ? `, ${first}` : '';
  return { title: 'My CIRC',
    body: locale === 'en' ? `Happy birthday${name}! The CIRC team wishes you a wonderful day.`
      : `Parabéns${name}! A equipa do CIRC deseja-lhe um dia muito feliz.`,
    url: '/conta/notificacoes', tag: `circ-birthday-${year}` };
}
