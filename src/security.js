export function securityHeaders() { return { 'content-security-policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' }; }
export function publicError() { return { error: '服务暂时不可用', code: 'INTERNAL_ERROR' }; }
export function isAllowedOrigin(origin, appOrigin) { if (!origin || !appOrigin) return false; try { return new URL(origin).origin === new URL(appOrigin).origin; } catch { return false; } }
export function rateLimit({ limit = 10, windowMs = 60000 } = {}) { const buckets = new Map(); return (key) => { const now = Date.now(); const item = buckets.get(key); if (!item || now - item.startedAt >= windowMs) { buckets.set(key, { startedAt: now, count: 1 }); return true; } item.count += 1; return item.count <= limit; }; }
export function isSafeImageUrl(rawUrl, allowlist = []) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    let host = url.hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return false;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (allowlist.length > 0 && !allowlist.includes(host)) return false;
    return true;
  } catch { return false; }
}
