import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const pages=['index.html','gallery.html','account.html','admin.html'];
test('all pages define a reusable glass button treatment',async()=>{for(const page of pages){const html=await readFile(new URL(`../public/${page}`,import.meta.url),'utf8');assert.match(html,/backdrop-filter/);assert.match(html,/\.glass/);}});
test('generator navigation uses a spacious two-button layout',async()=>{const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/\.page-nav\{display:grid;grid-template-columns:1fr 1fr;gap:\.75rem/);assert.match(html,/<nav class="page-nav">/);});
