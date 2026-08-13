const allowedTypes = new Set(['hello', 'heartbeat', 'job', 'progress', 'started', 'result', 'failed', 'pong']);

export function workerWsUrl(serverUrl, token) {
  const base = new URL(serverUrl);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = '/api/worker/ws';
  base.search = '';
  return base.toString();
}

export function workerMessage(type, payload = {}) {
  if (!allowedTypes.has(type)) throw new Error(`Unsupported worker message: ${type}`);
  return JSON.stringify({ type, ...payload });
}

export function parseWorkerMessage(raw) {
  try {
    const value = JSON.parse(String(raw));
    if (!value || typeof value !== 'object' || !allowedTypes.has(value.type)) return null;
    return value;
  } catch {
    return null;
  }
}

export function workerHeaders(token) {
  return { authorization: `Bearer ${token}` };
}
