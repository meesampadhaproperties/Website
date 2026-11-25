const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const imp = require('../../lib/lead-import');

const lists = {
  sources: [{ key: 'youtube', name: 'Youtube' }, { key: 'google_ads', name: 'Google Ads' }],
  statuses: [{ key: 'new', name: 'New' }, { key: 'contacted', name: 'Contacted' }],
  projects: [{ id: 'p1', name: 'Arudra Premium Villa Plots' }],
};

test('import: headers map by name, including template "*" marks and aliases', () => {
  const map = imp.mapHeaders(['Name ', 'Mobile', 'E-mail', 'Lead Source', 'Status', 'Project', 'Enquiry Type', 'City', 'Message', 'Created At', 'Random']);
  assert.deepStrictEqual(Object.values(map), ['name', 'phone', 'email', 'source', 'status', 'project', 'enquiry_type', 'location', 'notes', 'date']);
  assert.strictEqual(map[10], undefined);
});

test('import: cell values from Excel become plain text', () => {
  assert.strictEqual(imp.cellText(9876543210), '9876543210');
  assert.strictEqual(imp.cellText({ richText: [{ text: 'Ra' }, { text: 'vi' }] }), 'Ravi');
  assert.strictEqual(imp.cellText({ text: 'a@b.com', hyperlink: 'mailto:a@b.com' }), 'a@b.com');
  assert.strictEqual(imp.cellText({ formula: 'A1', result: 42 }), '42');
  assert.strictEqual(imp.cellText(null), '');
});

test('import: dates (DD/MM/YYYY, ISO, Excel date cells), invalid and future rejected', () => {
  assert.strictEqual(imp.parseImportDate('20/11/2026').iso, '2026-11-20T06:30:00.000Z');
  assert.strictEqual(imp.parseImportDate('2026-11-20T00:00:00.000Z').iso, '2026-11-20T06:30:00.000Z');
  assert.deepStrictEqual(imp.parseImportDate(''), { ok: true, iso: null });
  assert.match(imp.parseImportDate('31/02/2026').error, /real date/);
  assert.match(imp.parseImportDate('tomorrow').error, /DD\/MM\/YYYY/);
  assert.match(imp.parseImportDate('01/01/2099').error, /future/);
});

test('import: a good row is cleaned (names → keys, defaults)', () => {
  const res = imp.validateImportRow({ row: 2, name: ' Ravi ', phone: '098765 43210', source: 'google ads', project: 'arudra premium villa plots', enquiry_type: 'site visit', notes: 'Call after 6' }, lists);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.value.name, 'Ravi');
  assert.strictEqual(res.value.phoneKey, '+919876543210');
  assert.strictEqual(res.value.source, 'google_ads');
  assert.strictEqual(res.value.status, 'new');
  assert.deepStrictEqual(res.value.project, { id: 'p1', name: 'Arudra Premium Villa Plots' });
  assert.strictEqual(res.value.enquiryType, 'Site visit');
  assert.strictEqual(res.value.email, null);
});

test('import: every problem in a row is reported', () => {
  const res = imp.validateImportRow({ row: 7, phone: '12345', email: 'bad', source: 'Billboard', status: 'Won', project: 'Nowhere', enquiry_type: 'Gossip', date: '99/99/2026' }, lists);
  assert.strictEqual(res.ok, false);
  const text = res.errors.join(' | ');
  for (const bit of ['Name is missing', "isn't a valid number", 'Email', 'Source "Billboard"', 'Status "Won"', 'Project "Nowhere"', 'Enquiry Type "Gossip"', 'Date']) {
    assert.ok(text.includes(bit), bit);
  }
});
