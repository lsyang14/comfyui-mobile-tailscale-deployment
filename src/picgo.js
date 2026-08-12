import { randomBytes } from 'node:crypto';
import { PicGo } from 'picgo';

export function extractPicgoUrls(output) {
  const urls = output.match(/https?:\/\/[^\s\]]+/g) ?? [];
  if (!urls.length) throw new Error('PicGo 输出中没有找到图片 URL');
  return urls;
}

export function makeUniqueImageName(originalName, date = new Date(), suffix = randomBytes(3).toString('hex')) {
  const safe = String(originalName).replace(/[^\w.-]/g, '_');
  const dot = safe.lastIndexOf('.');
  const extension = dot > 0 ? safe.slice(dot).toLowerCase() : '.png';
  const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'), String(date.getHours()).padStart(2, '0'), String(date.getMinutes()).padStart(2, '0'), String(date.getSeconds()).padStart(2, '0'), String(date.getMilliseconds()).padStart(3, '0')].join('');
  return `${stamp}-${suffix}${extension}`;
}

export function extractPicgoResultUrls(result, fallbackOutput = []) {
  const items = Array.isArray(result) ? result : fallbackOutput;
  const urls = items.map((item) => item?.imgUrl || item?.url).filter(Boolean);
  if (!urls.length) throw new Error('PicGo SDK 返回中没有图片 URL');
  return urls;
}

export function extractPicgoApiUrls(payload) {
  if (!payload?.success || !Array.isArray(payload.result) || !payload.result.length) throw new Error(`PicGo 上传失败: ${payload?.message || '没有返回图片 URL'}`);
  return payload.result.filter((url) => typeof url === 'string' && /^https?:\/\//.test(url));
}

export async function uploadWithPicgo(localPath, { serverUrl = process.env.PICGO_SERVER_URL || 'http://127.0.0.1:36677' } = {}) {
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/upload`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ list: [localPath] })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`PicGo API HTTP ${response.status}: ${payload.message || '上传失败'}`);
  return extractPicgoApiUrls(payload);
}
