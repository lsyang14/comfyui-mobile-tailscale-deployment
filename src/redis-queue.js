import { createClient } from 'redis';

export class RedisJobQueue {
  constructor({ url = process.env.REDIS_URL || 'redis://127.0.0.1:6379', prefix = 'comfy:jobs', maxSize = 10 } = {}) { this.client = createClient({ url }); this.prefix = prefix; this.maxSize = maxSize; this.workerRunning = false; }
  async connect() { if (!this.client.isOpen) await this.client.connect(); }
  key(id) { return `${this.prefix}:data:${id}`; }
  async enqueue(job) { const size = await this.client.lLen(`${this.prefix}:queue`); const running = await this.client.get(`${this.prefix}:running`); if (size + (running ? 1 : 0) >= this.maxSize) throw new Error('队列已满，请稍后再试'); await this.client.multi().set(this.key(job.id), JSON.stringify(job)).rPush(`${this.prefix}:queue`, job.id).exec(); return size + (running ? 1 : 0) + 1; }
  async get(id) { const value = await this.client.get(this.key(id)); return value ? JSON.parse(value) : null; }
  async save(job) { await this.client.set(this.key(job.id), JSON.stringify(job)); return job; }
  async position(id) { const running = await this.client.get(`${this.prefix}:running`); if (running === id) return 0; const index = await this.client.lPos(`${this.prefix}:queue`, id); return index === null ? null : index + (running ? 1 : 0); }
  async startWorker(processor) { if (this.workerRunning) return; this.workerRunning = true; while (this.workerRunning) { const item = await this.client.blPop(`${this.prefix}:queue`, 0); if (!item) continue; const job = await this.get(item.element); if (!job) continue; await this.client.set(`${this.prefix}:running`, job.id); job.status = 'running'; await this.save(job); try { await processor(job); } catch (error) { job.status = 'failed'; job.error = error.message; } await this.save(job); await this.client.del(`${this.prefix}:running`); } }
}
