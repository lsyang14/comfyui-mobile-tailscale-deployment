import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPicgoUrls } from '../src/picgo.js';

test('reads the URL returned by PicGo CLI', () => {
  assert.deepEqual(extractPicgoUrls('[PicGo SUCCESS]:\nhttps://example.test/image.png\n'), ['https://example.test/image.png']);
});
