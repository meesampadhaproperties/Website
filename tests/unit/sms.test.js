const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const sms = require('../../lib/sms');

const BODY = 'Dear ##name##, thanks for your interest in ##project##. Visit on ##date##. Call ##name## back - ACME';

test('sms: blanks are found in order without duplicates', () => {
  assert.deepStrictEqual(sms.templateVariables(BODY), ['name', 'project', 'date']);
  assert.deepStrictEqual(sms.templateVariables('No blanks here'), []);
});

test('sms: preview fills blanks and leaves empty ones visible', () => {
  assert.strictEqual(sms.fillTemplate('Hi ##name##, see ##project##', { name: 'Ravi' }), 'Hi Ravi, see ##project##');
});

test('sms: every blank required, max 30 characters, single line', () => {
  assert.match(sms.validateSmsValues(BODY, { name: 'Ravi', project: 'Arudra' }).error, /date/);
  assert.match(sms.validateSmsValues(BODY, { name: 'x'.repeat(31), project: 'A', date: 'Sun' }).error, /30/);
  const ok = sms.validateSmsValues(BODY, { name: ' Ravi\n ', project: 'Arudra', date: 'Sunday 10am', extra: 'ignored' });
  assert.deepStrictEqual(ok, { ok: true, values: { name: 'Ravi', project: 'Arudra', date: 'Sunday 10am' } });
});

test('sms: MSG91 mobile format (country code, digits only)', () => {
  assert.strictEqual(sms.msg91Mobile('+91 98765 43210'), '919876543210');
  assert.strictEqual(sms.msg91Mobile('09876543210'), '919876543210');
  assert.strictEqual(sms.msg91Mobile('12345'), null);
});

test('sms: suggested values for common blanks', () => {
  const lead = { name: 'Ravi Kumar', project: 'Arudra', phone: '9876543210' };
  assert.strictEqual(sms.suggestSmsValue('name', lead), 'Ravi');
  assert.strictEqual(sms.suggestSmsValue('project_name', lead), 'Arudra');
  assert.strictEqual(sms.suggestSmsValue('date', lead), '');
});

test('sms: MSG91 request shape, success and error', async () => {
  let sent;
  const okFetch = async (url, init) => { sent = { url, init }; return { ok: true, status: 200, json: async () => ({ type: 'success', message: 'req-123' }) }; };
  const res = await sms.sendMsg91Sms({ authKey: 'K', templateId: 'T1', mobile: '919876543210', values: { name: 'Ravi' }, fetchImpl: okFetch });
  assert.deepStrictEqual(res, { ok: true, requestId: 'req-123' });
  assert.strictEqual(sent.url, 'https://control.msg91.com/api/v5/flow');
  assert.strictEqual(sent.init.headers.authkey, 'K');
  assert.deepStrictEqual(JSON.parse(sent.init.body), { template_id: 'T1', short_url: '0', recipients: [{ mobiles: '919876543210', name: 'Ravi' }] });

  const errFetch = async () => ({ ok: false, status: 401, json: async () => ({ type: 'error', message: 'Authentication failure' }) });
  assert.deepStrictEqual(await sms.sendMsg91Sms({ authKey: 'K', templateId: 'T1', mobile: '91', values: {}, fetchImpl: errFetch }), { ok: false, error: 'Authentication failure' });

  const downFetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  assert.match((await sms.sendMsg91Sms({ authKey: 'K', templateId: 'T1', mobile: '91', values: {}, fetchImpl: downFetch })).error, /ENOTFOUND/);
});

test('sms: MSG91 balance is read as a number; errors are reported, never thrown', async () => {
  const ok = async () => ({ ok: true, status: 200, text: async () => ' 1250 ' });
  assert.deepStrictEqual(await sms.fetchMsg91Balance('K', '4', ok), { ok: true, credits: 1250 });
  const bad = async () => ({ ok: true, status: 200, text: async () => '{"msg":"x","message":"Authentication failure"}' });
  assert.match((await sms.fetchMsg91Balance('K', '4', bad)).error, /Authentication failure/);
  const down = async () => { throw new Error('offline'); };
  assert.match((await sms.fetchMsg91Balance('K', '4', down)).error, /Could not reach/);
});
