const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { currentIstSlot, istToUtc, windowForSlot, normalizeReportTimes, masterTimesFor, toggleSlot, slotLabel, REPORT_SLOTS } = require('../../lib/reports/slots');

const at = (date, hhmm) => istToUtc(date, hhmm).toISOString();

test('Reports: IST slot from a UTC instant', () => {
  // 03:30 UTC = 09:00 IST
  assert.deepStrictEqual(currentIstSlot(new Date('2026-11-22T03:30:00Z')), { date: '2026-11-22', slot: '09:00' });
  // 18:40 UTC on 21st = 00:10 IST on 22nd
  assert.deepStrictEqual(currentIstSlot(new Date('2026-11-21T18:40:00Z')), { date: '2026-11-22', slot: '00:00' });
});

test('Reports: exactly six slots: 6 AM, 9 AM, 12 PM, 3 PM, 6 PM, 9 PM', () => {
  assert.deepStrictEqual([...REPORT_SLOTS], ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
  assert.deepStrictEqual(REPORT_SLOTS.map(slotLabel), ['6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM']);
});

test('Reports: each slot covers the time since the previous slot', () => {
  const cases = [
    ['06:00', ['2026-11-21', '21:00']], // 6 AM: yesterday 9 PM – today 6 AM
    ['09:00', ['2026-11-22', '06:00']],
    ['12:00', ['2026-11-22', '09:00']],
    ['15:00', ['2026-11-22', '12:00']],
    ['18:00', ['2026-11-22', '15:00']],
    ['21:00', ['2026-11-22', '18:00']],
  ];
  for (const [slot, [d, s]] of cases) {
    const w = windowForSlot('2026-11-22', slot);
    assert.strictEqual(w.start.toISOString(), at(d, s), slot);
    assert.strictEqual(w.end.toISOString(), at('2026-11-22', slot), slot);
  }
});

test('Reports: the 6 AM report crosses months and years correctly', () => {
  assert.strictEqual(windowForSlot('2026-12-01', '06:00').start.toISOString(), at('2026-11-30', '21:00'));
  assert.strictEqual(windowForSlot('2027-01-01', '06:00').start.toISOString(), at('2026-12-31', '21:00'));
});

test('Reports: windows never overlap and never leave a gap across a whole day', () => {
  const day = REPORT_SLOTS.map((s) => windowForSlot('2026-11-22', s));
  for (let i = 1; i < day.length; i++) assert.strictEqual(day[i].start.getTime(), day[i - 1].end.getTime());
  assert.strictEqual(windowForSlot('2026-11-23', '06:00').start.getTime(), day[day.length - 1].end.getTime());
});

test('Reports: older saved times ("6", "9:00") are understood; anything else is dropped', () => {
  assert.deepStrictEqual(normalizeReportTimes(['6', '9', '12', '15', '18', '21']), [...REPORT_SLOTS]);
  assert.deepStrictEqual(normalizeReportTimes(['9:00', '09:00', '21', 'x', '08:00', '10:30', null, 7]), ['09:00', '21:00']);
  assert.deepStrictEqual(normalizeReportTimes(null), []);
  assert.deepStrictEqual(normalizeReportTimes('09:00'), []);
});

test('Reports: the master report only rides on a slot the person receives', () => {
  assert.deepStrictEqual(masterTimesFor(['09:00', '21:00'], ['21:00', '06:00']), ['21:00']);
  assert.deepStrictEqual(masterTimesFor([], ['21:00']), []);
  assert.deepStrictEqual(toggleSlot(['09:00'], '21:00'), ['09:00', '21:00']);
  assert.deepStrictEqual(toggleSlot(['09:00', '21:00'], '21:00'), ['09:00']);
});
