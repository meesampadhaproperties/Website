const test = require('node:test');
const assert = require('node:assert');
require('../setup');
// tests/setup.js swaps global.URL for a browser mock (createObjectURL); the link parser needs the real one
global.URL = require('node:url').URL;
const { parseYouTubeId, youtubeEmbedUrl, youtubeThumbUrl } = require('../../lib/youtube');

const ID = 'dQw4w9WgXcQ';

test('parseYouTubeId accepts every common YouTube link shape', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) assert.strictEqual(parseYouTubeId(url), ID, url);
});

test('parseYouTubeId rejects anything that is not a single YouTube video', () => {
  for (const url of [
    '', null, undefined, 'hello',
    'https://www.youtube.com/', 'https://www.youtube.com/playlist?list=PL1234567890A',
    'https://www.youtube.com/watch?v=short', `https://www.youtube.com/watch?v=${ID}extra`,
    `https://evil.com/watch?v=${ID}`, `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://notyoutu.be/${ID}`, `javascript:alert(1)//youtu.be/${ID}`, `ftp://youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)}"><script>`,
  ]) assert.strictEqual(parseYouTubeId(url), null, String(url));
});

test('URLs are always rebuilt from the id', () => {
  assert.strictEqual(youtubeThumbUrl(ID), `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  assert.ok(youtubeEmbedUrl(ID).startsWith(`https://www.youtube-nocookie.com/embed/${ID}`));
  assert.ok(youtubeEmbedUrl(ID, true).includes('autoplay=1'));
});
