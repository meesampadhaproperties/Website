const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const {
  CRM_TIMEZONE,
  getDayBoundsIst,
  getTodayBoundsIst,
  getIstCurrentDateString,
  getIstYesterdayDateString,
  getIstDaysAgoDateString,
  formatIstDateTime,
} = require('@/lib/timezone.ts');

test('Timezone: Canonical timezone is Asia/Kolkata', () => {
  assert.strictEqual(CRM_TIMEZONE, 'Asia/Kolkata');
});

test('Timezone: getDayBoundsIst creates exact UTC bounds for IST day (00:00:00 to 23:59:59.999)', () => {
  // Test for a specific date: 2026-09-24
  const bounds = getDayBoundsIst('2026-09-24');
  
  // 2026-09-24 00:00:00 +05:30 in UTC is 2026-09-23 18:30:00.000Z
  assert.strictEqual(bounds.startUtc, '2026-09-23T18:30:00.000Z');
  // 2026-09-24 23:59:59.999 +05:30 in UTC is 2026-09-24 18:29:59.999Z
  assert.strictEqual(bounds.endUtc, '2026-09-24T18:29:59.999Z');
  assert.strictEqual(bounds.dateStr, '2026-09-24');
});

test('Timezone: Lead creation in early morning IST correctly falls inside the day window', () => {
  const bounds = getDayBoundsIst('2026-09-24');
  
  // 2:00 AM IST on Sept 24 = 2026-09-23T20:30:00.000Z
  const leadEarlyMorning = '2026-09-23T20:30:00.000Z';
  const leadTime = new Date(leadEarlyMorning).getTime();
  const startTime = new Date(bounds.startUtc).getTime();
  const endTime = new Date(bounds.endUtc).getTime();

  assert.ok(leadTime >= startTime, 'Early morning 2 AM IST lead must be >= startUtc');
  assert.ok(leadTime <= endTime, 'Early morning 2 AM IST lead must be <= endUtc');
});

test('Timezone: Lead creation at 11:59 PM IST correctly falls inside the day window', () => {
  const bounds = getDayBoundsIst('2026-09-24');
  
  // 11:45 PM IST on Sept 24 = 2026-09-24T18:15:00.000Z
  const leadLateNight = '2026-09-24T18:15:00.000Z';
  const leadTime = new Date(leadLateNight).getTime();
  const startTime = new Date(bounds.startUtc).getTime();
  const endTime = new Date(bounds.endUtc).getTime();

  assert.ok(leadTime >= startTime, 'Late night 11:45 PM IST lead must be >= startUtc');
  assert.ok(leadTime <= endTime, 'Late night 11:45 PM IST lead must be <= endUtc');
});

test('Timezone: Lead from next day 00:01 AM IST is excluded from today', () => {
  const bounds = getDayBoundsIst('2026-09-24');
  
  // 00:01 AM IST on Sept 25 = 2026-09-24T18:31:00.000Z
  const leadNextDay = '2026-09-24T18:31:00.000Z';
  const leadTime = new Date(leadNextDay).getTime();
  const endTime = new Date(bounds.endUtc).getTime();

  assert.ok(leadTime > endTime, 'Next day lead must be strictly after endUtc');
});

test('Timezone: getIstCurrentDateString, yesterday, and days ago generate valid YYYY-MM-DD', () => {
  const today = getIstCurrentDateString();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

  const yesterday = getIstYesterdayDateString();
  assert.match(yesterday, /^\d{4}-\d{2}-\d{2}$/);

  const sevenDaysAgo = getIstDaysAgoDateString(7);
  assert.match(sevenDaysAgo, /^\d{4}-\d{2}-\d{2}$/);
});

test('Timezone: formatIstDateTime formats cleanly into date and time in IST', () => {
  // 2026-09-24T18:30:00.000Z is 2026-09-25 00:00 AM IST
  const formatted = formatIstDateTime('2026-09-24T18:30:00.000Z');
  assert.ok(formatted.date.includes('2026'));
  assert.ok(formatted.time);
  assert.ok(formatted.full);

  // Null/Empty safe handling
  const emptyFormatted = formatIstDateTime(null);
  assert.strictEqual(emptyFormatted.date, '—');
});
