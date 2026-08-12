import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export async function loadPicgoConfig(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const site = raw.site1;
  if (!site?.host || !site?.port || !site?.username || !site?.password || !site?.path || !site?.uploadPath || !site?.url) throw new Error('PicGo SFTP 配置不完整');
  return site;
}

function replaceTokens(template, filename, date = new Date()) {
  return template.replaceAll('{year}', String(date.getFullYear())).replaceAll('{month}', String(date.getMonth() + 1).padStart(2, '0')).replaceAll('{fullName}', filename);
}

export function makeUploadTarget(site, filename, date = new Date()) {
  const remotePath = replaceTokens(site.uploadPath, filename, date);
  const publicPath = replaceTokens(site.path, filename, date);
  return { remotePath, publicUrl: `${site.url.replace(/\/$/, '')}${publicPath}` };
}

export function uploadWithCurl(site, localPath, filename, date = new Date()) {
  const target = makeUploadTarget(site, filename, date);
  const sftpUrl = `sftp://${site.host}:${site.port}${encodeURI(target.remotePath).replace(/#/g, '%23')}`;
  return new Promise((resolve, reject) => {
    const child = spawn('curl.exe', ['--fail', '--silent', '--show-error', '--user', `${site.username}:${site.password}`, '--upload-file', localPath, sftpUrl], { windowsHide: true });
    let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(target.publicUrl) : reject(new Error(`SFTP 上传失败 (${code}): ${stderr.trim()}`)));
  });
}
