const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const phone = require('../../lib/lead-phone');
const fields = require('../../lib/lead-fields');

test('same person: one phone number in any format', () => {
  const key = '+919876543210';
  for (const p of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '098765-43210', '+91-9876543210']) {
    assert.strictEqual(phone.phoneMatchKey(p), key, p);
  }
  assert.ok(phone.isSamePhone('98765 43210', '+919876543210'));
  assert.ok(!phone.isSamePhone('9876543210', '9876543211'));
  assert.strictEqual(phone.phoneMatchKey('12345'), ''); // too short to identify anyone
  assert.ok(!phone.isSamePhone('', ''));
});

test('same person: candidate pattern finds every stored format of the last 10 digits', () => {
  assert.strictEqual(phone.phoneCandidatePattern('+91 98765 43210'), '%9%8%7%6%5%4%3%2%1%0%');
  assert.strictEqual(phone.phoneCandidatePattern('123'), null);
});

test('same person: only exact key matches are kept from loose candidates, oldest first', async () => {
  const rows = [
    { id: 'a', phone: '+91 98765 43210', created_at: '2026-11-01' },
    { id: 'b', phone: '9876543210', created_at: '2026-11-02' },
    { id: 'c', phone: '1987654321 0', created_at: '2026-11-03' }, // loose match only
  ];
  const calls = [];
  const builder = {
    select: (c) => { calls.push(['select', c]); return builder; },
    ilike: (col, pat) => { calls.push(['ilike', col, pat]); return builder; },
    order: () => builder,
    limit: async () => ({ data: rows, error: null }),
  };
  const db = { from: (t) => { calls.push(['from', t]); return builder; } };
  const found = await phone.findLeadsByPhone(db, '09876543210');
  assert.deepStrictEqual(found.map((r) => r.id), ['a', 'b']);
  assert.deepStrictEqual(calls[0], ['from', 'leads']);
  assert.deepStrictEqual(await phone.findLeadsByPhone(db, ''), []);
});

test('projects: chosen from the Projects page list, old typed value kept until changed', () => {
  const projects = [{ id: 'p1', name: 'Arudra' }, { id: 'p2', name: 'Yadadri' }];
  assert.deepStrictEqual(fields.resolveProjectChoice('p2', null, projects), { ok: true, keep: false, value: { id: 'p2', name: 'Yadadri' } });
  assert.deepStrictEqual(fields.resolveProjectChoice('', null, projects), { ok: true, keep: false, value: null });
  assert.deepStrictEqual(fields.resolveProjectChoice(fields.KEEP_CURRENT, { project: 'XYZ' }, projects), { ok: true, keep: true });
  assert.match(fields.resolveProjectChoice('nope', null, projects).error, /Projects page/);
  assert.strictEqual(fields.matchProjectOption({ project: 'arudra' }, projects).id, 'p1');
  assert.strictEqual(fields.matchProjectOption({ project: 'XYZ' }, projects), undefined);
});

test('enquiry type: fixed list, old typed value kept until changed', () => {
  assert.deepStrictEqual(fields.resolveEnquiryType('site visit', null), { ok: true, keep: false, value: 'Site visit' });
  assert.deepStrictEqual(fields.resolveEnquiryType('', 'Brochure'), { ok: true, keep: false, value: null });
  assert.deepStrictEqual(fields.resolveEnquiryType(fields.KEEP_CURRENT, 'Callback'), { ok: true, keep: true });
  assert.match(fields.resolveEnquiryType('Callback', null).error, /list/);
});

test('repeat enquiries: projects list is latest first, no duplicates', () => {
  assert.deepStrictEqual(fields.mergeEnquiryProjects(['Arudra'], 'Shabad', true), ['Shabad', 'Arudra']);
  assert.deepStrictEqual(fields.mergeEnquiryProjects(['Shabad', 'Arudra'], 'arudra', true), ['arudra', 'Shabad']);
  // an OLDER submission arriving late only appends a new project
  assert.deepStrictEqual(fields.mergeEnquiryProjects(['Shabad'], 'Arudra', false), ['Shabad', 'Arudra']);
  assert.deepStrictEqual(fields.mergeEnquiryProjects(['Shabad', 'Arudra'], 'Arudra', false), ['Shabad', 'Arudra']);
  assert.deepStrictEqual(fields.mergeEnquiryProjects(null, null, true), []);
  assert.deepStrictEqual(fields.leadProjectsForDisplay({ project: 'Yadadri', enquiry_projects: ['Arudra', 'Yadadri'] }), ['Yadadri', 'Arudra']);
});

test('repeat enquiries: "New enquiry" only for a returning person who enquired again today (IST)', () => {
  const now = new Date('2026-11-23T14:49:00.000Z'); // 20:19 IST
  assert.ok(fields.isNewRepeatEnquiry({ enquiry_count: 2, last_enquiry_at: '2026-11-23T02:00:00.000Z' }, now));
  assert.ok(!fields.isNewRepeatEnquiry({ enquiry_count: 1, last_enquiry_at: '2026-11-23T02:00:00.000Z' }, now));
  assert.ok(!fields.isNewRepeatEnquiry({ enquiry_count: 3, last_enquiry_at: '2026-11-22T18:00:00.000Z' }, now)); // 23:30 IST yesterday
});
