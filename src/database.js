import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Database {
  constructor(path = process.env.DATABASE_PATH || './data/comfy-mobile.sqlite') {
    mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS gallery (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, job_id TEXT UNIQUE NOT NULL, image_url TEXT, prompt TEXT NOT NULL, aspect_ratio TEXT NOT NULL, megapixels REAL NOT NULL, seed INTEGER, refine_prompt INTEGER NOT NULL, enable_lora INTEGER NOT NULL, upscale INTEGER NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL);`);
  }
  userByName(username) { return this.db.prepare('SELECT * FROM users WHERE username=?').get(username); }
  createUser(user) { this.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id, user.username, user.passwordHash, user.role, user.createdAt); return user; }
  session(token) { return this.db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').get(token, Date.now()); }
  createSession(token, userId, expiresAt) { this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, userId, expiresAt); }
  addGallery(item) { this.db.prepare('INSERT OR REPLACE INTO gallery VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.userId,item.jobId,item.imageUrl,item.prompt,item.aspectRatio,item.megapixels,item.seed,item.refinePrompt?1:0,item.enableLora?1:0,item.upscale?1:0,item.status,item.error||null,item.createdAt); }
  updateGallery(job) { this.db.prepare('UPDATE gallery SET image_url=?, status=?, error=? WHERE job_id=?').run(job.imageUrl||null,job.status,job.error||null,job.id); }
  gallery(userId) { return this.db.prepare('SELECT * FROM gallery WHERE user_id=? ORDER BY created_at DESC').all(userId); }
}
