import { WebSocketServer } from 'ws';
import { parseWorkerMessage, workerMessage } from './worker-client.js';

export class WorkerBroker {
  constructor({ token = process.env.WORKER_TOKEN || process.env.WORKER_PAIRING_TOKEN || '' } = {}) {
    this.token = token;
    this.workers = new Map();
    this.waiting = [];
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });
    this.wss.on('connection', (socket) => this.handleConnection(socket));
  }

  attach(server) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== '/api/worker/ws') return;
      const authorization = request.headers.authorization || '';
      if (!this.token || authorization !== `Bearer ${this.token}`) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.wss.emit('connection', ws, request));
    });
    return this;
  }

  handleConnection(socket) {
    let worker;
    const close = () => { if (worker) { worker.online = false; if (this.workers.get(worker.id) === worker) this.workers.delete(worker.id); } };
    socket.on('close', close); socket.on('error', close);
    socket.on('message', (raw) => {
      const message = parseWorkerMessage(raw.toString()); if (!message) return;
      if (message.type === 'hello') {
        if (!message.workerId || typeof message.workerId !== 'string') return socket.close(1008, 'workerId required');
        worker = { id: message.workerId, socket, online: true, idle: true, lastSeenAt: Date.now(), capabilities: message.capabilities || {} };
        this.workers.set(worker.id, worker); socket.send(workerMessage('hello', { ok: true, workerId: worker.id })); return;
      }
      if (!worker) return socket.close(1008, 'hello required');
      worker.lastSeenAt = Date.now();
      if (message.type === 'heartbeat') { worker.idle = message.status !== 'busy'; worker.capabilities = message.capabilities || worker.capabilities; return; }
      const pending = worker.jobId && this.waiting.find((item) => item.job.id === worker.jobId);
      if (message.type === 'started' || message.type === 'progress' || message.type === 'result' || message.type === 'failed') {
        if (!pending || (message.jobId && message.jobId !== pending.job.id)) return;
        if (message.type === 'progress') pending.onProgress(message);
        if (message.type === 'started') pending.onStarted(message);
        if (message.type === 'result') { clearTimeout(pending.timer); worker.idle = true; worker.jobId = null; pending.resolve(message); this.waiting = this.waiting.filter((x) => x !== pending); }
        if (message.type === 'failed') { clearTimeout(pending.timer); worker.idle = true; worker.jobId = null; pending.reject(new Error(message.message || 'GPU Worker failed')); this.waiting = this.waiting.filter((x) => x !== pending); }
      }
    });
  }

  onlineWorkers() { return [...this.workers.values()].filter((worker) => worker.online); }

  run(job, { onProgress = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      const entry = { job, resolve, reject, onProgress, onStarted: () => {} };
      this.waiting.push(entry); this.pump();
      entry.timer = setTimeout(() => { this.waiting = this.waiting.filter((x) => x !== entry); reject(new Error('没有可用的 GPU Worker')); }, 10 * 60 * 1000);
    }).finally(() => this.pump());
  }

  pump() {
    for (const entry of this.waiting) {
      if (entry.assigned) continue;
      const worker = this.onlineWorkers().find((candidate) => candidate.idle);
      if (!worker) continue;
      entry.assigned = true; worker.idle = false; worker.jobId = entry.job.id;
      clearTimeout(entry.timer); entry.timer = setTimeout(() => { worker.idle = true; worker.jobId = null; entry.reject(new Error('GPU Worker 响应超时')); this.waiting = this.waiting.filter((x) => x !== entry); this.pump(); }, 31 * 60 * 1000);
      worker.socket.send(workerMessage('job', { jobId: entry.job.id, input: entry.job.input }));
    }
  }
}
