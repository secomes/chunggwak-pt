import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from './core.mjs';
const scrypt = promisify(scryptCb);
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = s => createHash('sha256').update(String(s)).digest('hex');
export function equal(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); }
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new AppError(400, '비밀번호는 12~200자로 입력해 주세요.');
  const salt = randomBytes(16).toString('hex'); const digest = await scrypt(password, salt, 64);
  return `${salt}:${digest.toString('hex')}`;
}
export async function passwordMatch(password, value) {
  if (!value || typeof password !== 'string' || password.length > 200) return false;
  const [salt, digest] = value.split(':'); return equal((await scrypt(password, salt, 64)).toString('hex'), digest);
}
export function encrypt(key, value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
export function decrypt(key, value) {
  if (!value) return {};
  const b = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); cipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString('utf8'));
}
export function cookieValue(req, name) {
  return (req.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}
export function rateLimiter(limit = 30, ms = 60000) {
  const entries = new Map();
  return key => { const now = Date.now(); let v = entries.get(key); if (!v || v.until < now) { v = { count: 0, until: now + ms }; entries.set(key, v); }
    if (++v.count > limit) throw new AppError(429, '잠시 후 다시 시도해 주세요.');
    if (entries.size > 5000) for (const [k, x] of entries) if (x.until < now) entries.delete(k);
  };
}
