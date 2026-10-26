import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function config(overrides = {}) {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^("|')|("|')$/g, '');
  }
  const host = overrides.host ?? process.env.HOST ?? '127.0.0.1';
  const port = overrides.port ?? Number(process.env.PORT ?? 4318);
  const publicUrl = overrides.publicUrl ?? process.env.PUBLIC_URL ?? `http://127.0.0.1:${port}`;
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!local && !publicUrl.startsWith('https://')) throw new Error('외부 공개 서버에는 HTTPS PUBLIC_URL이 필요합니다.');
  const dataDir = path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? path.join(ROOT, 'data'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dataDir, 'master.key');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  return { host, port, publicUrl: publicUrl.replace(/\/$/, ''), local, dataDir, masterKey: fs.readFileSync(keyPath),
    registration: process.env.ALLOW_REGISTRATION !== 'false', notionVersion: process.env.NOTION_API_VERSION ?? '2025-09-03', ...overrides };
}
