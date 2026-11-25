const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { documentCategory } = require('../../lib/project-documents');

test('View data page groups documents into images / videos / documents / links', () => {
  assert.strictEqual(documentCategory({ doc_type: 'link', mime_type: null }), 'link');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: 'image/jpeg' }), 'image');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: 'IMAGE/PNG' }), 'image');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: 'video/mp4' }), 'video');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: 'application/pdf' }), 'document');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: 'audio/mpeg' }), 'document');
  assert.strictEqual(documentCategory({ doc_type: 'file', mime_type: null }), 'document');
});
