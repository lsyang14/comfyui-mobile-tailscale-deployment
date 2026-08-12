import { spawn } from 'node:child_process';

export function extractPicgoUrls(output) {
  const urls = output.match(/https?:\/\/[^\s\]]+/g) ?? [];
  if (!urls.length) throw new Error('PicGo 输出中没有找到图片 URL');
  return urls;
}

export function uploadWithPicgo(localPath, { configPath } = {}) {
  const args = ['picgo', 'upload', localPath];
  if (configPath) args.push('-c', configPath);
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', ...args], { windowsHide: true, shell: false });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`PicGo 上传失败 (${code}): ${stderr.trim() || stdout.trim()}`));
      try { resolve(extractPicgoUrls(stdout)); } catch (error) { reject(error); }
    });
  });
}
