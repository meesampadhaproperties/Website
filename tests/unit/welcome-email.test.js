const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { renderWelcomeEmail, normalizeWelcomeConfig, DEFAULT_WELCOME_EMAIL } = require('../../lib/welcome-email');

const cfg = (o = {}) => ({ ...DEFAULT_WELCOME_EMAIL, ...o });

test('welcome email fills the first name and project per customer', () => {
  const m = renderWelcomeEmail(cfg(), { name: 'Ravi Kumar', project: 'Green Valley' }, 'Mee Sampadha');
  assert.strictEqual(m.subject, 'Welcome, Ravi!');
  assert.ok(m.html.includes('Green Valley'));
  assert.ok(m.text.includes('Welcome, Ravi!'));
});

test('missing name and project fall back to friendly words', () => {
  const m = renderWelcomeEmail(cfg(), { name: '', project: null }, 'Mee Sampadha');
  assert.strictEqual(m.subject, 'Welcome, there!');
  assert.ok(m.html.includes('our project'));
});

test('customer-typed values can never inject HTML', () => {
  const m = renderWelcomeEmail(cfg(), { name: '<script>alert(1)</script>', project: '"><img src=x onerror=alert(1)>' }, 'Co');
  assert.ok(!/<script/i.test(m.html));
  assert.ok(!/<img src=x/i.test(m.html));
});

test('a line break in a name can not split the subject line', () => {
  const m = renderWelcomeEmail(cfg({ subject: 'Hi {full_name}' }), { name: 'A\r\nBcc: x@y.com' }, 'Co');
  assert.ok(!/[\r\n]/.test(m.subject));
});

test('logo only shows for a real http(s) link, otherwise the company name is used', () => {
  assert.ok(renderWelcomeEmail(cfg({ logoUrl: 'https://x.test/l.png' }), { name: 'A' }, 'Co').html.includes('l.png'));
  const bad = renderWelcomeEmail(cfg({ logoUrl: 'javascript:alert(1)' }), { name: 'A' }, 'Co');
  assert.ok(!bad.html.includes('javascript:'));
});

test('bad saved settings fall back to safe defaults', () => {
  const c = normalizeWelcomeConfig({ enabled: 'yes', subject: 5, brandColor: 'red; background:url(x)', body: 'ok' });
  assert.strictEqual(c.enabled, false);
  assert.strictEqual(c.subject, DEFAULT_WELCOME_EMAIL.subject);
  assert.strictEqual(c.brandColor, DEFAULT_WELCOME_EMAIL.brandColor);
  assert.strictEqual(c.body, 'ok');
  assert.strictEqual(normalizeWelcomeConfig(null).enabled, false);
});
