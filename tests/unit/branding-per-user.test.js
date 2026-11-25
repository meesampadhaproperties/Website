const test = require('node:test');
const assert = require('node:assert');
require('../setup');

function store() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; }
function setupDom() {
  const props = {};
  global.window = { dispatchEvent() {} };
  global.Event = class { constructor(t) { this.type = t; } };
  global.localStorage = store();
  global.sessionStorage = store();
  global.document = { documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } } };
  return props;
}
const login = (userId) => sessionStorage.setItem('crm_user_session', JSON.stringify({ userId }));
const b = () => require('../../lib/branding');

test('hexToRgbTriplet converts hex for the Tailwind brand token', () => {
  assert.strictEqual(b().hexToRgbTriplet('#c4a55a'), '196 165 90');
  assert.strictEqual(b().hexToRgbTriplet('#fff'), '255 255 255');
});

test('each user sees only their own branding on a shared computer', () => {
  setupDom();
  login('alice'); b().saveStoredBrandSettings({ paletteId: 'gold', customAccent: '#ff0000' });
  login('bob');
  assert.strictEqual(b().getStoredBrandSettings().customAccent, '#c4a55a'); // default, NOT alice's red
  b().saveStoredBrandSettings({ paletteId: 'gold', customAccent: '#00ff00' });
  login('alice');
  assert.strictEqual(b().getStoredBrandSettings().customAccent, '#ff0000');
});

test('saving applies accent + rgb variables and caches them for the pre-paint script', () => {
  const props = setupDom();
  login('carol'); b().saveStoredBrandSettings({ paletteId: 'gold', customAccent: '#10b981' });
  assert.strictEqual(props['--crm-accent'], '#10b981');
  assert.strictEqual(props['--crm-accent-rgb'], '16 185 129');
  const cached = JSON.parse(localStorage.getItem('crm_brand_vars:crm_custom_branding_carol'));
  assert.strictEqual(cached['--crm-accent-rgb'], '16 185 129');
});

test('login page (no user) shows the last branding used on this device', () => {
  setupDom();
  login('dave'); b().saveStoredBrandSettings({ paletteId: 'gold', customAccent: '#123456' });
  sessionStorage.removeItem('crm_user_session');
  assert.strictEqual(b().getStoredBrandSettings().customAccent, '#123456');
});
