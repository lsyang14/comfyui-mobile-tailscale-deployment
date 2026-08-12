import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPicgoUrls } from '../src/picgo.js';

test('extracts successful PicGo URLs from CLI output', () => {
  const output = '[PicGo INFO]: Uploading...\n[PicGo SUCCESS]:\nhttps://img.example/a.png\nhttps://img.example/b.png\n';
  assert.deepEqual(extractPicgoUrls(output), ['https://img.example/a.png', 'https://img.example/b.png']);
});

test('rejects PicGo output without a URL', () => {
  assert.throws(() => extractPicgoUrls('[PicGo ERROR]: upload failed'), /URL/);
});
