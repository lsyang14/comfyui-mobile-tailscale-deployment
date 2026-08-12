import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/database.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function database() { return new Database(join(tmpdir(), `admin-${crypto.randomUUID()}.sqlite`)); }

test('admin database operations list, reset, and delete ordinary users', () => {
  const db = database();
  const admin = db.createUser({ id: 'admin', username: 'lsyang', passwordHash: hashPassword('old'), role: 'admin', createdAt: new Date().toISOString() });
  const user = db.createUser({ id: 'u1', username: 'alice', passwordHash: hashPassword('one'), role: 'user', createdAt: new Date().toISOString() });
  assert.deepEqual(db.listUsers().map((item) => item.username), ['lsyang', 'alice']);
  db.updatePassword(user.id, hashPassword('two'));
  assert.equal(verifyPassword('two', db.userByName('alice').password_hash), true);
  assert.equal(db.deleteUser(user.id), true);
  assert.equal(db.userByName('alice'), undefined);
  assert.equal(db.deleteUser(admin.id), false);
});
