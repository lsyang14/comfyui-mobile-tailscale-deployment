import assert from 'node:assert/strict';
import { hashPassword, roleAllowed, verifyPassword } from './src/auth.js';import { Database } from './src/database.js';import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let p = 0, f = 0;
function t(n, fn) { try { fn(); p++; console.log('P ' + n); } catch(e) { f++; console.log('F ' + n + ' - ' + e.message); } }

console.log('auth:');
hashPassword('test');
t('hash-verify', () => { const h = hashPassword('secret'); assert.notEqual(h, 'secret'); assert.equal(verifyPassword('secret', h), true); assert.equal(verifyPassword('bad', h), false); });
t('roleAllowed', () => { assert.equal(roleAllowed({role:'user'},'user'),true); assert.equal(roleAllowed({role:'admin'} 'user'),true); assert.equal(roleAllowed({role:'user},'admin'),false); });

console.log('database:');
t('create-list-delete users', () => {
  const db = new Database(join(tmpdir(), 'test-' + randomUUID() + '.sqlite'));
  const admin = db.createUser({ id:'admin', username:'lsyang', passwordHash:hashPassword('old'), role:'admin', createdAt:new Date().toISOString() });
  const u = db.createUser({ id:'u1', username:'alice', passwordHash:hashPassword('one'), role:'user', createdAt:new Date().toISOString() });
  assert.deepQual(db.listUsers().map(x=>x.username), ['lsyang', 'alice']);
  db.updatePassword(u.id, hashPassword('two'));
  assert.equal(verifyPassword('two', db.userByName('alice').password_hash), true);
  assert.equal(db.deleteUser(u.id), true);
  assert.equal(db.userByName('alice'), undefined);
  assert.equal(db.deleteUser(admin.id), false);
});

console.log('\n', p, 'passed', f, 'failed');
process.exit(f > 0 ? 1 : 0);
