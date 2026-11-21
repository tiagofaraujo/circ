import { programmeCalendar } from './programmeCalendar';
import { matchesSearch, readPreference, savePreference, sessionId } from './discovery';
import { pageTitle } from './pageTitle';

test('exports Lisbon summer times in UTC without inventing end times', () => {
  const rows = [['12:00–13:00', 'Radiologia, sustentável; futuro', 'Sustainable radiology'], ['18:20', 'Entrega de Prémios', 'Awards']];
  const calendar = programmeCalendar('10', rows, false, new Date('2026-11-21T17:00:00Z'));
  expect(calendar).toContain('DTSTART:20270410T110000Z\r\nDTEND:20270410T120000Z');
  expect(calendar).toContain('DTSTART:20270410T172000Z');
  expect(calendar.match(/DTEND:/g)).toHaveLength(1);
  expect(calendar).toContain('SUMMARY:Radiologia\\, sustentável\\; futuro');
  expect(calendar).toContain('URL:https://circ-coimbra.org/programa#dia-10');
  expect(programmeCalendar('10', rows, true)).toContain('SUMMARY:Sustainable radiology');
});

test('folds long UTF-8 calendar lines without corrupting accents or stable event IDs', () => {
  const title = 'Proteção e diagnóstico avançado '.repeat(12);
  const output = programmeCalendar('09', [['15:05–16:05', title, title]]);
  expect(output.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
  expect(output.replace(/\r\n /g, '')).toContain(`SUMMARY:${title}`);
  expect(sessionId('09', ['15:05', title])).toBe(sessionId('09', ['16:00', title]));
});

test('search is accent/case insensitive and requires all search words', () => {
  expect(matchesSearch('Márcia Amaral · ULS Coimbra', 'marcia coimbra')).toBe(true);
  expect(matchesSearch('Márcia Amaral · ULS Coimbra', 'marcia porto')).toBe(false);
});

test('blocked browser storage is recoverable', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readPreference('circ-language', 'pt')).toBe('pt');
  expect(savePreference('circ-language', 'en')).toBe(false);
  get.mockRestore(); set.mockRestore();
});

test('page titles distinguish account pages and speaker biographies in both languages', () => {
  expect(pageTitle('/conta/inscricoes', 'pt')).toBe('As minhas inscrições | CIRC 2027');
  expect(pageTitle('/conta/inscricoes', 'en')).toBe('My registrations | CIRC 2027');
  expect(pageTitle('/oradores/andrea-rockall', 'pt')).toBe('Andrea Rockall | CIRC 2027');
});
