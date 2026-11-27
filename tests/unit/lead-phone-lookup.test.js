const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { findLeadsByPhone } = require('../../lib/lead-phone');

/** A tiny stand-in for the Supabase client: records the columns asked for and returns the given rows. */
function fakeDb(rows) {
  const seen = { columns: null, limit: null };
  const q = {
    select(c) { seen.columns = c; return q; },
    ilike() { return q; },
    order() { return q; },
    limit(n) { seen.limit = n; return Promise.resolve({ data: rows.slice(0, n), error: null }); },
  };
  return { db: { from: () => q }, seen };
}

test('finds the existing lead even when the caller did not ask for the phone column', async () => {
  const { db, seen } = fakeDb([{ id: 'a', phone: '+916305126335' }]);
  const res = await findLeadsByPhone(db, '916305126335', 'id, enquiry_count', 1);
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].id, 'a');
  assert.match(seen.columns, /\bphone\b/);
});

test('every stored format of the number is the same person', async () => {
  for (const stored of ['6305126335', '+91 63051 26335', '06305126335', '91-6305-126335']) {
    const { db } = fakeDb([{ id: 'x', phone: stored }]);
    assert.strictEqual((await findLeadsByPhone(db, '+916305126335', 'id')).length, 1, stored);
  }
});

test('a loose look-alike number does not hide the real match when a limit is given', async () => {
  const { db, seen } = fakeDb([{ id: 'other', phone: '+916305126335999' }, { id: 'real', phone: '+916305126335' }]);
  const res = await findLeadsByPhone(db, '6305126335', 'id', 1);
  assert.deepStrictEqual(res.map((r) => r.id), ['real']);
  assert.ok(seen.limit >= 50);
});

test('columns "*" are left as they are', async () => {
  const { db, seen } = fakeDb([]);
  await findLeadsByPhone(db, '6305126335', '*');
  assert.strictEqual(seen.columns, '*');
});

test('too-short numbers never match anyone', async () => {
  const { db } = fakeDb([{ id: 'a', phone: '12345' }]);
  assert.deepStrictEqual(await findLeadsByPhone(db, '12345', 'id'), []);
});
