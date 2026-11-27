const test = require('node:test');
const assert = require('node:assert');
require('../setup');
global.URL = require('node:url').URL;
const { parseVideoKey, videoKind, videoEmbedUrl, videoThumbUrl, videoOpenUrl, isYouTubeKey } = require('../../lib/video-link');

const ID = 'dQw4w9WgXcQ';

test('YouTube links still save as the 11-character id', () => {
  assert.strictEqual(parseVideoKey(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.strictEqual(parseVideoKey(`youtu.be/${ID}`), ID);
  assert.ok(isYouTubeKey(ID));
  assert.ok(videoThumbUrl(ID).includes(ID));
  assert.ok(videoOpenUrl(ID).includes(`watch?v=${ID}`));
});

test('YouTube pages that are not one video are rejected', () => {
  assert.strictEqual(parseVideoKey('https://www.youtube.com/@somechannel'), null);
  assert.strictEqual(parseVideoKey('https://www.youtube.com/playlist?list=PL123'), null);
});

test('Instagram, Facebook, Vimeo and other links are accepted and cleaned', () => {
  assert.strictEqual(parseVideoKey('https://www.instagram.com/reel/C8abc_DEF12/?igsh=xyz#top'), 'https://www.instagram.com/reel/C8abc_DEF12/');
  assert.strictEqual(parseVideoKey('instagram.com/p/Cabc123/'), 'https://instagram.com/p/Cabc123/');
  assert.strictEqual(parseVideoKey('http://example.com/page?utm_source=x&id=7'), 'https://example.com/page?id=7');
  assert.strictEqual(videoKind('https://www.instagram.com/reel/C8abc/'), 'instagram');
  assert.strictEqual(videoKind('https://fb.watch/abcd/'), 'facebook');
  assert.strictEqual(videoKind('https://vimeo.com/123456789'), 'vimeo');
  assert.strictEqual(videoKind('https://cdn.site.com/a/b.mp4'), 'file');
  assert.strictEqual(videoKind('https://example.com/page'), 'link');
  assert.strictEqual(videoThumbUrl('https://www.instagram.com/reel/C8abc/'), null);
});

test('embed URLs are built only from the parts we trust', () => {
  assert.strictEqual(videoEmbedUrl('https://www.instagram.com/someuser/reel/C8abc/'), 'https://www.instagram.com/reel/C8abc/embed');
  assert.strictEqual(videoEmbedUrl('https://vimeo.com/channels/x/123456789'), 'https://player.vimeo.com/video/123456789?autoplay=1');
  assert.ok(videoEmbedUrl('https://www.facebook.com/watch/?v=1').startsWith('https://www.facebook.com/plugins/video.php?href='));
  assert.strictEqual(videoEmbedUrl('https://example.com/page'), null);
});

test('unsafe or invalid input is rejected', () => {
  for (const bad of ['javascript:alert(1)', 'ftp://a.com/x', 'http://localhost:3000/x', 'http://127.0.0.1/x', 'not a link', '', 'https://user:pw@a.com/x', 'https://' + 'a'.repeat(600) + '.com'])
    assert.strictEqual(parseVideoKey(bad), null, bad);
});
