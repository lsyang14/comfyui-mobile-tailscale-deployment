import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
test('gallery preview provides a clear return-to-gallery control',async()=>{const html=await readFile(new URL('../public/gallery.html',import.meta.url),'utf8');assert.match(html,/返回图库/);assert.match(html,/Escape/)});
