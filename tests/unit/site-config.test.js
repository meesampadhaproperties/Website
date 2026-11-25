const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const KEYS = ['NEXT_PUBLIC_SITE_URL', 'SITE_URL', 'NEXT_PUBLIC_BASE_URL', 'NODE_ENV'];
function withEnv(env, fn) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  try { return fn(require('../../lib/site-config')); } finally {
    KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  }
}

test('site URL: configured value wins and loses trailing slash', () => withEnv({ NEXT_PUBLIC_SITE_URL: 'https://crm.client.com/' }, (c) => {
  assert.strictEqual(c.resolveSiteUrl('evil.com', 'https'), 'https://crm.client.com');
}));

test('site URL: legacy NEXT_PUBLIC_BASE_URL still read', () => withEnv({ NEXT_PUBLIC_BASE_URL: 'https://old.client.com' }, (c) => {
  assert.strictEqual(c.resolveSiteUrl(), 'https://old.client.com');
}));

test('site URL: falls back to the request host (https by default, http for localhost)', () => withEnv({}, (c) => {
  assert.strictEqual(c.resolveSiteUrl('crm.client.com', null), 'https://crm.client.com');
  assert.strictEqual(c.resolveSiteUrl('localhost:3000', null), 'http://localhost:3000');
  assert.strictEqual(c.resolveSiteUrl('a.com, b.com', 'https, http'), 'https://a.com');
}));

test('site URL: never a silent localhost link in production', () => withEnv({ NODE_ENV: 'production' }, (c) => {
  assert.throws(() => c.resolveSiteUrl(), /NEXT_PUBLIC_SITE_URL/);
}));

test('site URL: localhost only in development', () => withEnv({ NODE_ENV: 'development' }, (c) => {
  assert.strictEqual(c.resolveSiteUrl(), 'http://localhost:3000');
}));

test('storage limit: STORAGE_LIMIT_GB per client plan, default 1 GB (Free)', () => {
  const saved = process.env.STORAGE_LIMIT_GB;
  const c = require('../../lib/site-config');
  delete process.env.STORAGE_LIMIT_GB;
  assert.strictEqual(c.getStorageLimitBytes(), 1024 ** 3);
  process.env.STORAGE_LIMIT_GB = '100';
  assert.strictEqual(c.getStorageLimitBytes(), 100 * 1024 ** 3);
  process.env.STORAGE_LIMIT_GB = 'abc';
  assert.strictEqual(c.getStorageLimitBytes(), 1024 ** 3);
  if (saved === undefined) delete process.env.STORAGE_LIMIT_GB; else process.env.STORAGE_LIMIT_GB = saved;
});

test('public site never shows a placeholder brand like "CRM"', () => {
  const saved = process.env.NEXT_PUBLIC_COMPANY_NAME;
  const load = (name) => {
    const p = require.resolve('../../lib/site-config');
    delete require.cache[p];
    if (name === undefined) delete process.env.NEXT_PUBLIC_COMPANY_NAME; else process.env.NEXT_PUBLIC_COMPANY_NAME = name;
    return require(p);
  };
  try {
    for (const placeholder of ['CRM', 'crm', undefined]) {
      const c = load(placeholder);
      assert.strictEqual(c.SITE_BRAND, '');
      assert.strictEqual(c.siteTitle('About'), 'About');
    }
    const real = load('Nagaraju Developers');
    assert.strictEqual(real.SITE_BRAND, 'Nagaraju Developers');
    assert.strictEqual(real.siteTitle('About'), 'About | Nagaraju Developers');
  } finally {
    load(saved);
  }
});
