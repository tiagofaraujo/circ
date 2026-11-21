import { sessionId } from './discovery';

const escapeText = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

// Fold at 75 UTF-8 octets, as required by iCalendar (including continuation space).
function foldLine(value) {
  const lines = []; let line = ''; let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (bytes + size > 75) { lines.push(line); line = ' '; bytes = 1; }
    line += character; bytes += size;
  }
  return [...lines, line].join('\r\n');
}

export function programmeCalendar(day, rows, en = false, now = new Date()) {
  // CIRC takes place in April, during Lisbon daylight saving time (UTC+01:00).
  const utcTime = time => new Date(`2027-04-${day}T${time}:00+01:00`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CIRC//Programme 2027//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const row of rows) {
    const [time, pt, english] = row;
    const match = /^(\d{2}:\d{2})(?:[–-](\d{2}:\d{2}))?$/.exec(time);
    if (!match || !pt) continue;
    lines.push('BEGIN:VEVENT', `UID:${sessionId(day, row)}@circ-coimbra.org`,
      `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${utcTime(match[1])}`);
    if (match[2]) lines.push(`DTEND:${utcTime(match[2])}`);
    lines.push(`SUMMARY:${escapeText(en ? english : pt)}`, 'LOCATION:Coimbra',
      `DESCRIPTION:${escapeText(en ? 'Provisional programme. Check the website for updates. Times are local to Coimbra.' : 'Programa provisório. Consulte as atualizações no site. Horários locais de Coimbra.')}`,
      `URL:https://circ-coimbra.org/programa#dia-${day}`, 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n';
}

export function downloadCalendar(day, rows, en) {
  const blob = new Blob([programmeCalendar(day, rows, en)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `CIRC-2027-04-${day}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
