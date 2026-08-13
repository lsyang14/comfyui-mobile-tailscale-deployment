import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import WebSocket from 'ws';
import { buildWorkflow, findImageOutput } from '../src/workflow.js';
import { defaultWorkflowPath } from '../src/paths.js';
import { workerMessage, workerWsUrl } from '../src/worker-client.js';

const serverUrl = process.env.WORKER_SERVER_URL;
const token = process.env.WORKER_TOKEN;
const workerId = process.env.WORKER_ID || `gpu-${process.env.COMPUTERNAME || randomUUID().slice(0, 8)}`;
const comfy = process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
const workflowPath = process.env.WORKFLOW_PATH || defaultWorkflowPath(import.meta.url);
if (!serverUrl || !token) throw new Error('WORKER_SERVER_URL and WORKER_TOKEN are required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function comfyOnline() { try { return (await fetch(`${comfy}/system_stats`, { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; } }

async function executeJob(socket, job) {
  const send = (type, payload) => socket.readyState === WebSocket.OPEN && socket.send(workerMessage(type, payload));
  try {
    send('started', { jobId: job.jobId });
    const selectedWorkflowPath = job.input.workflow === 'krea2-hd4k' ? (process.env.WORKFLOW_HD4K_PATH || resolve(dirname(workflowPath), 'workflow-krea2-hd4k.json')) : workflowPath;
    const built = await buildWorkflow(job.input, selectedWorkflowPath); const clientId = randomUUID();
    const comfyWs = new WebSocket(`${comfy.replace(/^http/, 'ws')}/ws?clientId=${clientId}`);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('ComfyUI WebSocket timeout')), 10000); comfyWs.once('open', () => { clearTimeout(timer); resolve(); }); comfyWs.once('error', () => { clearTimeout(timer); reject(new Error('ComfyUI unavailable')); }); });
    const response = await fetch(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: built.workflow, client_id: clientId }) });
    const queued = await response.json(); if (!response.ok || !queued.prompt_id) throw new Error(queued.error || 'ComfyUI rejected workflow');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ComfyUI timeout')), 30 * 60 * 1000);
      comfyWs.on('message', (raw) => { let message; try { message = JSON.parse(raw.toString()); } catch { return; } const data = message.data || {}; if (data.prompt_id && data.prompt_id !== queued.prompt_id) return; if (message.type === 'progress') { const max = Number(data.max) || 1; const value = Number(data.value) || 0; send('progress', { jobId: job.jobId, value, max, percent: Math.min(100, Math.round(value / max * 100)), node: data.node ?? null }); } if (message.type === 'executing' && data.node === null) { clearTimeout(timer); resolve(); } if (message.type === 'execution_error' || message.type === 'execution_interrupted') { clearTimeout(timer); reject(new Error('ComfyUI execution failed')); } }); comfyWs.once('error', () => { clearTimeout(timer); reject(new Error('ComfyUI WebSocket disconnected')); });
    }); comfyWs.close();
    const history = await (await fetch(`${comfy}/history/${queued.prompt_id}`)).json(); const output = findImageOutput(history[queued.prompt_id], built.options.upscale); const image = await fetch(`${comfy}/view?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder || '')}&type=${encodeURIComponent(output.type || 'output')}`); if (!image.ok) throw new Error('ComfyUI image unavailable');
    send('result', { jobId: job.jobId, filename: output.filename, imageBase64: Buffer.from(await image.arrayBuffer()).toString('base64') });
  } catch (error) { send('failed', { jobId: job.jobId, message: error.message }); }
}

let retry = 1000;
async function connect() {
  const socket = new WebSocket(workerWsUrl(serverUrl, token), { headers: { authorization: `Bearer ${token}` } });
  socket.on('open', async () => { retry = 1000; console.log(`[worker ${workerId}] WSS connected to ${serverUrl}`); socket.send(workerMessage('hello', { workerId, capabilities: { comfyOnline: await comfyOnline(), clientVersion: '1.0.0' } })); });
  socket.on('message', async (raw) => { let message; try { message = JSON.parse(raw.toString()); } catch { return; } if (message.type === 'job') await executeJob(socket, message); });
  const heartbeat = setInterval(async () => { if (socket.readyState === WebSocket.OPEN) socket.send(workerMessage('heartbeat', { status: await comfyOnline() ? 'idle' : 'unavailable', capabilities: { comfyOnline: await comfyOnline(), clientVersion: '1.0.0' } })); }, 15000);
  socket.on('close', () => { clearInterval(heartbeat); console.log(`[worker ${workerId}] WSS disconnected; retrying in ${retry}ms`); setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }); socket.on('error', (error) => console.error(`[worker ${workerId}] WSS error: ${error.message}`));
}
connect();
