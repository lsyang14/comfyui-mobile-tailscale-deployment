import { readFile } from 'node:fs/promises';
import SftpClient from 'ssh2-sftp-client';

export function defaultSftpConfigPath(env = process.env) { return env.PICGO_CONFIG_PATH || 'D:/PicgoConfig/sftpUploaderConfig.json'; }

export function resolveSftpProfile(config) {
  const profile = Object.values(config || {})[0];
  if (!profile?.host || !profile?.username || !profile?.password || !profile?.uploadPath || !profile?.path || !profile?.url) throw new Error('SFTP 图床配置不完整');
  return profile;
}

function replaceTokens(template, filename, date) {
  return template.replaceAll('{year}', String(date.getFullYear())).replaceAll('{month}', String(date.getMonth() + 1).padStart(2, '0')).replaceAll('{fullName}', filename);
}

export function buildPublicUrl(profile, filename, date = new Date()) {
  return `${String(profile.url).replace(/\/$/, '')}${replaceTokens(profile.path, filename, date)}`;
}

export async function uploadWithSftp(localPath, { configPath = defaultSftpConfigPath(), date = new Date() } = {}) {
  const profile = resolveSftpProfile(JSON.parse(await readFile(configPath, 'utf8')));
  const filename = localPath.split(/[\\/]/).pop();
  const remotePath = replaceTokens(profile.uploadPath, filename, date);
  const client = new SftpClient();
  try {
    await client.connect({ host: profile.host, port: Number(profile.port || 22), username: profile.username, password: profile.password });
    await client.mkdir(remotePath.split('/').slice(0, -1).join('/'), true);
    await client.put(localPath, remotePath);
    return buildPublicUrl(profile, filename, date);
  } finally { await client.end().catch(() => {}); }
}
