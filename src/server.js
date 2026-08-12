import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildWorkflow, findImageOutput } from './workflow.js';
import { makeUniqueImageName, uploadWithPicgo } from './picgo.js';
import { defaultWorkflowPath } from './paths.js';
import { JobQueue } from './queue.js';

const port = Number(process.env.PORT || 3000);
const comfy = process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
const workflowPath = process.env.WORKFLOW_PATH || defaultWorkflowPath(import.meta.url);
const authToken = process.env.AUTH_TOKEN || '';
const picgoConfigPath = process.env.PICGO_CONFIG_PATH || '';
const jobs = new Map();
const queue = new JobQueue({ maxSize: Number(process.env.MAX_QUEUE_SIZE || 10) });

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let data = ''; for await (const chunk of req) data += chunk;
  if (data.length > 64 * 1024) throw new Error('请求体过大');
  return JSON.parse(data || '{}');
}

async function runJob(job) {
  try {
    job.status = 'running';
    job.progress = { value: 0, max: 1, percent: 0, node: null, label: '连接 ComfyUI…' };
    const clientId = randomUUID();
    const built = await buildWorkflow(job.input, workflowPath);
    const ws = new WebSocket(`${comfy.replace(/^http/, 'ws')}/ws?clientId=${clientId}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接 ComfyUI WebSocket 超时')), 10000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法连接 ComfyUI WebSocket')); }, { once: true });
    });
    const response = await fetch(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: built.workflow, client_id: clientId }) });
    const queued = await response.json();
    if (!response.ok || !queued.prompt_id) throw new Error(queued.error || 'ComfyUI 拒绝了工作流');
    job.promptId = queued.prompt_id;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ComfyUI 任务超过 30 分钟未完成')), 30 * 60 * 1000);
      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const data = message.data || {};
        if (data.prompt_id && data.prompt_id !== queued.prompt_id) return;
        if (message.type === 'progress') {
          const max = Number(data.max) || 1; const value = Number(data.value) || 0;
          job.progress = { value, max, percent: Math.min(100, Math.round(value / max * 100)), node: data.node ?? null, label: '正在生成…' };
        } else if (message.type === 'executing') {
          job.progress = { ...job.progress, node: data.node ?? null, label: data.node ? `正在执行节点 ${data.node}` : '整理输出…' };
          if (data.node === null) { clearTimeout(timer); resolve(); }
        } else if (message.type === 'execution_success') { clearTimeout(timer); resolve(); }
        else if (message.type === 'execution_error' || message.type === 'execution_interrupted') { clearTimeout(timer); reject(new Error('ComfyUI 执行失败或被中断')); }
      });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ComfyUI WebSocket 连接中断')); }, { once: true });
    });
    ws.close();
    const historyResponse = await fetch(`${comfy}/history/${queued.prompt_id}`);
    const history = await historyResponse.json();
    if (history[queued.prompt_id]) {
        job.output = findImageOutput(history[queued.prompt_id], built.options.upscale);
        if (process.env.PICGO_UPLOAD !== 'false') {
          const imageResponse = await fetch(`${comfy}/view?filename=${encodeURIComponent(job.output.filename)}&subfolder=${encodeURIComponent(job.output.subfolder)}&type=${encodeURIComponent(job.output.type)}`);
          if (!imageResponse.ok) throw new Error('无法从 ComfyUI 下载生成图片');
          const localPath = join(tmpdir(), makeUniqueImageName(job.output.filename, new Date(), randomBytes(4).toString('hex')));
          await writeFile(localPath, Buffer.from(await imageResponse.arrayBuffer()));
          try { job.imageUrl = (await uploadWithPicgo(localPath, { configPath: picgoConfigPath }))[0]; }
          finally { await unlink(localPath).catch(() => {}); }
        }
        job.progress = { value: 1, max: 1, percent: 100, node: null, label: '上传完成' };
        job.status = 'succeeded'; return;
    }
    throw new Error('ComfyUI 已结束但没有找到历史输出');
  } catch (error) { job.status = 'failed'; job.error = error.message; }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { ok: true, service: 'comfy-mobile' });
    if (authToken && req.headers.authorization !== `Bearer ${authToken}`) return json(res, 401, { error: '未授权' });
    if (req.method === 'POST' && req.url === '/api/jobs') {
      const input = await body(req);
      const id = randomUUID();
      const job = { id, input, status: 'queued', createdAt: new Date().toISOString() };
      jobs.set(id, job);
      try { queue.add(id, () => runJob(job)); } catch (error) { jobs.delete(id); return json(res, 429, { error: error.message }); }
      job.queuePosition = queue.position(id);
      return json(res, 202, { jobId: id, status: job.status, queuePosition: job.queuePosition });
    }
    const match = req.url?.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const job = jobs.get(match[1]); if (!job) return json(res, 404, { error: '任务不存在' });
      return json(res, 200, { id: job.id, status: job.status, promptId: job.promptId ?? null, queuePosition: job.status === 'queued' ? queue.position(job.id) : 0, progress: job.progress ?? null, output: job.output ?? null, imageUrl: job.imageUrl ?? null, error: job.error ?? null });
    }
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});

server.listen(port, '0.0.0.0', () => console.log(`comfy-mobile listening on ${port}`));
