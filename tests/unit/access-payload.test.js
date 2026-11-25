const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { buildPermissionPayload } = require('../../lib/access-payload');
const { computePermissions } = require('../../lib/auth/permissions');

test('turning Inbox off also turns the whatsapp alias off (stale row ignored)', () => {
  const rows = buildPermissionPayload({ inbox: 'none', whatsapp: 'edit', leads: 'view' });
  assert.deepStrictEqual(rows.find((r) => r.module_name === 'whatsapp'), { module_name: 'whatsapp', access_level: 'none' });
  const eff = computePermissions({ role: 'Sales', role_exists: true, role_permissions: rows, user_permissions: [] }).permissions;
  assert.strictEqual(eff.inbox, 'none');
  assert.strictEqual(eff.whatsapp, 'none');
});

test('no inbox value → no whatsapp row written', () => {
  const rows = buildPermissionPayload({ leads: 'edit', whatsapp: 'edit' });
  assert.ok(!rows.some((r) => r.module_name === 'whatsapp'));
});
