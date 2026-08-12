export class JobQueue {
  constructor({ maxSize = 10 } = {}) { this.maxSize = maxSize; this.items = []; this.running = false; this.waiters = []; }
  add(id, task) {
    if (this.items.length + (this.running ? 1 : 0) >= this.maxSize) throw new Error('队列已满，请稍后再试');
    this.items.push({ id, task }); this.#pump();
  }
  position(id) {
    const index = this.items.findIndex((item) => item.id === id);
    return index < 0 ? (this.running && this.current?.id === id ? 0 : null) : index + (this.running ? 1 : 0);
  }
  async idle() { if (!this.running && !this.items.length) return; return new Promise((resolve) => this.waiters.push(resolve)); }
  async #pump() {
    if (this.running || !this.items.length) { if (!this.running && !this.items.length) this.waiters.splice(0).forEach((resolve) => resolve()); return; }
    this.running = true; this.current = this.items.shift();
    try { await this.current.task(); } catch { /* task records its own failure */ }
    this.current = null; this.running = false; this.#pump();
  }
}
