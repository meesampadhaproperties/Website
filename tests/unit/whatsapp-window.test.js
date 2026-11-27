const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { splitByWindow, windowStart, WINDOW_HOURS } = require('../../lib/whatsapp-window');

test('the free window is 24 hours', () => {
  const now = new Date('2026-11-28T12:00:00Z');
  assert.strictEqual(WINDOW_HOURS, 24);
  assert.strictEqual(windowStart(now).toISOString(), '2026-11-27T12:00:00.000Z');
});

test('only people who messaged inside the window can be messaged for free', () => {
  const active = new Set(['+916305126335']);
  const leads = [
    { id: 'a', phone: '+916305126335' },
    { id: 'b', phone: '9701019870' },
    { id: 'c', phone: null },
    { id: 'd', phone: '12345' },
  ];
  const r = splitByWindow(leads, active);
  assert.deepStrictEqual(r.inWindow.map((l) => l.id), ['a']);
  assert.deepStrictEqual(r.outside.map((l) => l.id), ['b']);
  assert.deepStrictEqual(r.noPhone.map((l) => l.id), ['c', 'd']);
});

test('the window belongs to the phone number: any stored format and duplicate leads count', () => {
  const active = new Set(['+916305126335']);
  const leads = [
    { id: 'old', phone: '6305126335' },
    { id: 'old2', phone: '+91 63051 26335' },
    { id: 'old3', phone: '06305126335' },
  ];
  assert.strictEqual(splitByWindow(leads, active).inWindow.length, 3);
});

test('nobody is in the window when nobody has messaged', () => {
  const r = splitByWindow([{ phone: '+916305126335' }], new Set());
  assert.strictEqual(r.inWindow.length, 0);
  assert.strictEqual(r.outside.length, 1);
});
