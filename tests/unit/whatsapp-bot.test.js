const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { parseIncoming, routeAction, projectRows, projectText, clip, documentFileName, PROJECTS_PER_PAGE } = require('../../lib/whatsapp-bot-core');

const ID = '3f2b8c1e-0d4a-4e8b-9c11-2a7d5e6f7a80';
const payload = (messages, contacts = [{ wa_id: '918977036622', profile: { name: 'Ravi' } }]) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { contacts, messages } }] }],
});

test('parses a typed message and a button tap', () => {
  const [a, b] = parseIncoming(payload([
    { id: 'w1', from: '918977036622', timestamp: '1700000000', type: 'text', text: { body: ' hi ' } },
    { id: 'w2', from: '918977036622', timestamp: '1700000001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'explore', title: 'Explore projects' } } },
  ]));
  assert.strictEqual(a.text, 'hi'); assert.strictEqual(a.name, 'Ravi'); assert.strictEqual(a.actionId, null);
  assert.strictEqual(b.actionId, 'explore'); assert.strictEqual(b.text, '');
});

test('ignores delivery receipts, other objects and junk', () => {
  assert.deepStrictEqual(parseIncoming({ object: 'page', entry: [] }), []);
  assert.deepStrictEqual(parseIncoming({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x' }] } }] }] }), []);
  assert.deepStrictEqual(parseIncoming(null), []);
  assert.deepStrictEqual(parseIncoming(payload([{ type: 'text' }])), []);
});

test('any text, media or unknown button shows the welcome menu', () => {
  for (const actionId of [null, '', 'menu', 'nonsense', 'proj:not-a-uuid', "proj:'; drop table--"]) assert.strictEqual(routeAction({ actionId }).kind, 'welcome', String(actionId));
});

test('buttons route to the right step', () => {
  assert.deepStrictEqual(routeAction({ actionId: 'explore' }), { kind: 'explore', page: 1 });
  assert.deepStrictEqual(routeAction({ actionId: 'page:3' }), { kind: 'explore', page: 3 });
  assert.deepStrictEqual(routeAction({ actionId: `proj:${ID}` }), { kind: 'project', id: ID });
  assert.strictEqual(routeAction({ actionId: 'contact' }).kind, 'contact');
});

test('the project list fits WhatsApp limits and pages after 9', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, title: `Project number ${i} with a very long name`, location: 'L'.repeat(200) }));
  const p1 = projectRows(many, 1);
  assert.strictEqual(p1.rows.length, PROJECTS_PER_PAGE + 1);
  assert.strictEqual(p1.rows[9].id, 'page:2');
  for (const r of p1.rows) { assert.ok(r.title.length <= 24); assert.ok((r.description || '').length <= 72); }
  const last = projectRows(many, 3);
  assert.strictEqual(last.rows.length, 2); // 20 = 9 + 9 + 2, and no "More" on the last page
  assert.ok(!last.rows.some((r) => r.id.startsWith('page:')));
  assert.strictEqual(projectRows(many, 99).page, 3);
  assert.strictEqual(projectRows([], 1).rows.length, 0);
});

test('project text and file names are tidy', () => {
  const t = projectText({ title: 'Green Valley', location: 'Shamshabad', tags: ['Plots', 'DTCP'], points: ['Gated', 'Near ORR'], mapUrl: 'https://maps.example/x' });
  assert.ok(t.startsWith('*Green Valley*')); assert.ok(t.includes('• Gated')); assert.ok(t.includes('https://maps.example/x'));
  assert.strictEqual(documentFileName('Brochure 2026', 'a/b/x.pdf'), 'Brochure 2026.pdf');
  assert.strictEqual(documentFileName('../../evil/<name>', null), 'evilname.pdf');
  assert.strictEqual(clip('abcdefghij', 5), 'abcd…');
});
