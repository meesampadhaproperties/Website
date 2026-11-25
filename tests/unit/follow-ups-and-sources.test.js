const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const fu = require('../../lib/lead-status');
const src = require('../../lib/lead-source');

// 23 Nov 2026, 20:19 IST
const NOW = new Date('2026-11-23T14:49:00.000Z');

test('follow up: IST date + time becomes the right UTC instant', () => {
  assert.strictEqual(fu.followUpToIso('2026-11-24', '10:00'), '2026-11-24T04:30:00.000Z');
  assert.strictEqual(fu.followUpToIso('24-11-2026', '10:00'), null);
  assert.strictEqual(fu.followUpToIso('2026-11-24', '10am'), null);
});

test('follow up: IST parts round-trip for the edit form', () => {
  assert.deepStrictEqual(fu.isoToFollowUpParts('2026-11-24T04:30:00.000Z'), { date: '2026-11-24', time: '10:00' });
  assert.deepStrictEqual(fu.isoToFollowUpParts('2026-11-23T18:30:00.000Z'), { date: '2026-11-24', time: '00:00' });
  assert.strictEqual(fu.isoToFollowUpParts(null), null);
});

test('follow up: a time that already passed is rejected (the 10 AM "Today" bug)', () => {
  const r = fu.validateFollowUp({ date: '2026-11-23', time: '10:00', note: 'Today' }, NOW.getTime());
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /already passed/);
});

test('follow up: future time with a note is accepted; note trimmed and capped', () => {
  const r = fu.validateFollowUp({ date: '2026-11-24', time: '10:00', note: `  ${'x'.repeat(1200)}  ` }, NOW.getTime());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.iso, '2026-11-24T04:30:00.000Z');
  assert.strictEqual(r.note.length, fu.FOLLOW_UP_NOTE_MAX);
});

test('follow up: note and valid date/time are required', () => {
  assert.match(fu.validateFollowUp({ date: '2026-11-24', time: '10:00', note: '   ' }, NOW.getTime()).error, /note/);
  assert.match(fu.validateFollowUp({ date: '', time: '10:00', note: 'x' }, NOW.getTime()).error, /valid/);
  assert.match(fu.validateFollowUp(null, NOW.getTime()).error, /valid/);
});

test('follow up: overdue / today / upcoming use IST days', () => {
  assert.strictEqual(fu.followUpDueState('2026-11-23T04:30:00.000Z', NOW), 'overdue'); // 10:00 IST today, passed
  assert.strictEqual(fu.followUpDueState('2026-11-23T17:00:00.000Z', NOW), 'today'); // 22:30 IST today
  assert.strictEqual(fu.followUpDueState('2026-11-23T18:30:00.000Z', NOW), 'upcoming'); // 00:00 IST tomorrow
  assert.strictEqual(fu.followUpDueState(null, NOW), null);
});

test('follow up: default slot is the next full hour in IST', () => {
  assert.deepStrictEqual(fu.defaultFollowUpSlot(NOW), { date: '2026-11-23', time: '21:00' });
  assert.deepStrictEqual(fu.defaultFollowUpSlot(new Date('2026-11-23T18:10:00.000Z')), { date: '2026-11-24', time: '00:00' });
});

test('follow up: history labels are plain language', () => {
  assert.strictEqual(fu.activityLabel('follow_up_scheduled'), 'Follow up scheduled');
  assert.strictEqual(fu.activityLabel('follow_up_done'), 'Follow up done');
  assert.strictEqual(fu.activityLabel('meta_form_submission'), 'Form submitted');
  assert.strictEqual(fu.activityLabel('Requested Callback'), 'Requested callback');
  assert.strictEqual(fu.activityLabel(''), 'Activity');
  assert.ok(fu.isFollowUpActivity('follow_up_removed'));
  assert.ok(!fu.isFollowUpActivity('meta_form_submission'));
});

test('follow up is not a status: the old key is reserved', () => {
  assert.ok(fu.isReservedStatusKey('follow_up'));
  assert.ok(fu.isReservedStatusKey(' Follow_Up '));
  assert.ok(!fu.isReservedStatusKey('contacted'));
  assert.strictEqual(fu.FOLLOW_UP_STATUS_KEY, undefined);
});

test('source: Meta leads are auto-captured and locked', () => {
  assert.ok(src.isAutoCapturedLead('meta_webhook_123', null));
  assert.ok(src.isAutoCapturedLead('Meta: Form (1) | Ad: x', null));
  assert.ok(src.isAutoCapturedLead('', 'form123'));
  assert.ok(!src.isAutoCapturedLead('meta', null)); // manually picked "Meta" stays editable
  assert.ok(!src.isAutoCapturedLead('Reference', null));
  assert.deepStrictEqual(src.resolveLeadSource('youtube', { source_page: 'meta_cron_9', form_id: null }, ['youtube']), { ok: true, locked: true });
});

test('source: new leads must pick a configured source (stored as its key)', () => {
  const keys = ['whatsapp', 'youtube', 'google_ads', 'meta', 'website'];
  assert.deepStrictEqual(src.resolveLeadSource('YouTube', null, keys), { ok: true, locked: false, source: 'youtube' });
  assert.match(src.resolveLeadSource('', null, keys).error, /choose a source/);
  assert.match(src.resolveLeadSource('Reference', null, keys).error, /Modules/);
});

test('source: editing keeps an older free-text source unless changed', () => {
  const keys = ['youtube'];
  const current = { source_page: 'Reference', form_id: null };
  assert.deepStrictEqual(src.resolveLeadSource('Reference', current, keys), { ok: true, locked: false, source: 'Reference' });
  assert.deepStrictEqual(src.resolveLeadSource('youtube', current, keys), { ok: true, locked: false, source: 'youtube' });
  assert.match(src.resolveLeadSource('Something else', current, keys).error, /Modules/);
});

test('source: badges show the configured name for a key', () => {
  const options = [{ key: 'google_ads', name: 'Google Ads' }];
  assert.strictEqual(src.sourceLabel('google_ads', options), 'Google Ads');
  assert.strictEqual(src.sourceLabel('Reference', options), 'Reference');
  assert.strictEqual(src.matchSourceOption('GOOGLE_ADS', options).name, 'Google Ads');
});

test('inbox: only leads with a Meta form id (manual and other sources excluded)', () => {
  const calls = [];
  const fakeQuery = { not: (...args) => { calls.push(args); return fakeQuery; } };
  assert.strictEqual(src.onlyMetaLeads(fakeQuery), fakeQuery);
  assert.deepStrictEqual(calls, [['form_id', 'is', null]]);
});
