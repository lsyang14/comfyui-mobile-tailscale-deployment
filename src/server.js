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
import { RedisJobQueue } from './redis-queue.js';
import { Database } from './database.js';
import { cookie, getCookie, hashPassword, sessionToken, verifyPassword } from './auth.js';

const port = Number(process.env.PORT || 3000);
const comfy = process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
const workflowPath = process.env.WORKFLOW_PATH || defaultWorkflowPath(import.meta.url);
const authToken = process.env.AUTH_TOKEN || '';
const picgoConfigPath = process.env.PICGO_CONFIG_PATH || '';
const queue = new RedisJobQueue({ maxSize: Number(process.env.MAX_QUEUE_SIZE || 10) });
const db = new Database();
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && !db.userByName(process.env.ADMIN_USERNAME)) db.createUser({ id: randomUUID(), username: process.env.ADMIN_USERNAME, passwordHash: hashPassword(process.env.ADMIN_PASSWORD), role: 'admin', createdAt: new Date().toISOString() });

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function comfyOnline() {
  try { const response = await fetch(`${comfy}/system_stats`, { signal: AbortSignal.timeout(2500) }); return response.ok; } catch { return false; }
}

async function body(req) {
  let data = ''; for await (const chunk of req) data += chunk;
  if (data.length > 64 * 1024) throw new Error('请求体过大');
  return JSON.parse(data || '{}');
}

function currentUser(req) { const token = getCookie(req); return token ? db.session(token) : null; }
function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: '请先登录' }); return null; } return user; }

async function runJob(job) {
  try {
    job.status = 'running'; await queue.save(job); db.updateGallery(job);
    job.progress = { value: 0, max: 1, percent: 0, node: null, label: '连接 ComfyUI…' }; await queue.save(job);
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
          job.progress = { value, max, percent: Math.min(100, Math.round(value / max * 100)), node: data.node ?? null, label: '正在生成…' }; void queue.save(job);
        } else if (message.type === 'executing') {
          job.progress = { ...job.progress, node: data.node ?? null, label: data.node ? `正在执行节点 ${data.node}` : '整理输出…' }; void queue.save(job);
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
        job.status = 'succeeded'; db.updateGallery(job); return;
    }
    throw new Error('ComfyUI 已结束但没有找到历史输出');
  } catch (error) { job.status = 'failed'; job.error = error.message; db.updateGallery(job); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { ok: true, service: 'comfy-mobile' });
    if (req.method === 'POST' && req.url === '/api/auth/login') { const input=await body(req); const user=db.userByName(String(input.username||'')); if(!user||!verifyPassword(String(input.password||''),user.password_hash)) return json(res,401,{error:'用户名或密码错误'}); const token=sessionToken(); db.createSession(token,user.id,Date.now()+604800000); res.setHeader('set-cookie',cookie(token)); return json(res,200,{id:user.id,username:user.username,role:user.role}); }
    if (req.method === 'GET' && req.url === '/api/auth/me') { const user=currentUser(req); return user ? json(res,200,{id:user.id,username:user.username,role:user.role}) : json(res,401,{error:'未登录'}); }
    if (req.method === 'POST' && req.url === '/api/admin/users') { const admin=requireUser(req,res); if(!admin)return; if(admin.role!=='admin')return json(res,403,{error:'需要管理员权限'}); const input=await body(req); if(!input.username||!input.password)return json(res,400,{error:'用户名和密码不能为空'}); if(db.userByName(input.username))return json(res,409,{error:'用户名已存在'}); const user={id:randomUUID(),username:input.username,passwordHash:hashPassword(input.password),role:'user',createdAt:new Date().toISOString()}; db.createUser(user); return json(res,201,{id:user.id,username:user.username,role:user.role}); }
    if (req.method === 'GET' && req.url === '/api/comfy/status') return json(res, 200, { online: await comfyOnline(), address: comfy });
    if (authToken && req.headers.authorization !== `Bearer ${authToken}`) return json(res, 401, { error: '未授权' });
    if (req.method === 'POST' && req.url === '/api/jobs') {
      const user=requireUser(req,res); if(!user)return;
      const input = await body(req);
      const id = randomUUID();
      const job = { id, userId:user.id, input, status: 'queued', createdAt: new Date().toISOString() };
      db.addGallery({id:randomUUID(),userId:user.id,jobId:id,imageUrl:null,prompt:input.prompt||'',aspectRatio:input.aspectRatio||'3:4 (Portrait Standard)',megapixels:Number(input.megapixels||1),seed:Number(input.seed??-1),refinePrompt:Boolean(input.refinePrompt),enableLora:Boolean(input.enableLora),upscale:Boolean(input.upscale),status:'queued',createdAt:job.createdAt});
      try { const position = await queue.enqueue(job); return json(res, 202, { jobId: id, status: job.status, queuePosition: position }); } catch (error) { return json(res, 429, { error: error.message }); }
    }
    const match = req.url?.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const user=requireUser(req,res); if(!user)return; const job = await queue.get(match[1]); if (!job || job.userId!==user.id) return json(res, 404, { error: '任务不存在' });
      return json(res, 200, { id: job.id, status: job.status, promptId: job.promptId ?? null, queuePosition: job.status === 'queued' ? await queue.position(job.id) : 0, progress: job.progress ?? null, output: job.output ?? null, imageUrl: job.imageUrl ?? null, error: job.error ?? null });
    }
    if (req.method === 'GET' && req.url === '/api/gallery') { const user=requireUser(req,res); if(!user)return; return json(res,200,{items:db.gallery(user.id)}); }
    if (req.method === 'GET' && req.url === '/') {
      const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});

await queue.connect();
void queue.startWorker(runJob);
server.listen(port, '0.0.0.0', () => console.log(`comfy-mobile listening on ${port}`));
