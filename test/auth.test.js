import test from 'node:test'; import assert from 'node:assert/strict'; import { hashPassword, verifyPassword } from '../src/auth.js';
test('hashes and verifies passwords without storing plaintext',()=>{const h=hashPassword('secret');assert.notEqual(h,'secret');assert.equal(verifyPassword('secret',h),true);assert.equal(verifyPassword('bad',h),false)});
