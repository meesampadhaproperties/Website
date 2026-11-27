const test = require('node:test');
const assert = require('node:assert');
require('../setup');
process.env.CRON_SECRET = 'test-secret-for-report-links';
const { signReportToken, signMasterToken, verifyReportToken } = require('../../lib/reports/report-link');
const { reportTemplateValues, renderReportEmail, reportFileNames, reportTitle } = require('../../lib/reports/lead-report');

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

test('the master link covers everything up to its time, and only it may span more than a month', () => {
  const w = verifyReportToken(signMasterToken(end));
  assert.strictEqual(w.master, true);
  assert.strictEqual(w.start.getTime(), 0);
  assert.strictEqual(w.end.getTime(), end.getTime());
  assert.strictEqual(verifyReportToken(signReportToken(start, end)).master, false);
});

test('report title, file names and email follow the example', () => {
  const r = { windowStartIso: start.toISOString(), windowEndIso: end.toISOString(), windowTotal: 1 };
  assert.strictEqual(reportTitle(r), '9 PM Report (6 PM – 9 PM)');
  assert.deepStrictEqual(reportFileNames(r), { report: 'leads_report_2026-11-27_09pm.xlsx', master: 'master_leads_report_till_2026-11-27_09pm.xlsx' });
  const e = renderReportEmail(r, 'Mee Sampadha', false, true);
  assert.strictEqual(e.subject, '[Mee Sampadha CRM] 9 PM Report (6 PM – 9 PM)');
  assert.match(e.html, /Mee Sampadha Leads Report/);
  assert.match(e.html, /Total leads in this report: <b>1<\/b>/);
  assert.match(e.html, /master report/);
  assert.doesNotMatch(renderReportEmail(r, 'Mee Sampadha').html, /master report/);
  assert.match(renderReportEmail(r, '<b>X</b>').html, /&lt;b&gt;X&lt;\/b&gt;/); // company name is escaped
});

test('the 6 AM report spans midnight in its title', () => {
  const r = { windowStartIso: '2026-11-27T15:30:00Z', windowEndIso: '2026-11-28T00:30:00Z' };
  assert.strictEqual(reportTitle(r), '6 AM Report (9 PM – 6 AM)');
});
