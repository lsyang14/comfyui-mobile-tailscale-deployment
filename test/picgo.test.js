import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPicgoUrls, makeUniqueImageName } from '../src/picgo.js';

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
