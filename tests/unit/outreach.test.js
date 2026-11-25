const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const o = require('../../lib/outreach');
const sms = require('../../lib/sms');

test('outreach: {name}, {full_name}, {project} filled per lead, with friendly fallbacks', () => {
  const lead = { name: 'Ravi Kumar', project: 'Arudra' };
  assert.strictEqual(o.personalize('Hi {name} ({full_name}), about {project}', lead), 'Hi Ravi (Ravi Kumar), about Arudra');
  assert.strictEqual(o.personalize('Hi {NAME}, {project}', { name: '', project: null }), 'Hi there, our project');
  assert.strictEqual(o.personalize('Keep {unknown}', lead), 'Keep {unknown}');
});

test('outreach: WhatsApp and SMS app links use the full international number and encoded text', () => {
  assert.strictEqual(o.whatsappChatUrl('098765 43210', 'Hi & bye'), 'https://wa.me/919876543210?text=Hi%20%26%20bye');
  assert.strictEqual(o.smsAppUrl('+91 98765 43210', 'Hi?'), 'sms:+919876543210?&body=Hi%3F');
  assert.strictEqual(o.whatsappChatUrl('123', 'x'), null);
  assert.strictEqual(o.smsAppUrl(null, 'x'), null);
});

test('outreach: email body is escaped (no HTML injection) with paragraphs and line breaks', () => {
  const html = o.textToEmailHtml('Hi <b>Ravi</b> & co\nline two\n\nNew para');
  assert.ok(html.includes('Hi &lt;b&gt;Ravi&lt;/b&gt; &amp; co<br>line two</p>'));
  assert.ok(html.includes('>New para</p>'));
  assert.ok(!html.includes('<b>'));
});

test('outreach: email validation', () => {
  assert.ok(o.isValidEmail('a.b@example.com'));
  assert.ok(!o.isValidEmail('no-at-sign'));
  assert.ok(!o.isValidEmail(null));
});

test('sms: many recipients go in ONE MSG91 call, each with their own values', async () => {
  let body;
  const fetchImpl = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ type: 'success', message: 'bulk-1' }) }; };
  const res = await sms.sendMsg91Sms({ authKey: 'K', templateId: 'T', fetchImpl, recipients: [
    { mobile: '919000000001', values: { name: 'Ravi' } },
    { mobile: '919000000002', values: { name: 'Priya' } },
  ] });
  assert.deepStrictEqual(res, { ok: true, requestId: 'bulk-1' });
  assert.deepStrictEqual(body.recipients, [{ mobiles: '919000000001', name: 'Ravi' }, { mobiles: '919000000002', name: 'Priya' }]);
});
