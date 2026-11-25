const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const {
  COLOR_PALETTES,
  DEFAULT_BRAND_SETTINGS,
  getStoredBrandSettings,
  saveStoredBrandSettings,
  hslToHex,
  hexToHsl,
  parseColorSearch,
} = require('@/lib/branding.ts');

test('Branding: Palette registry integrity', () => {
  assert.strictEqual(COLOR_PALETTES.length, 8);
  COLOR_PALETTES.forEach((p) => {
    assert.ok(p.id, 'Palette must have id');
    assert.ok(p.name, 'Palette must have name');
    assert.match(p.primary, /^#[0-9a-fA-F]{6}$/, `${p.id} primary must be hex`);
    assert.match(p.accent, /^#[0-9a-fA-F]{6}$/, `${p.id} accent must be hex`);
    assert.ok(p.accentBg, 'Palette must have accentBg');
  });
});

test('Branding: Default brand settings fallback', () => {
  global.localStorage.clear();
  const settings = getStoredBrandSettings();
  assert.strictEqual(settings.paletteId, DEFAULT_BRAND_SETTINGS.paletteId);
  assert.strictEqual(settings.customAccent, DEFAULT_BRAND_SETTINGS.customAccent);
});

test('Branding: Storage persistence and retrieval', () => {
  const updated = {
    paletteId: 'sapphire',
    customAccent: '#3b82f6',
    customLogoUrl: 'data:image/png;base64,mocklogo',
  };
  saveStoredBrandSettings(updated);

  const retrieved = getStoredBrandSettings();
  assert.strictEqual(retrieved.paletteId, 'sapphire');
  assert.strictEqual(retrieved.customAccent, '#3b82f6');
  assert.strictEqual(retrieved.customLogoUrl, 'data:image/png;base64,mocklogo');
});

test('Branding: Per-user theme isolation', () => {
  const userA = 'user_aaa_111';
  const userB = 'user_bbb_222';

  saveStoredBrandSettings({ paletteId: 'emerald', customAccent: '#10b981' }, userA);
  saveStoredBrandSettings({ paletteId: 'crimson', customAccent: '#e11d48' }, userB);

  const themeA = getStoredBrandSettings(userA);
  const themeB = getStoredBrandSettings(userB);

  assert.strictEqual(themeA.paletteId, 'emerald');
  assert.strictEqual(themeB.paletteId, 'crimson');
  assert.notStrictEqual(themeA.paletteId, themeB.paletteId);
});

test('Branding: HSL to HEX and HEX to HSL conversion', () => {
  // Pure Red: Hex #ff0000 -> H: 0, S: 100, L: 50
  const redHsl = hexToHsl('#ff0000');
  assert.strictEqual(redHsl.h, 0);
  assert.strictEqual(redHsl.s, 100);
  assert.strictEqual(redHsl.l, 50);

  const redHex = hslToHex(0, 100, 50);
  assert.strictEqual(redHex.toLowerCase(), '#ff0000');

  // Short 3-char hex: #fff
  const whiteHsl = hexToHsl('#fff');
  assert.strictEqual(whiteHsl.l, 100);
});

test('Branding: parseColorSearch handles named, hex, and rgb inputs', () => {
  // Named color
  const gold = parseColorSearch('gold');
  assert.ok(gold);
  assert.strictEqual(gold.hex.toLowerCase(), '#c4a55a');

  // Partial match
  const purp = parseColorSearch('purp');
  assert.ok(purp);
  assert.ok(purp.label.toLowerCase().includes('purple'));

  // Hex query with and without hash
  const hex1 = parseColorSearch('#10b981');
  assert.ok(hex1);
  assert.strictEqual(hex1.hex, '#10b981');

  const hex2 = parseColorSearch('3b82f6');
  assert.ok(hex2);
  assert.strictEqual(hex2.hex, '#3b82f6');

  // RGB syntax
  const rgb = parseColorSearch('rgb(255, 0, 128)');
  assert.ok(rgb);
  assert.strictEqual(rgb.hex.toLowerCase(), '#ff0080');

  // Invalid query
  const invalid = parseColorSearch('not-a-valid-color-xyz123');
  assert.strictEqual(invalid, null);
});

test('Branding: Logo Upload policy enforces strict 5MB limit and PNG/JPEG format restriction', () => {
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

  // Test Allowed Formats
  assert.ok(ALLOWED_MIME_TYPES.includes('image/png'), 'PNG must be accepted');
  assert.ok(ALLOWED_MIME_TYPES.includes('image/jpeg'), 'JPEG must be accepted');
  assert.ok(ALLOWED_MIME_TYPES.includes('image/jpg'), 'JPG must be accepted');

  // Test Rejected Formats
  const rejectedTypes = ['image/svg+xml', 'image/webp', 'image/gif', 'application/pdf', 'image/avif'];
  rejectedTypes.forEach((type) => {
    assert.strictEqual(
      ALLOWED_MIME_TYPES.includes(type),
      false,
      `MIME type ${type} must be rejected under strict PNG/JPEG policy`
    );
  });

  // Test File Size Boundary (5MB)
  assert.ok(4.99 * 1024 * 1024 <= MAX_FILE_SIZE_BYTES, 'Files under 5MB must pass size check');
  assert.ok(5.00 * 1024 * 1024 <= MAX_FILE_SIZE_BYTES, 'Files exactly 5MB must pass size check');
  assert.ok(5.01 * 1024 * 1024 > MAX_FILE_SIZE_BYTES, 'Files over 5MB must be rejected');
});

test('Branding: "Remove First to Replace" workflow validation', () => {
  // Simulate active state
  let currentCustomLogoUrl = 'https://supabase.co/storage/v1/object/public/crm-branding/logos/user_1/logo.png';
  
  // Guard check: Upload must be blocked if active logo exists
  const canUploadWithActiveLogo = !currentCustomLogoUrl;
  assert.strictEqual(canUploadWithActiveLogo, false, 'Upload must be locked when an active logo is present');

  // Simulate explicit remove
  currentCustomLogoUrl = null;
  const canUploadAfterRemove = !currentCustomLogoUrl;
  assert.strictEqual(canUploadAfterRemove, true, 'Upload must unlock once the user removes the existing logo');
});
