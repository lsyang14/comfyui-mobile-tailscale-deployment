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

export async function uploadWithPicgo(localPath, { configPath } = {}) {
  const picgo = new PicGo(configPath || undefined);
  const result = await picgo.upload([localPath]);
  const urls = result?.map?.((item) => item?.imgUrl).filter(Boolean) ?? [];
  if (!urls.length) throw new Error('PicGo SDK 返回中没有图片 URL');
  return urls;
}
