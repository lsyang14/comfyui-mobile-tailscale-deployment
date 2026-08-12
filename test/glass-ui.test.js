import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const pages=['index.html','gallery.html','account.html','admin.html'];
test('all pages define a reusable glass button treatment',async()=>{for(const page of pages){const html=await readFile(new URL(`../public/${page}`,import.meta.url),'utf8');assert.match(html,/backdrop-filter/);assert.match(html,/\.glass/);}});
