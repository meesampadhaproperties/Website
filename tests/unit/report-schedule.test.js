const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { windowStartFor, currentIstSlot, istToUtc } = require('../../lib/reports/lead-report');

test('Reports: IST slot from a UTC instant', () => {
  // 03:30 UTC = 09:00 IST
  assert.deepStrictEqual(currentIstSlot(new Date('2026-11-22T03:30:00Z')), { date: '2026-11-22', slot: '09:00' });
  // 18:40 UTC on 21st = 00:10 IST on 22nd
  assert.deepStrictEqual(currentIstSlot(new Date('2026-11-21T18:40:00Z')), { date: '2026-11-22', slot: '00:00' });
});

test('Reports: window starts at the previous selected slot today', () => {
  const start = windowStartFor(['09:00', '12:00', '18:00'], '2026-11-22', '12:00');
  assert.strictEqual(start.toISOString(), istToUtc('2026-11-22', '09:00').toISOString());
});

test('Reports: first slot of the day covers since the last slot yesterday (no gaps)', () => {
  const start = windowStartFor(['09:00', '18:00'], '2026-11-22', '09:00');
  assert.strictEqual(start.toISOString(), istToUtc('2026-11-21', '18:00').toISOString());
});

test('Reports: single daily slot covers the previous 24 hours', () => {
  const start = windowStartFor(['09:00'], '2026-11-22', '09:00');
  assert.strictEqual(start.toISOString(), istToUtc('2026-11-21', '09:00').toISOString());
});
