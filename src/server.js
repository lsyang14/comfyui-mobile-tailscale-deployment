import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildWorkflow, findImageOutput } from './workflow.js';
import { loadPicgoConfig, uploadWithCurl } from './uploader.js';

const port = Number(process.env.PORT || 3000);
const comfy = process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
const workflowPath = process.env.WORKFLOW_PATH || new URL('../workflow-krea2.json', import.meta.url).pathname;
const authToken = process.env.AUTH_TOKEN || '';
const picgoPath = process.env.PICGO_SFTP_CONFIG || '';
const jobs = new Map();

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
    const clientId = randomUUID();
    const built = await buildWorkflow(job.input, workflowPath);
    const response = await fetch(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: built.workflow, client_id: clientId }) });
    const queued = await response.json();
    if (!response.ok || !queued.prompt_id) throw new Error(queued.error || 'ComfyUI 拒绝了工作流');
    job.promptId = queued.prompt_id;
    for (let i = 0; i < 1800; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const historyResponse = await fetch(`${comfy}/history/${queued.prompt_id}`);
      const history = await historyResponse.json();
      if (history[queued.prompt_id]) {
        job.output = findImageOutput(history[queued.prompt_id], built.options.upscale);
        if (picgoPath) {
          const imageResponse = await fetch(`${comfy}/view?filename=${encodeURIComponent(job.output.filename)}&subfolder=${encodeURIComponent(job.output.subfolder)}&type=${encodeURIComponent(job.output.type)}`);
          if (!imageResponse.ok) throw new Error('无法从 ComfyUI 下载生成图片');
          const localPath = join(tmpdir(), `${job.id}-${job.output.filename.replace(/[^\w.-]/g, '_')}`);
          await writeFile(localPath, Buffer.from(await imageResponse.arrayBuffer()));
          try { job.imageUrl = await uploadWithCurl(await loadPicgoConfig(picgoPath), localPath, job.output.filename); }
          finally { await unlink(localPath).catch(() => {}); }
        }
        job.status = 'succeeded'; return;
      }
    }
    throw new Error('ComfyUI 任务超过 30 分钟未完成');
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
      jobs.set(id, job); void runJob(job);
      return json(res, 202, { jobId: id, status: job.status });
    }
    const match = req.url?.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const job = jobs.get(match[1]); if (!job) return json(res, 404, { error: '任务不存在' });
      return json(res, 200, { id: job.id, status: job.status, promptId: job.promptId ?? null, output: job.output ?? null, imageUrl: job.imageUrl ?? null, error: job.error ?? null });
    }
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});

server.listen(port, '0.0.0.0', () => console.log(`comfy-mobile listening on ${port}`));
