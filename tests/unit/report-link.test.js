const test = require('node:test');
const assert = require('node:assert');
require('../setup');
process.env.CRON_SECRET = 'test-secret-for-report-links';
const { signReportToken, verifyReportToken } = require('../../lib/reports/report-link');
const { reportTemplateValues } = require('../../lib/reports/lead-report');

const start = new Date('2026-11-27T12:30:00Z'), end = new Date('2026-11-27T15:30:00Z');

test('a signed link opens exactly its own window', () => {
  const w = verifyReportToken(signReportToken(start, end));
  assert.strictEqual(w.start.getTime(), start.getTime());
  assert.strictEqual(w.end.getTime(), end.getTime());
});

test('a link can not be changed, forged or reused after it expires', () => {
  const t = signReportToken(start, end);
  const [payload, mac] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ s: 0, e: Date.now(), x: Date.now() + 1e9 })).toString('base64url');
  assert.strictEqual(verifyReportToken(`${forged}.${mac}`), null);          // dates edited
  assert.strictEqual(verifyReportToken(`${payload}.${mac}x`), null);        // signature edited
  assert.strictEqual(verifyReportToken('abc'), null);
  assert.strictEqual(verifyReportToken(''), null);
  assert.strictEqual(verifyReportToken(null), null);
  assert.strictEqual(verifyReportToken(t, new Date(Date.now() + 8 * 864e5)), null); // after 7 days
});

test('a huge window is refused (nobody can download the whole database)', () => {
  assert.strictEqual(verifyReportToken(signReportToken(new Date('2020-01-01'), new Date('2026-01-01'))), null);
});

test('the template gets six single-line values in the right order', () => {
  const v = reportTemplateValues({ windowStartIso: start.toISOString(), windowEndIso: end.toISOString(), windowTotal: 3 }, 'https://x.test/r?token=abc', new Date('2026-11-27T15:30:00Z'));
  assert.strictEqual(v.length, 6);
  assert.match(v[1], /^9 PM Report \(6 PM – 9 PM\)$/);
  assert.match(v[2], /^27\/11\/2026 at 09:00 pm$/);
  assert.match(v[3], /^27\/11\/2026, 06:00 pm – 27\/11\/2026, 09:00 pm$/);
  assert.strictEqual(v[4], '3');
  assert.strictEqual(v[5], 'https://x.test/r?token=abc');
  for (const x of v) assert.ok(!/[\n\r\t]/.test(x));
});
