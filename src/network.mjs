import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from './core.mjs';

export function isPublicAddress(ip) {
  if (ip.includes(':')) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPublicAddress(x.slice(7));
    return /^(2|3)[0-9a-f]{0,3}:/.test(x) && !x.startsWith('2001:db8:');
  }
  const a = ip.split('.').map(Number); if (a.length !== 4 || a.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return !(a[0] === 0 || a[0] === 10 || a[0] === 127 || a[0] >= 224 || (a[0] === 169 && a[1] === 254) || (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && (a[1] === 168 || a[1] === 0 || a[1] === 2)) || (a[0] === 100 && a[1] >= 64 && a[1] <= 127) || (a[0] === 198 && [18, 19, 51].includes(a[1])) || (a[0] === 203 && a[1] === 0));
}
// Resolve once, reject every private result, and pin the checked address to the request.
export async function publicJson(url, { headers = {}, body, method = 'GET', maxBytes = 2_000_000 } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.port && u.port !== '443' || u.username || u.password) throw new AppError(400, '서비스 주소는 인증정보 없는 공개 HTTPS 주소여야 합니다.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError(400, '내부망·로컬 주소는 서비스로 연결할 수 없습니다.');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method, headers: { Accept: 'application/json', ...headers }, lookup: (_host, options, cb) => options?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return reject(new AppError(400, '다른 주소로 이동하는 서비스는 직접 주소로 등록해 주세요.')); }
      let size = 0, chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > maxBytes) { req.destroy(new AppError(413, '응답이 너무 큽니다.')); return; } chunks.push(chunk); });
      res.on('end', () => { let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return reject(new AppError(502, '서비스에서 JSON 응답을 받지 못했습니다.')); }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new AppError(res.statusCode === 401 || res.statusCode === 403 ? 424 : 502, res.statusCode === 401 ? '서비스 로그인을 다시 연결해 주세요.' : res.statusCode === 403 ? '서비스 권한 또는 학교 관리자 승인이 필요합니다.' : `서비스 응답 오류 (${res.statusCode})`, `provider_${res.statusCode}`));
        resolve(value);
      });
    });
    req.setTimeout(20000, () => req.destroy(new AppError(504, '서비스 응답 시간이 초과되었습니다.')));
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
