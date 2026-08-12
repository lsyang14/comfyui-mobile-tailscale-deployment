import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPicgoUrls, makeUniqueImageName, extractPicgoResultUrls, extractPicgoApiUrls } from '../src/picgo.js';

test('extracts successful PicGo URLs from CLI output', () => {
  const output = '[PicGo INFO]: Uploading...\n[PicGo SUCCESS]:\nhttps://img.example/a.png\nhttps://img.example/b.png\n';
  assert.deepEqual(extractPicgoUrls(output), ['https://img.example/a.png', 'https://img.example/b.png']);
});

test('rejects PicGo output without a URL', () => {
  assert.throws(() => extractPicgoUrls('[PicGo ERROR]: upload failed'), /URL/);
});

test('creates a timestamped collision-resistant filename while preserving extension', () => {
  const name = makeUniqueImageName('Krea2_turbo.png', new Date('2026-08-12T15:30:45.123Z'), 'a7f2');
  assert.match(name, /^20260812\d{9}-a7f2\.png$/);
});

test('extracts SDK image URLs from returned items and supports PicGo output fallback', () => {
  assert.deepEqual(extractPicgoResultUrls([{ imgUrl: 'https://img.example/a.png' }]), ['https://img.example/a.png']);
  assert.deepEqual(extractPicgoResultUrls(new Error('bad'), [{ imgUrl: 'https://img.example/b.png' }]), ['https://img.example/b.png']);
});

test('extracts URLs from the PicGo desktop API response', () => {
  assert.deepEqual(extractPicgoApiUrls({ success: true, result: ['https://img.example/c.png'] }), ['https://img.example/c.png']);
  assert.throws(() => extractPicgoApiUrls({ success: false, message: 'failed' }), /失败/);
});
