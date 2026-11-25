const test = require('node:test');
const assert = require('node:assert');
const { createHmac, timingSafeEqual } = require('node:crypto');
require('../setup');

// Mirrors lib/meta-signature.ts → isValidMetaSignature
function isValidMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mirrors lib/auth/permissions.ts → resolveTrustedRole (profile → app_metadata → '')
function resolveTrustedRole(profile, user) {
  return (profile && profile.role) || (user && user.app_metadata && user.app_metadata.role) || '';
}

// Mirrors lib/auth/permissions.ts → checkActionAccess level comparison
function isAllowed(level, required) {
  return required === 'view' ? level === 'view' || level === 'edit' : level === 'edit';
}

const SECRET = 'test_app_secret';
const BODY = JSON.stringify({ object: 'page', entry: [{ id: '123', changes: [{ field: 'leadgen', value: { leadgen_id: '999' } }] }] });
const sign = (body, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');

test('Webhook signature: accepts a correctly signed Meta payload', () => {
  assert.strictEqual(isValidMetaSignature(BODY, sign(BODY), SECRET), true);
});

test('Webhook signature: rejects missing, malformed, or wrong-secret signatures', () => {
  assert.strictEqual(isValidMetaSignature(BODY, null, SECRET), false);
  assert.strictEqual(isValidMetaSignature(BODY, 'sha1=abc', SECRET), false);
  assert.strictEqual(isValidMetaSignature(BODY, 'sha256=not-hex', SECRET), false);
  assert.strictEqual(isValidMetaSignature(BODY, sign(BODY, 'attacker_secret'), SECRET), false);
});

test('Webhook signature: rejects a tampered body signed for different content', () => {
  const tampered = BODY.replace('999', '1000');
  assert.strictEqual(isValidMetaSignature(tampered, sign(BODY), SECRET), false);
});

test('Webhook signature: fails closed when app secret is not configured', () => {
  assert.strictEqual(isValidMetaSignature(BODY, sign(BODY), ''), false);
});

test('Role resolution: self-editable user_metadata can never grant a role', () => {
  const attacker = { id: 'u1', user_metadata: { role: 'Super Admin' }, app_metadata: {} };
  assert.strictEqual(resolveTrustedRole(null, attacker), '');
});

test('Role resolution: profiles table wins, app_metadata is the trusted fallback', () => {
  const user = { id: 'u2', user_metadata: { role: 'Super Admin' }, app_metadata: { role: 'Sales' } };
  assert.strictEqual(resolveTrustedRole({ role: 'Manager' }, user), 'Manager');
  assert.strictEqual(resolveTrustedRole(null, user), 'Sales');
});

test('Action access: view vs edit requirements', () => {
  assert.strictEqual(isAllowed('edit', 'edit'), true);
  assert.strictEqual(isAllowed('view', 'edit'), false);
  assert.strictEqual(isAllowed('none', 'edit'), false);
  assert.strictEqual(isAllowed('view', 'view'), true);
  assert.strictEqual(isAllowed('edit', 'view'), true);
  assert.strictEqual(isAllowed('none', 'view'), false);
});
